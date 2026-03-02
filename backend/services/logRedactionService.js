// backend/services/logRedactionService.js
// Issue #650: Fine-Grained Log Redaction Engine
// Implements configurable field-level redaction and tokenization for PII protection

import crypto from 'crypto';
import { db } from '../config/db.js';
import { eq, and, gte, lte } from 'drizzle-orm';
import { logInfo, logError, logWarn } from '../utils/logger.js';
import { getRedisClient } from '../config/redis.js';

const REDACTION_TYPES = {
    MASK: 'mask',
    HASH: 'hash',
    TOKENIZE: 'tokenize',
    REMOVE: 'remove'
};

const SENSITIVE_FIELD_TYPES = {
    EMAIL: 'email',
    PHONE: 'phone',
    SSN: 'ssn',
    CREDIT_CARD: 'credit_card',
    ADDRESS: 'address',
    NAME: 'name',
    IP_ADDRESS: 'ip_address',
    API_KEY: 'api_key',
    PASSWORD: 'password',
    CUSTOM: 'custom'
};

const TOKEN_PREFIX = 'REDACTED_';
const CACHE_TTL = 3600; // 1 hour

/**
 * Redact sensitive data from log entries
 */
export async function redactLogEntry(logEntry, tenantId) {
    try {
        // Get redaction rules for tenant
        const rules = await getRedactionRules(tenantId);

        if (!rules || rules.length === 0) {
            return logEntry; // No redaction needed
        }

        let redactedEntry = { ...logEntry };
        const redactionMetadata = {
            redactedFields: [],
            tokenMap: {}
        };

        // Apply each rule
        for (const rule of rules) {
            if (!rule.isActive) continue;

            redactedEntry = await applyRedactionRule(redactedEntry, rule, redactionMetadata);
        }

        // Add redaction metadata if any fields were redacted
        if (redactionMetadata.redactedFields.length > 0) {
            redactedEntry._redaction = redactionMetadata;
        }

        return redactedEntry;

    } catch (error) {
        logError('Log redaction failed', { error: error.message, tenantId });
        // Return original entry if redaction fails
        return logEntry;
    }
}

/**
 * Apply a single redaction rule
 */
async function applyRedactionRule(logEntry, rule, metadata) {
    const { fieldPath, redactionType, fieldType, pattern } = rule;
    const value = getNestedValue(logEntry, fieldPath);

    if (value === undefined || value === null) {
        return logEntry; // Field doesn't exist
    }

    // Check if field matches the pattern (if specified)
    if (pattern && !matchesPattern(value, pattern)) {
        return logEntry; // Doesn't match pattern
    }

    // Check if field matches the field type
    if (!matchesFieldType(value, fieldType)) {
        return logEntry; // Doesn't match field type
    }

    // Apply redaction
    const redactedValue = await applyRedaction(value, redactionType, rule);
    const updatedEntry = setNestedValue(logEntry, fieldPath, redactedValue);

    // Track redaction
    metadata.redactedFields.push({
        field: fieldPath,
        type: redactionType,
        originalType: typeof value
    });

    // Store token mapping for reversible redaction
    if (redactionType === REDACTION_TYPES.TOKENIZE) {
        metadata.tokenMap[redactedValue] = {
            field: fieldPath,
            originalValue: value,
            timestamp: new Date().toISOString()
        };
    }

    return updatedEntry;
}

/**
 * Apply specific redaction type
 */
async function applyRedaction(value, redactionType, rule) {
    switch (redactionType) {
        case REDACTION_TYPES.MASK:
            return maskValue(value, rule.maskChar, rule.maskLength);

        case REDACTION_TYPES.HASH:
            return hashValue(value, rule.hashAlgorithm);

        case REDACTION_TYPES.TOKENIZE:
            return tokenizeValue(value, rule.encryptionKey);

        case REDACTION_TYPES.REMOVE:
            return '[REDACTED]';

        default:
            return value;
    }
}

/**
 * Mask a value
 */
function maskValue(value, maskChar = '*', maskLength = null) {
    const str = String(value);
    const length = maskLength || str.length;

    if (length <= 0) return str;

    // Show first and last characters for context
    if (str.length > 4) {
        const visibleChars = Math.min(2, Math.floor(str.length / 4));
        const start = str.substring(0, visibleChars);
        const end = str.substring(str.length - visibleChars);
        const masked = maskChar.repeat(str.length - (visibleChars * 2));
        return start + masked + end;
    }

    return maskChar.repeat(length);
}

/**
 * Hash a value
 */
function hashValue(value, algorithm = 'sha256') {
    return crypto.createHash(algorithm).update(String(value)).digest('hex');
}

/**
 * Tokenize a value (reversible)
 */
async function tokenizeValue(value, encryptionKey) {
    const str = String(value);
    const token = crypto.randomUUID();
    const fullToken = `${TOKEN_PREFIX}${token}`;

    // Store the mapping (in production, use secure storage)
    const redis = getRedisClient();
    if (redis) {
        await redis.setex(`redaction:${fullToken}`, CACHE_TTL, str);
    }

    return fullToken;
}

/**
 * Detokenize a value
 */
export async function detokenizeValue(token) {
    if (!token.startsWith(TOKEN_PREFIX)) {
        return token; // Not a token
    }

    const redis = getRedisClient();
    if (redis) {
        const originalValue = await redis.get(`redaction:${token}`);
        return originalValue || token; // Return original or token if not found
    }

    return token;
}

/**
 * Get nested value from object
 */
function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Set nested value in object
 */
function setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
        if (!(key in current)) current[key] = {};
        return current[key];
    }, obj);

    target[lastKey] = value;
    return obj;
}

/**
 * Check if value matches pattern
 */
function matchesPattern(value, pattern) {
    try {
        const regex = new RegExp(pattern);
        return regex.test(String(value));
    } catch (error) {
        logWarn('Invalid regex pattern', { pattern, error: error.message });
        return false;
    }
}

/**
 * Check if value matches field type
 */
function matchesFieldType(value, fieldType) {
    const str = String(value);

    switch (fieldType) {
        case SENSITIVE_FIELD_TYPES.EMAIL:
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);

        case SENSITIVE_FIELD_TYPES.PHONE:
            return /^[\+]?[1-9][\d]{0,15}$/.test(str.replace(/[\s\-\(\)]/g, ''));

        case SENSITIVE_FIELD_TYPES.SSN:
            return /^\d{3}-?\d{2}-?\d{4}$/.test(str);

        case SENSITIVE_FIELD_TYPES.CREDIT_CARD:
            return /^\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}$/.test(str);

        case SENSITIVE_FIELD_TYPES.IP_ADDRESS:
            return /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(str) ||
                   /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(str); // IPv6

        case SENSITIVE_FIELD_TYPES.API_KEY:
            return /^[A-Za-z0-9_\-]{20,}$/.test(str); // Long alphanumeric

        case SENSITIVE_FIELD_TYPES.PASSWORD:
            return str.length >= 8; // Assume any string >= 8 chars could be password

        case SENSITIVE_FIELD_TYPES.CUSTOM:
            return true; // Custom patterns handled separately

        default:
            return true; // Unknown type, allow
    }
}

/**
 * Get redaction rules for tenant
 */
async function getRedactionRules(tenantId) {
    const cacheKey = `redaction_rules:${tenantId}`;
    const redis = getRedisClient();

    // Try cache first
    if (redis) {
        const cached = await redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }
    }

    // Query database
    const result = await db.execute(`
        SELECT * FROM log_redaction_rules
        WHERE tenant_id = $1 AND is_active = true
        ORDER BY priority ASC, created_at ASC
    `, [tenantId]);

    const rules = result || [];

    // Cache result
    if (redis) {
        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(rules));
    }

    return rules;
}

/**
 * Create redaction rule
 */
export async function createRedactionRule(tenantId, ruleData) {
    const rule = {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        field_path: ruleData.fieldPath,
        redaction_type: ruleData.redactionType,
        field_type: ruleData.fieldType,
        pattern: ruleData.pattern,
        mask_char: ruleData.maskChar || '*',
        mask_length: ruleData.maskLength,
        hash_algorithm: ruleData.hashAlgorithm || 'sha256',
        encryption_key: ruleData.encryptionKey,
        priority: ruleData.priority || 0,
        is_active: ruleData.isActive !== false,
        description: ruleData.description,
        created_by: ruleData.createdBy,
        created_at: new Date(),
        updated_at: new Date()
    };

    await db.execute(`
        INSERT INTO log_redaction_rules (
            id, tenant_id, field_path, redaction_type, field_type, pattern,
            mask_char, mask_length, hash_algorithm, encryption_key, priority,
            is_active, description, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    `, [
        rule.id, rule.tenant_id, rule.field_path, rule.redaction_type, rule.field_type,
        rule.pattern, rule.mask_char, rule.mask_length, rule.hash_algorithm,
        rule.encryption_key, rule.priority, rule.is_active, rule.description,
        rule.created_by, rule.created_at, rule.updated_at
    ]);

    // Invalidate cache
    const redis = getRedisClient();
    if (redis) {
        await redis.del(`redaction_rules:${tenantId}`);
    }

    return rule;
}

/**
 * Update redaction rule
 */
export async function updateRedactionRule(ruleId, tenantId, updates) {
    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined) {
            updateFields.push(`${key} = $${paramIndex}`);
            values.push(updates[key]);
            paramIndex++;
        }
    });

    if (updateFields.length === 0) return;

    updateFields.push(`updated_at = $${paramIndex}`);
    values.push(new Date(), ruleId, tenantId);
    paramIndex += 2;

    await db.execute(`
        UPDATE log_redaction_rules
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex - 1} AND tenant_id = $${paramIndex}
    `, values);

    // Invalidate cache
    const redis = getRedisClient();
    if (redis) {
        await redis.del(`redaction_rules:${tenantId}`);
    }
}

/**
 * Delete redaction rule
 */
export async function deleteRedactionRule(ruleId, tenantId) {
    await db.execute(`
        DELETE FROM log_redaction_rules
        WHERE id = $1 AND tenant_id = $2
    `, [ruleId, tenantId]);

    // Invalidate cache
    const redis = getRedisClient();
    if (redis) {
        await redis.del(`redaction_rules:${tenantId}`);
    }
}

/**
 * List redaction rules
 */
export async function listRedactionRules(tenantId) {
    return await getRedactionRules(tenantId);
}

/**
 * Test redaction rule
 */
export async function testRedactionRule(tenantId, ruleData, testValue) {
    const testLogEntry = { testField: testValue };
    const testRule = {
        ...ruleData,
        fieldPath: 'testField',
        isActive: true
    };

    const metadata = { redactedFields: [], tokenMap: {} };
    const result = await applyRedactionRule(testLogEntry, testRule, metadata);

    return {
        originalValue: testValue,
        redactedValue: result.testField,
        wasRedacted: metadata.redactedFields.length > 0,
        metadata
    };
}

export {
    REDACTION_TYPES,
    SENSITIVE_FIELD_TYPES
};