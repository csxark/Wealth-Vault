import db from '../config/db.js';
import { serviceIdentities, serviceCertificates, serviceAuthLogs } from '../db/schema.js';
import { eq, and, lt, gt } from 'drizzle-orm';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import keyManager from '../utils/CryptographicKeyManager.js';

/**
 * Certificate Service - Manages service identities and mTLS certificates
 * 
 * Provides zero-trust service-to-service authentication using:
 * - Machine identities with strong cryptographic credentials
 * - mTLS certificate management with rotation
 * - Certificate validation and trust chain verification
 * - Audit logging for all authentication attempts
 */

class CertificateService {
    constructor() {
        // Validation delegated to CryptographicKeyManager singleton
        // If key is not available, keyManager initialization will fail
        // This ensures fail-fast behavior at service startup
        logger.info('Certificate Service initialized with centralized key management');
    }

    /**
     * Register a new service identity
     * @param {Object} serviceData - Service registration data
     * @param {string} serviceData.serviceName - Unique service name (e.g., 'api-gateway', 'worker-queue')
     * @param {string} serviceData.displayName - Human-readable service name
     * @param {string} serviceData.description - Service description
     * @param {string} serviceData.serviceType - Service type (api, worker, scheduler, external)
     * @param {Array<string>} serviceData.allowedScopes - Array of allowed scopes
     * @returns {Promise<Object>} Created service identity
     */
    async registerService({ serviceName, displayName, description, serviceType, allowedScopes = [] }) {
        try {
            // Validate service name format (lowercase, alphanumeric, hyphens only)
            if (!/^[a-z0-9-]+$/.test(serviceName)) {
                throw new Error('Service name must be lowercase alphanumeric with hyphens only');
            }

            // Validate service type
            const validTypes = ['api', 'worker', 'scheduler', 'external'];
            if (!validTypes.includes(serviceType)) {
                throw new Error(`Service type must be one of: ${validTypes.join(', ')}`);
            }

            const [service] = await db.insert(serviceIdentities).values({
                serviceName,
                displayName,
                description: description || '',
                serviceType,
                allowedScopes,
                status: 'active',
                metadata: {
                    registeredAt: new Date().toISOString(),
                    version: '1.0.0'
                }
            }).returning();

            logger.info('Service identity registered', {
                serviceId: service.id,
                serviceName: service.serviceName,
                allowedScopes: service.allowedScopes
            });

            return service;
        } catch (error) {
            logger.error('Failed to register service', {
                error: error.message,
                serviceName
            });
            throw error;
        }
    }

