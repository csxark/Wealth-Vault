// backend/services/bulkImportService.js
// Issue #636: Bulk Expense Import & Auto-Reconciliation Service

import db from '../config/db.js';
import cacheService from './cacheService.js';
import outboxService from './outboxService.js';
import crypto from 'crypto';
import { parse } from 'csv-parse/sync';

const CACHE_TTL = {
    SESSIONS: 1800,
    MAPPINGS: 3600,
    CONNECTIONS: 1800
};

const DUPLICATE_THRESHOLD = 80; // Score above which we consider it a duplicate
const AUTO_MATCH_THRESHOLD = 85; // Score above which we auto-match

/**
 * Create a new import session
 */
export async function createImportSession(tenantId, userId, sessionData) {
    try {
        const sessionId = crypto.randomUUID();

        const result = await db.execute(
            `INSERT INTO import_sessions 
            (id, tenant_id, user_id, session_name, import_source, file_name, file_size,
             auto_categorize, auto_match, skip_duplicates, currency)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *`,
            [
                sessionId, tenantId, userId,
                sessionData.sessionName || `Import ${new Date().toISOString()}`,
                sessionData.importSource || 'csv',
                sessionData.fileName,
                sessionData.fileSize || 0,
                sessionData.autoCategorize ?? true,
                sessionData.autoMatch ?? true,
                sessionData.skipDuplicates ?? true,
                sessionData.currency || 'USD'
            ]
        );

        // Clear cache
        await cacheService.invalidate(`import_sessions:${tenantId}`);

        // Publish event
        await outboxService.publishEvent('import-session-created', {
            tenantId,
            userId,
            sessionId,
            importSource: sessionData.importSource
        });

        return result.rows?.[0] || null;
    } catch (error) {
        throw new Error(`Failed to create import session: ${error.message}`);
    }
}

/**
 * Parse CSV file and create import records
 */
export async function parseAndCreateRecords(tenantId, sessionId, fileContent, mappingId = null) {
    try {
        // Update session status
        await updateSessionStatus(sessionId, 'parsing');

        // Get or detect mapping
        let mapping = null;
        if (mappingId) {
            mapping = await getImportMapping(tenantId, mappingId);
        } else {
            mapping = await detectFormat(fileContent);
        }

        if (!mapping || !mapping.column_mappings) {
            throw new Error('Could not detect file format or mapping not provided');
        }

        // Parse CSV
        const records = parse(fileContent, {
            columns: false,
            skip_empty_lines: true,
            from_line: mapping.data_start_row || 2
        });

        const importRecords = [];
        let rowNumber = mapping.data_start_row || 2;

        for (const row of records) {
            try {
                const parsedRecord = mapRowToRecord(row, mapping.column_mappings, mapping);
                
                if (parsedRecord) {
                    importRecords.push({
                        tenant_id: tenantId,
                        session_id: sessionId,
                        row_number: rowNumber,
                        ...parsedRecord,
                        raw_data: JSON.stringify(row)
                    });
                }
            } catch (err) {
                console.error(`Error parsing row ${rowNumber}:`, err);
            }
            
            rowNumber++;
        }

        // Bulk insert import records
        if (importRecords.length > 0) {
            await bulkInsertImportRecords(importRecords);
        }

        // Update session with total rows
        await db.execute(
            `UPDATE import_sessions 
            SET total_rows = $1, status = 'matching', updated_at = NOW()
            WHERE id = $2`,
            [importRecords.length, sessionId]
        );

        // Publish event
        await outboxService.publishEvent('import-records-parsed', {
            tenantId,
            sessionId,
            recordCount: importRecords.length
        });

        return {
            sessionId,
            recordCount: importRecords.length,
            mapping: mapping.template_name || 'auto-detected'
        };
    } catch (error) {
        await updateSessionStatus(sessionId, 'failed', error.message);
        throw new Error(`Failed to parse file: ${error.message}`);
    }
}

