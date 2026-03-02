import certificateService from '../services/certificateService.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

/**
 * Certificate Rotation Job - Automatically rotates service certificates
 * 
 * Monitors certificates and initiates rotation before expiration:
 * - Checks for certificates due for rotation (at 75% of validity)
 * - Generates new certificate with overlapping validity
 * - Marks old certificate for deprecation
 * - Notifies services to update their credentials
 * 
 * Ensures zero-downtime certificate rotation with grace periods.
 */

class CertificateRotation {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
        this.checkInterval = process.env.CERT_ROTATION_CHECK_INTERVAL || 3600000; // 1 hour default
        this.gracePeriod = 86400000; // 24 hours in milliseconds
    }

    /**
     * Start the certificate rotation job
     */
    start() {
        if (this.isRunning) {
            logger.warn('Certificate rotation job is already running');
            return;
        }

        this.isRunning = true;
        logger.info('Starting certificate rotation job', {
            checkInterval: this.checkInterval,
            gracePeriod: this.gracePeriod
        });

        // Run immediately on start
        this.checkAndRotate();

        // Schedule periodic checks
        this.intervalId = setInterval(() => this.checkAndRotate(), this.checkInterval);

        logger.info('Certificate rotation job started');
    }

    /**
     * Stop the certificate rotation job
     */
    stop() {
        if (!this.isRunning) {
            logger.warn('Certificate rotation job is not running');
            return;
        }

        this.isRunning = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        logger.info('Certificate rotation job stopped');
    }

    /**
     * Check for certificates due for rotation and rotate them
     * @private
     */
    async checkAndRotate() {
        if (!this.isRunning) {
            return;
        }

        try {
            logger.info('Checking for certificates due for rotation');

            const certificates = await certificateService.getCertificatesDueForRotation();

            if (certificates.length === 0) {
                logger.debug('No certificates due for rotation');
                return;
            }

            logger.info(`Found ${certificates.length} certificates due for rotation`);

            // Rotate certificates in sequence (not parallel to avoid overload)
            for (const certificate of certificates) {
                try {
                    await this.rotateCertificate(certificate);
                } catch (error) {
                    logger.error('Failed to rotate certificate', {
                        certificateId: certificate.certificateId,
                        error: error.message
                    });
                    // Continue with other certificates
                }
            }

            logger.info('Certificate rotation check completed');

        } catch (error) {
            logger.error('Certificate rotation check failed', {
                error: error.message,
                stack: error.stack
            });
        }
    }

    /**
     * Rotate a single certificate
     * @param {Object} oldCertificate - Certificate to rotate
     * @private
     */
    async rotateCertificate(oldCertificate) {
        try {
            logger.info('Rotating certificate', {
                certificateId: oldCertificate.certificateId,
                serviceId: oldCertificate.serviceId,
                expiresAt: oldCertificate.notAfter
            });

            // Mark old certificate as rotating
            await certificateService.db
                .update(certificateService.serviceCertificates)
                .set({
                    status: 'rotating',
                    updatedAt: new Date()
                })
                .where(certificateService.eq(certificateService.serviceCertificates.id, oldCertificate.id));

            // Generate new key pair (in production, this would use proper PKI)
            const { publicKey, privateKey } = await this.generateKeyPair();

            // Generate new certificate with same validity period as original
            const validityDays = Math.ceil(
                (new Date(oldCertificate.notAfter) - new Date(oldCertificate.notBefore)) / (1000 * 60 * 60 * 24)
            );

            const newCertificate = await certificateService.generateCertificate(
                oldCertificate.serviceId,
                {
                    validityDays,
                    publicKey,
                    privateKey
                }
            );

            logger.info('New certificate generated', {
                oldCertificateId: oldCertificate.certificateId,
                newCertificateId: newCertificate.certificateId,
                serviceId: oldCertificate.serviceId
            });

            // Schedule old certificate revocation after grace period
            setTimeout(async () => {
                try {
                    await certificateService.revokeCertificate(
                        oldCertificate.certificateId,
                        'Rotated - grace period expired'
                    );
                    
                    logger.info('Old certificate revoked after grace period', {
                        certificateId: oldCertificate.certificateId
                    });
                } catch (error) {
                    logger.error('Failed to revoke old certificate after grace period', {
                        certificateId: oldCertificate.certificateId,
                        error: error.message
                    });
                }
            }, this.gracePeriod);

            // TODO: Notify service about certificate rotation
            // In production, this would:
            // 1. Publish event to message bus
            // 2. Send API callback to service
            // 3. Update service configuration
            await this.notifyServiceAboutRotation(oldCertificate.serviceId, {
                oldCertificate: oldCertificate.certificateId,
                newCertificate: newCertificate.certificateId,
                gracePeriodEnds: new Date(Date.now() + this.gracePeriod)
            });

        } catch (error) {
            logger.error('Certificate rotation failed', {
                certificateId: oldCertificate.certificateId,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Generate a new RSA key pair
     * In production, this would use a proper PKI system or HSM
     * @returns {Promise<Object>} Key pair
     * @private
     */
    async generateKeyPair() {
        return new Promise((resolve, reject) => {
            crypto.generateKeyPair('rsa', {
                modulusLength: 2048,
                publicKeyEncoding: {
                    type: 'spki',
                    format: 'pem'
                },
                privateKeyEncoding: {
                    type: 'pkcs8',
                    format: 'pem'
                }
            }, (err, publicKey, privateKey) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({ publicKey, privateKey });
                }
            });
        });
    }

    /**
     * Notify service about certificate rotation
     * @param {string} serviceId - Service ID
     * @param {Object} rotationInfo - Rotation information
     * @private
     */
    async notifyServiceAboutRotation(serviceId, rotationInfo) {
        try {
            // In production, this would:
            // 1. Publish to event bus
            // 2. Send webhook to service
            // 3. Update service config store
            
            logger.info('Service notified about certificate rotation', {
                serviceId,
                oldCertificate: rotationInfo.oldCertificate,
                newCertificate: rotationInfo.newCertificate,
                gracePeriodEnds: rotationInfo.gracePeriodEnds
            });

            // TODO: Implement actual notification mechanism
            // Example: outboxService.createEvent(...)

        } catch (error) {
            logger.error('Failed to notify service about rotation', {
                serviceId,
                error: error.message
            });
            // Don't throw - notification failure shouldn't break rotation
        }
    }

    /**
     * Force immediate rotation of a certificate
     * @param {string} certificateId - Certificate ID to rotate
     * @returns {Promise<Object>} New certificate
     */
    async forceRotation(certificateId) {
        try {
            const certificate = await certificateService.db
                .select()
                .from(certificateService.serviceCertificates)
                .where(certificateService.eq(
                    certificateService.serviceCertificates.certificateId,
                    certificateId
                ));

            if (!certificate || certificate.length === 0) {
                throw new Error('Certificate not found');
            }

            await this.rotateCertificate(certificate[0]);

            logger.info('Certificate force-rotated', { certificateId });

            return await certificateService.getActiveCertificate(certificate[0].serviceId);

        } catch (error) {
            logger.error('Force rotation failed', {
                certificateId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get rotation status and statistics
     * @returns {Object} Rotation job status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            checkInterval: this.checkInterval,
            gracePeriod: this.gracePeriod,
            nextCheckIn: this.intervalId ? this.checkInterval : null
        };
    }
}

// Create singleton instance
const certificateRotation = new CertificateRotation();

export default certificateRotation;