    /**
     * Generate a certificate for a service
     * @param {string} serviceId - Service ID
     * @param {Object} options - Certificate options
     * @param {number} options.validityDays - Certificate validity in days (default: 90)
     * @param {Object} options.publicKey - Public key in PEM format
     * @param {Object} options.privateKey - Private key in PEM format (optional, for internal storage)
     * @returns {Promise<Object>} Created certificate
     */
    async generateCertificate(serviceId, { validityDays = 90, publicKey, privateKey = null }) {
        try {
            // Get service identity
            const [service] = await db
                .select()
                .from(serviceIdentities)
                .where(eq(serviceIdentities.id, serviceId));

            if (!service) {
                throw new Error('Service not found');
            }

            if (service.status !== 'active') {
                throw new Error('Service is not active');
            }

            // Generate certificate metadata
            const certificateId = `cert_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
            const serialNumber = crypto.randomBytes(16).toString('hex');
            const fingerprint = this.calculateFingerprint(publicKey);

            const notBefore = new Date();
            const notAfter = new Date();
            notAfter.setDate(notAfter.getDate() + validityDays);

            // Calculate rotation schedule (rotate at 75% of validity)
            const rotationScheduledAt = new Date();
            rotationScheduledAt.setDate(rotationScheduledAt.getDate() + Math.floor(validityDays * 0.75));

            const [certificate] = await db.insert(serviceCertificates).values({
                serviceId,
                certificateId,
                serialNumber,
                fingerprint,
                publicKey,
                privateKey: privateKey ? this.encryptPrivateKey(privateKey) : null,
                issuer: 'CN=Wealth-Vault Internal CA',
                subject: `CN=${service.serviceName},O=Wealth-Vault,OU=Services`,
                status: 'active',
                notBefore,
                notAfter,
                rotationScheduledAt,
                metadata: {
                    generatedAt: new Date().toISOString(),
                    algorithm: 'RSA-2048',
                    validityDays
                }
            }).returning();

            // Revoke old active certificates for this service
            await this.revokeOldCertificates(serviceId, certificate.id);

            logger.info('Certificate generated for service', {
                serviceId,
                serviceName: service.serviceName,
                certificateId: certificate.certificateId,
                validUntil: notAfter.toISOString()
            });

            return certificate;
        } catch (error) {
            logger.error('Failed to generate certificate', {
                error: error.message,
                serviceId
            });
            throw error;
        }
    }

    /**
     * Calculate SHA-256 fingerprint of a public key
     * @param {string} publicKey - Public key in PEM format
     * @returns {string} Fingerprint
     * @private
     */
    calculateFingerprint(publicKey) {
        return crypto.createHash('sha256').update(publicKey).digest('hex');
    }

    /**
     * Encrypt private key for storage using AES-256-GCM
     * @param {string} privateKey - Private key in PEM format
     * @returns {string} Encrypted private key (JSON string)
     * @private
     * @throws {Error} If encryption fails or key is not configured
     * 
     * NOTE: For production, consider using:
     * - AWS KMS (Key Management Service)
     * - Azure Key Vault
     * - HashiCorp Vault
     * - Google Cloud KMS
     * - Hardware Security Module (HSM)
     */
    encryptPrivateKey(privateKey) {
        try {
            if (!privateKey || typeof privateKey !== 'string') {
                throw new Error('Private key must be a non-empty string');
            }

            const algorithm = 'aes-256-gcm';
            const key = keyManager.getEncryptionKey(); // Uses centralized key manager - NEVER random
            if (!key) {
                throw new Error('CRITICAL: Encryption key is not available');
            }
            
            const iv = crypto.randomBytes(16);
            
            const cipher = crypto.createCipheriv(algorithm, key, iv);
            let encrypted = cipher.update(privateKey, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const authTag = cipher.getAuthTag();
            
            // Include version for future key rotation support
            const encryptedData = {
                version: 1,
                algorithm,
                encrypted,
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex'),
                timestamp: new Date().toISOString()
            };

            return JSON.stringify(encryptedData);
        } catch (error) {
            logger.error('Private key encryption failed', {
                error: error.message,
                stack: error.stack
            });
            throw new Error(`Failed to encrypt private key: ${error.message}`);
        }
    }

    /**
     * Decrypt private key
     * @param {string} encryptedKey - Encrypted private key (JSON string)
     * @returns {string} Decrypted private key in PEM format
     * @private
     * @throws {Error} If decryption fails or key is not configured
     */
    decryptPrivateKey(encryptedKey) {
        try {
            if (!encryptedKey || typeof encryptedKey !== 'string') {
                throw new Error('Encrypted key must be a non-empty string');
            }

            let encryptedData;
            try {
                encryptedData = JSON.parse(encryptedKey);
            } catch (error) {
                throw new Error('Invalid encrypted key format: not valid JSON');
            }

            const { version = 1, encrypted, iv, authTag, algorithm } = encryptedData;

            // Validate required fields
            if (!encrypted || !iv || !authTag || !algorithm) {
                throw new Error('Missing required fields in encrypted key data');
            }

            // Support for key rotation - check version
            if (version !== 1) {
                throw new Error(`Unsupported encryption version: ${version}. This may require key migration.`);
            }

            const key = keyManager.getEncryptionKey(); // Uses centralized key manager - NEVER random
            if (!key) {
                throw new Error('CRITICAL: Encryption key is not available');
            }
            
            const decipher = crypto.createDecipheriv(
                algorithm,
                key,
                Buffer.from(iv, 'hex')
            );
            decipher.setAuthTag(Buffer.from(authTag, 'hex'));
            
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            logger.error('Private key decryption failed', {
                error: error.message,
                stack: error.stack
            });
            
            // Provide more helpful error messages
            if (error.message.includes('bad decrypt') || error.message.includes('Unsupported state')) {
                throw new Error(
                    'Failed to decrypt private key. ' +
                    'This usually means the SERVICE_KEY_ENCRYPTION_KEY has changed or is incorrect. ' +
                    'Original error: ' + error.message
                );
            }
            
            throw new Error(`Failed to decrypt private key: ${error.message}`);
        }
    }

    /**
     * Revoke old active certificates for a service (keep only the latest)
     * @param {string} serviceId - Service ID
     * @param {string} currentCertificateId - ID of current certificate to keep
     * @private
     */
    async revokeOldCertificates(serviceId, currentCertificateId) {
        try {
            await db
                .update(serviceCertificates)
                .set({
                    status: 'revoked',
                    revokedAt: new Date(),
                    revokedReason: 'Replaced by new certificate',
                    updatedAt: new Date()
                })
                .where(
                    and(
                        eq(serviceCertificates.serviceId, serviceId),
                        eq(serviceCertificates.status, 'active')
                    )
                );

            // Set the current certificate back to active
            await db
                .update(serviceCertificates)
                .set({
                    status: 'active',
                    updatedAt: new Date()
                })
                .where(eq(serviceCertificates.id, currentCertificateId));

        } catch (error) {
            logger.error('Failed to revoke old certificates', {
                error: error.message,
                serviceId
            });
        }
    }

    /**
     * Validate a certificate
     * @param {string} fingerprint - Certificate fingerprint
     * @returns {Promise<Object>} Validation result
     */
    async validateCertificate(fingerprint) {
        try {
            const [certificate] = await db
                .select()
                .from(serviceCertificates)
                .where(eq(serviceCertificates.fingerprint, fingerprint));

            if (!certificate) {
                return {
                    valid: false,
                    reason: 'Certificate not found',
                    certificate: null
                };
            }

            // Check if certificate is active
            if (certificate.status !== 'active') {
                return {
                    valid: false,
                    reason: `Certificate is ${certificate.status}`,
                    certificate
                };
            }

            // Check if certificate is expired
            const now = new Date();
            if (now < certificate.notBefore || now > certificate.notAfter) {
                return {
                    valid: false,
                    reason: 'Certificate expired or not yet valid',
                    certificate
                };
            }

            // Get service identity
            const [service] = await db
                .select()
                .from(serviceIdentities)
                .where(eq(serviceIdentities.id, certificate.serviceId));

            if (!service || service.status !== 'active') {
                return {
                    valid: false,
                    reason: 'Service not found or inactive',
                    certificate
                };
            }

            return {
                valid: true,
                reason: 'Certificate is valid',
                certificate,
                service
            };

        } catch (error) {
            logger.error('Certificate validation error', {
                error: error.message,
                fingerprint
            });
            throw error;
        }
    }

    /**
     * Get active certificate for a service
     * @param {string} serviceId - Service ID
     * @returns {Promise<Object|null>} Active certificate
     */
    async getActiveCertificate(serviceId) {
        try {
            const [certificate] = await db
                .select()
                .from(serviceCertificates)
                .where(
                    and(
                        eq(serviceCertificates.serviceId, serviceId),
                        eq(serviceCertificates.status, 'active')
                    )
                );

            return certificate || null;
        } catch (error) {
            logger.error('Failed to get active certificate', {
                error: error.message,
                serviceId
            });
            throw error;
        }
    }

    /**
     * Get certificates due for rotation
     * @returns {Promise<Array<Object>>} Certificates needing rotation
     */
    async getCertificatesDueForRotation() {
        try {
            const now = new Date();
            
            const certificates = await db
                .select()
                .from(serviceCertificates)
                .where(
                    and(
                        eq(serviceCertificates.status, 'active'),
                        lt(serviceCertificates.rotationScheduledAt, now)
                    )
                );

            return certificates;
        } catch (error) {
            logger.error('Failed to get certificates due for rotation', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Log authentication attempt
     * @param {Object} logData - Authentication log data
     */
    async logAuthAttempt(logData) {
        try {
            await db.insert(serviceAuthLogs).values({
                serviceId: logData.serviceId || null,
                serviceName: logData.serviceName,
                certificateId: logData.certificateId || null,
                authMethod: logData.authMethod,
                outcome: logData.outcome,
                failureReason: logData.failureReason || null,
                requestedScopes: logData.requestedScopes || [],
                grantedScopes: logData.grantedScopes || [],
                ipAddress: logData.ipAddress || null,
                userAgent: logData.userAgent || null,
                requestId: logData.requestId || null,
                metadata: logData.metadata || {}
            });
        } catch (error) {
            logger.error('Failed to log auth attempt', {
                error: error.message
            });
            // Don't throw - logging failures shouldn't break auth
        }
    }

    /**
     * Get service by name
     * @param {string} serviceName - Service name
     * @returns {Promise<Object|null>} Service identity
     */
    async getServiceByName(serviceName) {
        try {
            const [service] = await db
                .select()
                .from(serviceIdentities)
                .where(eq(serviceIdentities.serviceName, serviceName));

            return service || null;
        } catch (error) {
            logger.error('Failed to get service by name', {
                error: error.message,
                serviceName
            });
            throw error;
        }
    }

    /**
     * Update service scopes
     * @param {string} serviceId - Service ID
     * @param {Array<string>} allowedScopes - New allowed scopes
     */
    async updateServiceScopes(serviceId, allowedScopes) {
        try {
            await db
                .update(serviceIdentities)
                .set({
                    allowedScopes,
                    updatedAt: new Date()
                })
                .where(eq(serviceIdentities.id, serviceId));

            logger.info('Service scopes updated', {
                serviceId,
                allowedScopes
            });
        } catch (error) {
            logger.error('Failed to update service scopes', {
                error: error.message,
                serviceId
            });
            throw error;
        }
    }

    /**
     * Revoke a certificate
     * @param {string} certificateId - Certificate ID
     * @param {string} reason - Revocation reason
     */
    async revokeCertificate(certificateId, reason) {
        try {
            await db
                .update(serviceCertificates)
                .set({
                    status: 'revoked',
                    revokedAt: new Date(),
                    revokedReason: reason,
                    updatedAt: new Date()
                })
                .where(eq(serviceCertificates.certificateId, certificateId));

            logger.warn('Certificate revoked', {
                certificateId,
                reason
            });
        } catch (error) {
            logger.error('Failed to revoke certificate', {
                error: error.message,
                certificateId
            });
            throw error;
        }
    }
}

export default new CertificateService();