/**
 * Map CSV row to import record fields
 */
function mapRowToRecord(row, columnMappings, mapping) {
    const record = {};

    for (const [csvColumn, fieldName] of Object.entries(columnMappings)) {
        const columnIndex = parseInt(csvColumn);
        const value = row[columnIndex];

        if (value === undefined || value === null || value === '') continue;

        switch (fieldName) {
            case 'transaction_date':
                record.transaction_date = parseDate(value, mapping.date_format);
                break;
            case 'amount':
                record.amount = parseAmount(value, mapping);
                break;
            case 'description':
                record.description = value;
                break;
            case 'merchant_name':
                record.merchant_name = value;
                break;
            case 'category':
                record.category = value;
                break;
            case 'account_name':
                record.account_name = value;
                break;
            case 'reference_number':
                record.reference_number = value;
                break;
        }
    }

    // Validate required fields
    if (!record.transaction_date || !record.amount) {
        return null;
    }

    return record;
}

/**
 * Parse date from various formats
 */
function parseDate(dateString, format = null) {
    // Common date formats
    const formats = [
        /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
        /^(\d{2})\/(\d{2})\/(\d{4})$/, // MM/DD/YYYY
        /^(\d{2})-(\d{2})-(\d{4})$/, // DD-MM-YYYY
        /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/ // M/D/YY or MM/DD/YYYY
    ];

    for (const regex of formats) {
        const match = dateString.match(regex);
        if (match) {
            // Parse based on regex pattern
            if (regex.source.includes('\\d{4}-')) {
                return new Date(match[1], match[2] - 1, match[3]);
            } else if (regex.source.includes('\\/')) {
                return new Date(match[3], match[1] - 1, match[2]);
            }
        }
    }

    // Fallback to Date.parse
    const parsed = new Date(dateString);
    if (!isNaN(parsed.getTime())) {
        return parsed;
    }

    throw new Error(`Unable to parse date: ${dateString}`);
}

/**
 * Parse amount from string
 */
function parseAmount(amountString, mapping) {
    // Remove currency symbols and thousands separators
    let cleaned = amountString.toString()
        .replace(/[$€£¥,]/g, '')
        .trim();

    // Handle negative amounts in parentheses (accounting format)
    if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
        cleaned = '-' + cleaned.slice(1, -1);
    }

    const amount = parseFloat(cleaned);

    if (isNaN(amount)) {
        throw new Error(`Invalid amount: ${amountString}`);
    }

    // Apply inversion if configured
    return mapping.invert_amounts ? -amount : amount;
}

/**
 * Bulk insert import records
 */
async function bulkInsertImportRecords(records) {
    const values = [];
    const placeholders = [];
    let paramIndex = 1;

    for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const id = crypto.randomUUID();
        
        placeholders.push(
            `($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3}, $${paramIndex+4}, 
              $${paramIndex+5}, $${paramIndex+6}, $${paramIndex+7}, $${paramIndex+8}, $${paramIndex+9})`
        );
        
        values.push(
            id, r.tenant_id, r.session_id, r.row_number, r.transaction_date,
            r.amount, r.description || null, r.merchant_name || null, 
            r.category || null, r.raw_data || '{}'
        );
        
        paramIndex += 10;
    }

    await db.execute(
        `INSERT INTO import_records 
        (id, tenant_id, session_id, row_number, transaction_date, amount, description, 
         merchant_name, category, raw_data)
        VALUES ${placeholders.join(', ')}`,
        values
    );
}

/**
 * Detect duplicates in import session
 */
