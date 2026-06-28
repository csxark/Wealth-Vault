import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import certificateService from './certificateService.js';
import logger from '../utils/logger.js';

/**
 * Service JWT Service - Manages short-lived scoped JWTs for service-to-service auth
 * 
 * Generates and validates JWTs with:
 * - Short expiration (5-15 minutes)
 * - Strict claims validation (iss, aud, sub, scope)
 * - Scope-based authorization
 * - Service identity binding
 * 
 * Used in conjunction with mTLS for zero-trust authentication.
 */

class ServiceJWTService {
    constructor() {
        // Use different secrets for service tokens vs user tokens
        this.serviceSecret = process.env.SERVICE_JWT_SECRET || this.generateSecret();
        this.defaultExpiration = process.env.SERVICE_JWT_EXPIRATION || '15m'; // 15 minutes default
        this.issuer = 'wealth-vault-services';
    }

    /**
     * Generate a random secret (for development only)
     * @private
     */
    generateSecret() {
        const secret = crypto.randomBytes(64).toString('hex');
        logger.warn('Using generated SERVICE_JWT_SECRET. Set SERVICE_JWT_SECRET env var in production!');
        return secret;
    }

    /**
     * Generate a service JWT token
     * @param {Object} params - Token parameters
     * @param {string} params.serviceId - Service ID
     * @param {string} params.serviceName - Service name
     * @param {Array<string>} params.scopes - Requested scopes
     * @param {string} params.audience - Target audience service
     * @param {string} params.expiresIn - Token expiration (default: 15m)
     * @returns {Promise<string>} JWT token
     */
    async generateToken({ serviceId, serviceName, scopes = [], audience, expiresIn = this.defaultExpiration }) {
        try {
            // Validate service exists and is active
            const service = await certificateService.getServiceByName(serviceName);
            
            if (!service) {
                throw new Error('Service not found');
            }

            if (service.status !== 'active') {
                throw new Error('Service is not active');
            }

            // Validate requested scopes against allowed scopes
            const unauthorizedScopes = scopes.filter(s => !service.allowedScopes.includes(s));
            if (unauthorizedScopes.length > 0) {
                throw new Error(`Unauthorized scopes requested: ${unauthorizedScopes.join(', ')}`);
            }

            // Generate token
            const payload = {
                iss: this.issuer, // Issuer
                sub: serviceId, // Subject (service ID)
                aud: audience, // Audience (target service)
                scope: scopes.join(' '), // Space-separated scopes
                serviceName: serviceName, // Service name for easy identification
                jti: crypto.randomBytes(16).toString('hex'), // Unique token ID
                iat: Math.floor(Date.now() / 1000) // Issued at
            };

            const token = jwt.sign(payload, this.serviceSecret, {
                expiresIn,
                algorithm: 'HS256'
            });

            logger.info('Service JWT generated', {
                serviceId,
                serviceName,
                scopes,
                audience,
                expiresIn
            });

            return token;

        } catch (error) {
            logger.error('Failed to generate service JWT', {
                error: error.message,
                serviceName,
                scopes
            });
            throw error;
        }
    }

