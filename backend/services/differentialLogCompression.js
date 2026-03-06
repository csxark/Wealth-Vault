/**
 * Differential Log Compression Strategy (#632)
 *
 * Schema-aware compression with delta encoding for repetitive metadata fields.
 * Reduces storage overhead by compressing structured log data using differential encoding.
 *
 * Features:
 * - Schema-aware compression for audit logs
 * - Delta encoding for repetitive metadata fields
 * - Dictionary-based compression for common values
 * - Automatic compression/decompression
 * - Configurable compression levels
 */

import { EventEmitter } from 'events';
import { db } from '../config/db.js';
import { auditLogs } from '../db/schema.js';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { getRedisClient } from '../config/redis.js';
import { logInfo, logError, logWarn } from '../utils/logger.js';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

class DifferentialLogCompression {
    constructor() {
        this.redis = null;
        this.compressionEnabled = true;
        this.compressionLevel = 6; // zlib compression level (1-9)
        this.deltaEncodingEnabled = true;
        this.dictionaryEnabled = true;

        // Compression dictionaries for common values
        this.dictionaries = {
            actions: new Map(),
            userAgents: new Map(),
            ipAddresses: new Map(),
            paths: new Map(),
            methods: new Map(),
            categories: new Map()
        };

        // Delta encoding state
        this.lastEntries = new Map(); // tenantId -> last log entry
        this.deltaThreshold = 0.7; // Similarity threshold for delta encoding

        // Compression statistics
        this.stats = {
            totalLogsProcessed: 0,
            totalCompressedSize: 0,
            totalOriginalSize: 0,
            compressionRatio: 0,
            deltaEncodedCount: 0,
            dictionaryHits: 0
        };
    }

    /**
     * Initialize the compression service
     */
    async initialize() {
        try {
            logInfo('Initializing Differential Log Compression...');

            // Connect to Redis for caching dictionaries
            this.redis = await getRedisClient();

            // Load existing dictionaries from Redis
            await this.loadDictionaries();

            // Build initial dictionaries from recent logs
            await this.buildInitialDictionaries();

            logInfo('Differential Log Compression initialized successfully');
        } catch (error) {
            logError('Failed to initialize log compression', { error: error.message });
            throw error;
        }
    }

    /**
     * Compress a log entry using differential encoding
     */
    async compressLogEntry(logEntry, tenantId) {
        try {
            this.stats.totalLogsProcessed++;

            // Create a copy of the log entry for compression
            const compressedEntry = { ...logEntry };

            // Apply dictionary compression
            if (this.dictionaryEnabled) {
                compressedEntry._compressed = this.applyDictionaryCompression(compressedEntry);
            }

            // Apply delta encoding if similar to last entry
            if (this.deltaEncodingEnabled && tenantId) {
                const deltaResult = this.applyDeltaEncoding(compressedEntry, tenantId);
                if (deltaResult.isDelta) {
                    compressedEntry._delta = deltaResult.delta;
                    compressedEntry._baseId = deltaResult.baseId;
                    this.stats.deltaEncodedCount++;
                }
            }

            // Apply schema-aware compression
            const schemaCompressed = this.applySchemaCompression(compressedEntry);

            // Apply final gzip compression
            const jsonString = JSON.stringify(schemaCompressed);
            this.stats.totalOriginalSize += Buffer.byteLength(jsonString, 'utf8');

            const compressed = await gzip(jsonString, { level: this.compressionLevel });
            this.stats.totalCompressedSize += compressed.length;

            // Update compression ratio
            this.updateCompressionRatio();

            return {
                compressed: compressed.toString('base64'),
                metadata: {
                    originalSize: Buffer.byteLength(jsonString, 'utf8'),
                    compressedSize: compressed.length,
                    compressionRatio: (Buffer.byteLength(jsonString, 'utf8') / compressed.length).toFixed(2),
                    isDeltaEncoded: !!compressedEntry._delta,
                    dictionaryHits: compressedEntry._compressed?.length || 0
                }
            };
        } catch (error) {
            logError('Failed to compress log entry', { error: error.message, logEntry });
            // Return uncompressed entry on failure
            return {
                compressed: JSON.stringify(logEntry),
                metadata: {
                    originalSize: Buffer.byteLength(JSON.stringify(logEntry), 'utf8'),
                    compressedSize: Buffer.byteLength(JSON.stringify(logEntry), 'utf8'),
                    compressionRatio: 1.0,
                    isDeltaEncoded: false,
                    dictionaryHits: 0
                }
            };
        }
    }