export async function detectDuplicates(tenantId, sessionId) {
    try {
        await updateSessionStatus(sessionId, 'matching');

        // Call database function to detect duplicates
        const result = await db.execute(
            `SELECT * FROM detect_duplicates_for_session($1)`,
            [sessionId]
        );

        const duplicates = result.rows || [];

        // Update import records with duplicate information
        for (const dup of duplicates) {
            await db.execute(
                `UPDATE import_records
                SET is_duplicate = true,
                    duplicate_of_expense_id = $1,
                    duplicate_score = $2,
                    match_status = 'duplicate',
                    updated_at = NOW()
                WHERE id = $3`,
                [dup.duplicate_expense_id, dup.duplicate_score, dup.import_record_id]
            );
        }

        // Update session stats
        await db.execute(
            `UPDATE import_sessions
            SET duplicates_found = $1, updated_at = NOW()
            WHERE id = $2`,
            [duplicates.length, sessionId]
        );

        return {
            sessionId,
            duplicatesFound: duplicates.length
        };
    } catch (error) {
        throw new Error(`Failed to detect duplicates: ${error.message}`);
    }
}

/**
 * Auto-match import records with existing expenses
 */
export async function autoMatchRecords(tenantId, sessionId, confidenceThreshold = AUTO_MATCH_THRESHOLD) {
    try {
        // Call database function for auto-matching
        const result = await db.execute(
            `SELECT auto_match_import_session($1, $2)`,
            [sessionId, confidenceThreshold]
        );

        const matchedCount = result.rows?.[0]?.auto_match_import_session || 0;

        // Update session status
        await updateSessionStatus(sessionId, 'reviewing');

        // Publish event
        await outboxService.publishEvent('import-auto-matched', {
            tenantId,
            sessionId,
            matchedCount
        });

        return {
            sessionId,
            matchedCount
        };
    } catch (error) {
        throw new Error(`Failed to auto-match records: ${error.message}`);
    }
}

/**
 * Get import session details with records
 */
export async function getImportSession(tenantId, sessionId) {
    try {
        const cacheKey = `import_session:${sessionId}`;
        const cached = await cacheService.get(cacheKey);
        
        if (cached) return cached;

        const sessionResult = await db.execute(
            `SELECT * FROM import_sessions WHERE id = $1 AND tenant_id = $2`,
            [sessionId, tenantId]
        );

        const session = sessionResult.rows?.[0];
        if (!session) return null;

        // Get summary statistics
        const recordsResult = await db.execute(
            `SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE match_status = 'duplicate') as duplicates,
                COUNT(*) FILTER (WHERE match_status = 'auto_matched') as auto_matched,
                COUNT(*) FILTER (WHERE match_status = 'pending') as pending,
                COUNT(*) FILTER (WHERE is_imported = true) as imported
            FROM import_records
            WHERE session_id = $1`,
            [sessionId]
        );

        const stats = recordsResult.rows?.[0] || {};

        const result = {
            ...session,
            statistics: {
                total: parseInt(stats.total || 0),
                duplicates: parseInt(stats.duplicates || 0),
                autoMatched: parseInt(stats.auto_matched || 0),
                pending: parseInt(stats.pending || 0),
                imported: parseInt(stats.imported || 0)
            }
        };

        await cacheService.set(cacheKey, result, CACHE_TTL.SESSIONS);
        return result;
    } catch (error) {
        throw new Error(`Failed to get import session: ${error.message}`);
    }
}

/**
 * Get import records for review
 */
export async function getImportRecordsForReview(tenantId, sessionId, status = 'pending', limit = 50, offset = 0) {
    try {
        const result = await db.execute(
            `SELECT * FROM import_records
            WHERE session_id = $1 AND tenant_id = $2 AND match_status = $3
            ORDER BY transaction_date DESC
            LIMIT $4 OFFSET $5`,
            [sessionId, tenantId, status, limit, offset]
        );

        return result.rows || [];
    } catch (error) {
        throw new Error(`Failed to get import records: ${error.message}`);
    }
}

/**
 * Approve or reject a match
 */