    /**
     * Verify and decode a service JWT token
     * @param {string} token - JWT token
     * @param {Object} options - Verification options
     * @param {string} options.audience - Expected audience
     * @param {Array<string>} options.requiredScopes - Required scopes
     * @returns {Promise<Object>} Decoded token payload
     */
    async verifyToken(token, { audience = null, requiredScopes = [] } = {}) {
        try {
            // Verify JWT signature and expiration
            const options = {
                algorithms: ['HS256'],
                issuer: this.issuer
            };

            if (audience) {
                options.audience = audience;
            }

            const decoded = jwt.verify(token, this.serviceSecret, options);

            // Validate service still exists and is active
            const service = await certificateService.getServiceByName(decoded.serviceName);
            
            if (!service) {
                throw new Error('Service not found');
            }

            if (service.status !== 'active') {
                throw new Error('Service is not active');
            }

            // Validate scopes
            const tokenScopes = decoded.scope ? decoded.scope.split(' ') : [];
            
            if (requiredScopes.length > 0) {
                const hasRequiredScopes = requiredScopes.every(s => tokenScopes.includes(s));
                if (!hasRequiredScopes) {
                    throw new Error(`Missing required scopes: ${requiredScopes.join(', ')}`);
                }
            }

            logger.debug('Service JWT verified', {
                serviceId: decoded.sub,
                serviceName: decoded.serviceName,
                scopes: tokenScopes,
                audience: decoded.aud
            });

            return {
                valid: true,
                payload: decoded,
                scopes: tokenScopes,
                service
            };

        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                logger.warn('Service JWT expired', { error: error.message });
                throw new Error('Token expired');
            } else if (error.name === 'JsonWebTokenError') {
                logger.warn('Invalid service JWT', { error: error.message });
                throw new Error('Invalid token');
            } else {
                logger.error('Service JWT verification failed', {
                    error: error.message
                });
                throw error;
            }
        }
    }

    /**
     * Check if token has specific scopes
     * @param {string} token - JWT token
     * @param {Array<string>} requiredScopes - Required scopes
     * @returns {Promise<boolean>} True if token has all required scopes
     */
    async hasScopes(token, requiredScopes) {
        try {
            const { scopes } = await this.verifyToken(token);
            return requiredScopes.every(s => scopes.includes(s));
        } catch (error) {
            return false;
        }
    }

    /**
     * Decode token without verification (for debugging)
     * @param {string} token - JWT token
     * @returns {Object} Decoded token
     */
    decodeToken(token) {
        try {
            return jwt.decode(token, { complete: true });
        } catch (error) {
            logger.error('Failed to decode token', { error: error.message });
            return null;
        }
    }

    /**
     * Generate a service-to-service authentication request
     * Creates both JWT and prepares certificate info for mTLS
     * @param {Object} params - Request parameters
     * @param {string} params.fromService - Source service name
     * @param {string} params.toService - Target service name
     * @param {Array<string>} params.scopes - Requested scopes
     * @returns {Promise<Object>} Auth request data
     */
    async generateServiceRequest({ fromService, toService, scopes }) {
        try {
            // Get source service
            const service = await certificateService.getServiceByName(fromService);
            
            if (!service) {
                throw new Error('Source service not found');
            }

            // Get active certificate
            const certificate = await certificateService.getActiveCertificate(service.id);
            
            if (!certificate) {
                throw new Error('No active certificate found for service');
            }

            // Generate JWT
            const token = await this.generateToken({
                serviceId: service.id,
                serviceName: fromService,
                scopes,
                audience: toService
            });

            return {
                token,
                certificate: {
                    fingerprint: certificate.fingerprint,
                    serialNumber: certificate.serialNumber,
                    subject: certificate.subject
                },
                service: {
                    id: service.id,
                    name: service.serviceName,
                    type: service.serviceType
                }
            };

        } catch (error) {
            logger.error('Failed to generate service request', {
                error: error.message,
                fromService,
                toService
            });
            throw error;
        }
    }

    /**
     * Validate a complete service-to-service authentication
     * Checks both certificate and JWT
     * @param {Object} params - Validation parameters
     * @param {string} params.certificateFingerprint - Certificate fingerprint from mTLS
     * @param {string} params.token - JWT token
     * @param {string} params.expectedAudience - Expected audience (current service)
     * @param {Array<string>} params.requiredScopes - Required scopes
     * @returns {Promise<Object>} Validation result
     */
    async validateServiceAuth({ certificateFingerprint, token, expectedAudience, requiredScopes = [] }) {
        try {
            // Step 1: Validate certificate
            const certValidation = await certificateService.validateCertificate(certificateFingerprint);
            
            if (!certValidation.valid) {
                return {
                    authenticated: false,
                    reason: `Certificate validation failed: ${certValidation.reason}`,
                    method: 'mtls'
                };
            }

            // Step 2: Verify JWT
            const tokenValidation = await this.verifyToken(token, {
                audience: expectedAudience,
                requiredScopes
            });

            // Step 3: Ensure certificate and token match the same service
            if (certValidation.service.id !== tokenValidation.payload.sub) {
                return {
                    authenticated: false,
                    reason: 'Certificate and token service mismatch',
                    method: 'mtls+jwt'
                };
            }

            // Success - both certificate and token are valid and match
            return {
                authenticated: true,
                reason: 'Authentication successful',
                method: 'mtls+jwt',
                service: certValidation.service,
                scopes: tokenValidation.scopes,
                certificate: certValidation.certificate
            };

        } catch (error) {
            logger.error('Service authentication validation failed', {
                error: error.message,
                certificateFingerprint,
                expectedAudience
            });
            
            return {
                authenticated: false,
                reason: error.message,
                method: 'mtls+jwt'
            };
        }
    }

    /**
     * Extract scopes from token
     * @param {string} token - JWT token
     * @returns {Array<string>} Token scopes
     */
    extractScopes(token) {
        try {
            const decoded = jwt.decode(token);
            return decoded && decoded.scope ? decoded.scope.split(' ') : [];
        } catch (error) {
            return [];
        }
    }
}

export default new ServiceJWTService();