    /**
     * Decompress a log entry
     */
    async decompressLogEntry(compressedData, tenantId) {
        try {
            // Decompress gzip
            const compressed = Buffer.from(compressedData, 'base64');
            const decompressed = await gunzip(compressed);
            const jsonString = decompressed.toString('utf8');

            let entry = JSON.parse(jsonString);

            // Reverse delta encoding
            if (entry._delta && tenantId) {
                entry = await this.reverseDeltaEncoding(entry, tenantId);
            }

            // Reverse dictionary compression
            if (entry._compressed) {
                entry = this.reverseDictionaryCompression(entry);
            }

            // Clean up compression metadata
            delete entry._compressed;
            delete entry._delta;
            delete entry._baseId;

            return entry;
        } catch (error) {
            logError('Failed to decompress log entry', { error: error.message });
            throw new Error(`Decompression failed: ${error.message}`);
        }
    }

    /**
     * Apply dictionary-based compression
     */
    applyDictionaryCompression(entry) {
        const compressed = {};

        // Compress common fields using dictionaries
        Object.keys(this.dictionaries).forEach(dictName => {
            const dict = this.dictionaries[dictName];
            const fieldName = this.getFieldNameForDictionary(dictName);

            if (entry[fieldName] && dict.has(entry[fieldName])) {
                compressed[fieldName] = dict.get(entry[fieldName]);
                this.stats.dictionaryHits++;
            }
        });

        return compressed;
    }

    /**
     * Reverse dictionary compression
     */
    reverseDictionaryCompression(entry) {
        const decompressed = { ...entry };

        if (entry._compressed) {
            Object.keys(entry._compressed).forEach(fieldName => {
                const dictName = this.getDictionaryNameForField(fieldName);
                const dict = this.dictionaries[dictName];

                if (dict.has(entry._compressed[fieldName])) {
                    decompressed[fieldName] = dict.get(entry._compressed[fieldName]);
                }
            });
        }

        return decompressed;
    }

    /**
     * Apply delta encoding for similar entries
     */
    applyDeltaEncoding(entry, tenantId) {
        const lastEntry = this.lastEntries.get(tenantId);

        if (!lastEntry) {
            this.lastEntries.set(tenantId, { ...entry, _id: entry.id });
            return { isDelta: false };
        }

        // Calculate similarity score
        const similarity = this.calculateSimilarity(entry, lastEntry);

        if (similarity >= this.deltaThreshold) {
            // Create delta
            const delta = this.createDelta(entry, lastEntry);

            // Store current entry for next comparison
            this.lastEntries.set(tenantId, { ...entry, _id: entry.id });

            return {
                isDelta: true,
                delta,
                baseId: lastEntry._id
            };
        }

        // Update last entry
        this.lastEntries.set(tenantId, { ...entry, _id: entry.id });
        return { isDelta: false };
    }

    /**
     * Reverse delta encoding
     */
    async reverseDeltaEncoding(entry, tenantId) {
        if (!entry._delta || !entry._baseId) {
            return entry;
        }

        try {
            // Get the base entry from database
            const baseEntry = await db
                .select()
                .from(auditLogs)
                .where(eq(auditLogs.id, entry._baseId))
                .limit(1);

            if (!baseEntry.length) {
                throw new Error(`Base entry ${entry._baseId} not found`);
            }

            // Apply delta to reconstruct full entry
            const reconstructed = this.applyDelta(baseEntry[0], entry._delta);
            return reconstructed;
        } catch (error) {
            logError('Failed to reverse delta encoding', { error: error.message, entryId: entry._baseId });
            throw error;
        }
    }