export async function reviewMatch(tenantId, matchId, action, userId, notes = null) {
    try {
        const result = await db.execute(
            `UPDATE reconciliation_matches
            SET review_status = $1,
                action_taken = $2,
                reviewed_by = $3,
                reviewed_at = NOW(),
                action_notes = $4,
                updated_at = NOW()
            WHERE id = $5 AND tenant_id = $6
            RETURNING *`,
            ['reviewed', action, userId, notes, matchId, tenantId]
        );

        const match = result.rows?.[0];

        if (match && action === 'approve') {
            // Mark import record as matched
            await db.execute(
                `UPDATE import_records
                SET match_status = 'manual_matched',
                    updated_at = NOW()
                WHERE id = $1`,
                [match.import_record_id]
            );
        } else if (match && action === 'reject') {
            // Mark import record as needing new expense
            await db.execute(
                `UPDATE import_records
                SET match_status = 'new',
                    matched_expense_id = NULL,
                    updated_at = NOW()
                WHERE id = $1`,
                [match.import_record_id]
            );
        }

        // Invalidate cache
        await cacheService.invalidate(`import_session:${match.session_id}`);

        return match;
    } catch (error) {
        throw new Error(`Failed to review match: ${error.message}`);
    }
}

/**
 * Execute import - create expenses from approved records
 */
