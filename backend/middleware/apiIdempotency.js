/**
 * API Layer Idempotency Middleware (Issue #568)
 * 
 * Implements request-level idempotency using idempotent keys:
 * - Extracts idempotency key from header: Idempotency-Key
 * - Caches responses per key to enable safe retries
 * - Prevents duplicate processing for state-changing operations
 * - Supports cache expiration (TTL)
 * 
 * Usage:
 * 1. Client includes Idempotency-Key header on requests
 * 2. Middleware checks if key was processed before
 * 3. If cached, returns 200 with previous response body
 * 4. If new, processes request and caches result
 */

import { createHash } from 'crypto';
import { eq } from 'drizzle-orm';
import db from '../config/db.js';
import logger from '../utils/logger.js';

// Simple in-memory cache for non-persistent quick checks
const IDEMPOTENCY_CACHE = new Map();
const IDEMPOTENCY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate request signature for idempotency
 */
function generateRequestSignature(method, path, keyHash) {
    const input = `${method}|${path}|${keyHash}`;
    return createHash('sha256').update(input).digest('hex');
}

/**
 * API Idempotency Middleware
 * 
 * Supported headers:
 * - Idempotency-Key (required for POST/PUT/PATCH/DELETE): Unique key for the request
 * - Idempotent-Replay (optional): Set to 'true' if client wants idempotent semantics
 */
export function apiIdempotency(options = {}) {
    const {
        idempotentMethods = ['POST', 'PUT', 'PATCH', 'DELETE'],
        ttlMinutes = 1440, // 24 hours
        ignorePaths = ['/health', '/status', '/metrics']
    } = options;

    return (req, res, next) => {
        try {
            // Skip idempotency for safe methods and ignored paths
            if (!idempotentMethods.includes(req.method)) {
                return next();
            }

            if (ignorePaths.some(path => req.path.startsWith(path))) {
                return next();
            }

            const idempotencyKey = req.headers['idempotency-key'];
            
            // Idempotency key is required for state-changing operations
            if (!idempotencyKey) {
                return res.status(400).json({
                    success: false,
                    error: 'idempotency_key_required',
                    message: 'Idempotency-Key header is required for this operation',
                    code: 'MISSING_IDEMPOTENCY_KEY'
                });
            }

            // Validate idempotency key format (should be a UUID or alphanumeric string)
            if (!/^[a-zA-Z0-9\-_]{20,128}$/.test(idempotencyKey)) {
                return res.status(400).json({
                    success: false,
                    error: 'invalid_idempotency_key',
                    message: 'Idempotency-Key must be a valid format (20-128 alphanumeric characters)',
                    code: 'INVALID_IDEMPOTENCY_KEY'
                });
            }

            const keyHash = createHash('sha256').update(idempotencyKey).digest('hex');
            const requestSignature = generateRequestSignature(req.method, req.path, keyHash);

            // Attach to request for later use
            req.idempotencyKey = idempotencyKey;
            req.idempotencyHash = keyHash;
            req.idempotencyTTL = ttlMinutes * 60 * 1000;

            // Check in-memory cache first (fast path)
            const cachedEntry = IDEMPOTENCY_CACHE.get(keyHash);
            if (cachedEntry && Date.now() - cachedEntry.timestamp < req.idempotencyTTL) {
                logger.debug(`[Idempotency] Cache hit for key: ${idempotencyKey.substring(0, 8)}...`);
                
                return res.status(cachedEntry.statusCode).json({
                    ...cachedEntry.body,
                    _idempotent_replay: true,
                    _idempotent_key: idempotencyKey
                });
            }

            // Store original response methods
            const originalJson = res.json.bind(res);
            const originalSend = res.send.bind(res);
            const originalStatus = res.status;

            // Track response status and body
            let responseStatus = 200;
            let responseBody = null;

            /**
             * Override res.status() to capture status code
             */
            res.status = function(code) {
                responseStatus = code;
                return originalStatus.call(this, code);
            };

            /**
             * Override res.json() to cache idempotent responses
             */
            res.json = function(data) {
                if (data && data.success !== false && responseStatus < 400) {
                    // Cache successful responses
                    responseBody = data;
                    
                    // Store in memory cache
                    IDEMPOTENCY_CACHE.set(keyHash, {
                        statusCode: responseStatus,
                        body: data,
                        timestamp: Date.now(),
                        idempotencyKey,
                        method: req.method,
                        path: req.path
                    });

                    // Cleanup old entries
                    if (IDEMPOTENCY_CACHE.size > 10000) {
                        // Remove expired entries
                        const now = Date.now();
                        for (const [key, entry] of IDEMPOTENCY_CACHE.entries()) {
                            if (now - entry.timestamp > IDEMPOTENCY_CACHE_TTL_MS) {
                                IDEMPOTENCY_CACHE.delete(key);
                            }
                        }
                    }

                    logger.debug(`[Idempotency] Cached response for key: ${idempotencyKey.substring(0, 8)}... (${responseStatus})`);
                }

                return originalJson.call(this, data);
            };

            /**
             * Override res.send() for non-JSON responses
             */
            res.send = function(data) {
                return originalSend.call(this, data);
            };

            next();
        } catch (error) {
            logger.error('[Idempotency] Middleware error:', error);
            // Continue without idempotency on middleware error
            next();
        }
    };
}

/**
 * Extract idempotency context from request
 */
export function getIdempotencyContext(req) {
    return {
        key: req.idempotencyKey,
        hash: req.idempotencyHash,
        ttl: req.idempotencyTTL,
        method: req.method,
        path: req.path,
        userId: req.user?.id,
        tenantId: req.user?.tenantId
    };
}

/**
 * Mark request as having produced idempotent response
 */
export function markIdempotentResponse(req, response) {
    if (!req.idempotencyKey) {
        return;
    }

    const keyHash = req.idempotencyHash;
    
    IDEMPOTENCY_CACHE.set(keyHash, {
        statusCode: 200,
        body: response,
        timestamp: Date.now(),
        idempotencyKey: req.idempotencyKey,
        method: req.method,
        path: req.path
    });

    logger.debug(`[Idempotency] Manually marked idempotent response for key: ${req.idempotencyKey.substring(0, 8)}...`);
}

export default apiIdempotency;