    /**
     * Apply schema-aware compression
     */
    applySchemaCompression(entry) {
        const compressed = { ...entry };

        // Remove null/undefined values
        Object.keys(compressed).forEach(key => {
            if (compressed[key] === null || compressed[key] === undefined) {
                delete compressed[key];
            }
        });

        // Compress timestamps to relative values
        if (compressed.createdAt) {
            compressed._ts = Math.floor(new Date(compressed.createdAt).getTime() / 1000);
            delete compressed.createdAt;
        }

        // Compress metadata objects
        if (compressed.metadata && typeof compressed.metadata === 'object') {
            compressed._meta = this.compressMetadata(compressed.metadata);
            delete compressed.metadata;
        }

        // Compress changes object
        if (compressed.changes && typeof compressed.changes === 'object') {
            compressed._changes = this.compressChanges(compressed.changes);
            delete compressed.changes;
        }

        return compressed;
    }

    /**
     * Compress metadata object
     */
    compressMetadata(metadata) {
        // Use short keys for common metadata fields
        const compressed = {};

        const keyMappings = {
            createdBy: 'cb',
            version: 'v',
            source: 's',
            sessionId: 'sid',
            requestId: 'rid',
            userAgent: 'ua',
            ipAddress: 'ip',
            location: 'loc',
            deviceInfo: 'dev'
        };

        Object.keys(metadata).forEach(key => {
            const shortKey = keyMappings[key] || key;
            compressed[shortKey] = metadata[key];
        });

        return compressed;
    }

    /**
     * Compress changes object
     */
    compressChanges(changes) {
        // Store only the differences
        const compressed = {};

        Object.keys(changes).forEach(key => {
            const change = changes[key];
            if (change && typeof change === 'object' && 'from' in change && 'to' in change) {
                compressed[key] = [change.from, change.to]; // [old, new]
            } else {
                compressed[key] = change;
            }
        });

        return compressed;
    }

    /**
     * Calculate similarity between two log entries
     */
    calculateSimilarity(entry1, entry2) {
        let similarFields = 0;
        let totalFields = 0;

        const fieldsToCompare = ['tenantId', 'userId', 'action', 'category', 'method', 'path'];

        fieldsToCompare.forEach(field => {
            totalFields++;
            if (entry1[field] === entry2[field]) {
                similarFields++;
            }
        });

        return similarFields / totalFields;
    }

    /**
     * Create delta between two entries
     */
    createDelta(current, base) {
        const delta = {};

        // Only store fields that are different
        Object.keys(current).forEach(key => {
            if (JSON.stringify(current[key]) !== JSON.stringify(base[key])) {
                delta[key] = current[key];
            }
        });

        return delta;
    }

    /**
     * Apply delta to reconstruct entry
     */
    applyDelta(base, delta) {
        return { ...base, ...delta };
    }

    /**
     * Build initial dictionaries from recent logs
     */
    async buildInitialDictionaries() {
        try {
            logInfo('Building initial compression dictionaries...');

            // Get recent logs for dictionary building
            const recentLogs = await db
                .select({
                    action: auditLogs.action,
                    userAgent: auditLogs.userAgent,
                    ipAddress: auditLogs.ipAddress,
                    path: auditLogs.path,
                    method: auditLogs.method,
                    category: auditLogs.category
                })
                .from(auditLogs)
                .orderBy(desc(auditLogs.createdAt))
                .limit(10000);

            // Build frequency maps
            const frequencies = {
                actions: new Map(),
                userAgents: new Map(),
                ipAddresses: new Map(),
                paths: new Map(),
                methods: new Map(),
                categories: new Map()
            };

            recentLogs.forEach(log => {
                this.incrementFrequency(frequencies.actions, log.action);
                this.incrementFrequency(frequencies.userAgents, log.userAgent);
                this.incrementFrequency(frequencies.ipAddresses, log.ipAddress);
                this.incrementFrequency(frequencies.paths, log.path);
                this.incrementFrequency(frequencies.methods, log.method);
                this.incrementFrequency(frequencies.categories, log.category);
            });

            // Create dictionaries for most frequent values
            Object.keys(frequencies).forEach(dictName => {
                const freqMap = frequencies[dictName];
                const sorted = Array.from(freqMap.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 1000); // Top 1000 most frequent

                sorted.forEach(([value, count], index) => {
                    this.dictionaries[dictName].set(value, index);
                });
            });

            // Save dictionaries to Redis
            await this.saveDictionaries();

            logInfo('Compression dictionaries built successfully', {
                actions: this.dictionaries.actions.size,
                userAgents: this.dictionaries.userAgents.size,
                ipAddresses: this.dictionaries.ipAddresses.size,
                paths: this.dictionaries.paths.size,
                methods: this.dictionaries.methods.size,
                categories: this.dictionaries.categories.size
            });
        } catch (error) {
            logError('Failed to build initial dictionaries', { error: error.message });
        }
    }