export async function executeImport(tenantId, sessionId, userId) {
    try {
        await updateSessionStatus(sessionId, 'completed');

        // Get all records marked for import
        const recordsResult = await db.execute(
            `SELECT * FROM import_records
            WHERE session_id = $1 
              AND tenant_id = $2
              AND match_status IN ('new', 'manual_matched')
              AND is_imported = false`,
            [sessionId, tenantId]
        );

        const records = recordsResult.rows || [];
        let createdCount = 0;
        let matchedCount = 0;

        for (const record of records) {
            if (record.match_status === 'new') {
                // Create new expense
                const expenseId = crypto.randomUUID();
                
                await db.execute(
                    `INSERT INTO expenses 
                    (id, tenant_id, user_id, amount, date, merchant, category, description)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [
                        expenseId, tenantId, userId,
                        record.amount, record.transaction_date,
                        record.merchant_name, record.category || 'Uncategorized',
                        record.description
                    ]
                );

                // Mark as imported
                await db.execute(
                    `UPDATE import_records
                    SET is_imported = true,
                        imported_expense_id = $1,
                        updated_at = NOW()
                    WHERE id = $2`,
                    [expenseId, record.id]
                );

                createdCount++;
            } else if (record.match_status === 'manual_matched') {
                // Just mark as imported (already matched to existing)
                await db.execute(
                    `UPDATE import_records
                    SET is_imported = true,
                        updated_at = NOW()
                    WHERE id = $1`,
                    [record.id]
                );

                matchedCount++;
            }
        }

        // Create import history record
        await db.execute(
            `INSERT INTO import_history
            (tenant_id, session_id, import_source, total_rows, rows_imported, rows_skipped,
             new_expenses_created, existing_expenses_matched, performed_by)
            SELECT tenant_id, id, import_source, total_rows, rows_imported, rows_skipped,
                   $1, $2, $3
            FROM import_sessions
            WHERE id = $4`,
            [createdCount, matchedCount, userId, sessionId]
        );

        // Publish event
        await outboxService.publishEvent('import-completed', {
            tenantId,
            sessionId,
            createdCount,
            matchedCount
        });

        return {
            sessionId,
            newExpensesCreated: createdCount,
            existingExpensesMatched: matchedCount,
            totalProcessed: createdCount + matchedCount
        };
    } catch (error) {
        await updateSessionStatus(sessionId, 'failed', error.message);
        throw new Error(`Failed to execute import: ${error.message}`);
    }
}

/**
 * Detect file format and suggest mapping
 */
export async function detectFormat(fileContent) {
    // Parse first few rows to analyze structure
    const preview = parse(fileContent, {
        columns: false,
        to_line: 10
    });

    if (!preview || preview.length < 2) {
        throw new Error('File appears empty or invalid');
    }

    const headers = preview[0];
    const columnMappings = {};

    // Common column name patterns
    const patterns = {
        transaction_date: /date|posted|trans.*date/i,
        amount: /amount|price|value|total/i,
        description: /description|memo|details|note/i,
        merchant_name: /merchant|vendor|payee|name/i,
        category: /category|type|class/i,
        reference_number: /ref|reference|transaction.*id|conf/i
    };

    // Map columns based on headers
    headers.forEach((header, index) => {
        for (const [field, pattern] of Object.entries(patterns)) {
            if (pattern.test(header)) {
                columnMappings[index] = field;
                break;
            }
        }
    });

    return {
        template_name: 'auto-detected',
        column_mappings: columnMappings,
        header_row: 1,
        data_start_row: 2,
        date_format: 'auto',
        decimal_separator: '.',
        thousands_separator: ',',
        currency: 'USD'
    };
}

/**
 * Get import mapping by ID
 */
async function getImportMapping(tenantId, mappingId) {
    const result = await db.execute(
        `SELECT * FROM import_mappings WHERE id = $1 AND tenant_id = $2`,
        [mappingId, tenantId]
    );
    return result.rows?.[0] || null;
}

/**
 * Update session status
 */
async function updateSessionStatus(sessionId, status, errorMessage = null) {
    const updates = { status, updated_at: new Date() };
    if (errorMessage) {
        updates.error_message = errorMessage;
    }

    const setClauses = Object.keys(updates).map((key, i) => `${key} = $${i + 1}`);
    const values = [...Object.values(updates), sessionId];

    await db.execute(
        `UPDATE import_sessions SET ${setClauses.join(', ')} WHERE id = $${values.length}`,
        values
    );
}

/**
 * Create import mapping template
 */
export async function createImportMapping(tenantId, userId, mappingData) {
    try {
        const mappingId = crypto.randomUUID();

        const result = await db.execute(
            `INSERT INTO import_mappings
            (id, tenant_id, user_id, template_name, description, import_source, bank_name,
             column_mappings, date_format, currency, auto_categorize)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *`,
            [
                mappingId, tenantId, userId,
                mappingData.templateName,
                mappingData.description || null,
                mappingData.importSource || 'csv',
                mappingData.bankName || null,
                JSON.stringify(mappingData.columnMappings),
                mappingData.dateFormat || 'auto',
                mappingData.currency || 'USD',
                mappingData.autoCategorize ?? true
            ]
        );

        await cacheService.invalidate(`import_mappings:${tenantId}`);

        return result.rows?.[0];
    } catch (error) {
        throw new Error(`Failed to create import mapping: ${error.message}`);
    }
}

/**
 * Get all import mappings for tenant
 */
export async function getImportMappings(tenantId) {
    try {
        const cacheKey = `import_mappings:${tenantId}`;
        const cached = await cacheService.get(cacheKey);
        
        if (cached) return cached;

        const result = await db.execute(
            `SELECT * FROM import_mappings 
            WHERE tenant_id = $1 AND is_active = true
            ORDER BY usage_count DESC, created_at DESC`,
            [tenantId]
        );

        const mappings = result.rows || [];
        await cacheService.set(cacheKey, mappings, CACHE_TTL.MAPPINGS);

        return mappings;
    } catch (error) {
        throw new Error(`Failed to get import mappings: ${error.message}`);
    }
}

/**
 * Get import history
 */
export async function getImportHistory(tenantId, limit = 20, offset = 0) {
    try {
        const result = await db.execute(
            `SELECT * FROM import_history
            WHERE tenant_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3`,
            [tenantId, limit, offset]
        );

        return result.rows || [];
    } catch (error) {
        throw new Error(`Failed to get import history: ${error.message}`);
    }
}

export default {
    createImportSession,
    parseAndCreateRecords,
    detectDuplicates,
    autoMatchRecords,
    getImportSession,
    getImportRecordsForReview,
    reviewMatch,
    executeImport,
    detectFormat,
    createImportMapping,
    getImportMappings,
    getImportHistory
};