    /**
     * Load dictionaries from Redis
     */
    async loadDictionaries() {
        try {
            const keys = await this.redis.keys('compression:dict:*');
            for (const key of keys) {
                const dictName = key.replace('compression:dict:', '');
                const data = await this.redis.get(key);
                if (data) {
                    this.dictionaries[dictName] = new Map(JSON.parse(data));
                }
            }
        } catch (error) {
            logWarn('Failed to load dictionaries from Redis', { error: error.message });
        }
    }

    /**
     * Save dictionaries to Redis
     */
    async saveDictionaries() {
        try {
            for (const [dictName, dict] of Object.entries(this.dictionaries)) {
                const key = `compression:dict:${dictName}`;
                const data = JSON.stringify(Array.from(dict.entries()));
                await this.redis.set(key, data, 'EX', 86400); // Expire in 24 hours
            }
        } catch (error) {
            logWarn('Failed to save dictionaries to Redis', { error: error.message });
        }
    }

    /**
     * Update dictionaries with new values
     */
    updateDictionary(dictName, value) {
        const dict = this.dictionaries[dictName];
        if (!dict.has(value)) {
            const newId = dict.size;
            dict.set(value, newId);

            // Save updated dictionary to Redis
            this.saveDictionaries().catch(error =>
                logWarn('Failed to update dictionary in Redis', { error: error.message })
            );
        }
    }

    /**
     * Utility methods
     */
    incrementFrequency(map, key) {
        if (key) {
            map.set(key, (map.get(key) || 0) + 1);
        }
    }

    getFieldNameForDictionary(dictName) {
        const mappings = {
            actions: 'action',
            userAgents: 'userAgent',
            ipAddresses: 'ipAddress',
            paths: 'path',
            methods: 'method',
            categories: 'category'
        };
        return mappings[dictName];
    }

    getDictionaryNameForField(fieldName) {
        const mappings = {
            action: 'actions',
            userAgent: 'userAgents',
            ipAddress: 'ipAddresses',
            path: 'paths',
            method: 'methods',
            category: 'categories'
        };
        return mappings[fieldName];
    }

    updateCompressionRatio() {
        if (this.stats.totalOriginalSize > 0) {
            this.stats.compressionRatio = (this.stats.totalOriginalSize / this.stats.totalCompressedSize).toFixed(2);
        }
    }

    /**
     * Get compression statistics
     */
    getCompressionStats() {
        return {
            ...this.stats,
            averageCompressionRatio: this.stats.compressionRatio,
            deltaEncodingRate: this.stats.totalLogsProcessed > 0 ?
                (this.stats.deltaEncodedCount / this.stats.totalLogsProcessed * 100).toFixed(2) + '%' : '0%',
            dictionaryEfficiency: this.stats.totalLogsProcessed > 0 ?
                (this.stats.dictionaryHits / this.stats.totalLogsProcessed * 100).toFixed(2) + '%' : '0%'
        };
    }

    /**
     * Reset compression statistics
     */
    resetStats() {
        this.stats = {
            totalLogsProcessed: 0,
            totalCompressedSize: 0,
            totalOriginalSize: 0,
            compressionRatio: 0,
            deltaEncodedCount: 0,
            dictionaryHits: 0
        };
    }

    /**
     * Configure compression settings
     */
    configure(options = {}) {
        if (options.compressionEnabled !== undefined) {
            this.compressionEnabled = options.compressionEnabled;
        }
        if (options.compressionLevel !== undefined) {
            this.compressionLevel = Math.max(1, Math.min(9, options.compressionLevel));
        }
        if (options.deltaEncodingEnabled !== undefined) {
            this.deltaEncodingEnabled = options.deltaEncodingEnabled;
        }
        if (options.dictionaryEnabled !== undefined) {
            this.dictionaryEnabled = options.dictionaryEnabled;
        }
        if (options.deltaThreshold !== undefined) {
            this.deltaThreshold = Math.max(0, Math.min(1, options.deltaThreshold));
        }
    }
}

// Export singleton instance
export default new DifferentialLogCompression();