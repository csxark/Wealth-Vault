/**
 * Service Management Routes - Admin API for service identities and certificates
 * 
 * Protected endpoints for managing internal service authentication:
 * - Register/revoke service identities
 * - Generate/rotate certificates
 * - View service auth logs
 * - Manage service scopes
 */

import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { requireTenantRole } from '../middleware/tenantMiddleware.js';
import certificateService from '../services/certificateService.js';
import serviceJWTService from '../services/serviceJWTService.js';
import certificateRotation from '../jobs/certificateRotation.js';
import db from '../config/db.js';
import { serviceIdentities, serviceCertificates, serviceAuthLogs } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import logger from '../utils/logger.js';
import crypto from 'crypto';

const router = express.Router();

// Validation middleware
const validateRequest = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array()
        });
    }
    next();
};

// All routes require admin authentication
// In production, add proper admin role check
const requireAdmin = [protect, requireTenantRole('owner')];

/**
 * POST /api/services/register
 * Register a new service identity
 */
router.post(
    '/register',
    requireAdmin,
    [
        body('serviceName').matches(/^[a-z0-9-]+$/).withMessage('Invalid service name format'),
        body('displayName').notEmpty().withMessage('Display name is required'),
        body('serviceType').isIn(['api', 'worker', 'scheduler', 'external']).withMessage('Invalid service type'),
        body('allowedScopes').isArray().withMessage('Allowed scopes must be an array')
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { serviceName, displayName, description, serviceType, allowedScopes } = req.body;

            const service = await certificateService.registerService({
                serviceName,
                displayName,
                description,
                serviceType,
                allowedScopes
            });

            logger.info('Service registered via API', {
                serviceId: service.id,
                serviceName: service.serviceName,
                registeredBy: req.user.id
            });

            res.status(201).json({
                success: true,
                message: 'Service registered successfully',
                data: service
            });
        } catch (error) {
            logger.error('Failed to register service', {
                error: error.message,
                userId: req.user.id
            });
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
);

/**
 * POST /api/services/:serviceId/certificate
 * Generate a new certificate for a service
 */
router.post(
    '/:serviceId/certificate',
    requireAdmin,
    [
        param('serviceId').isUUID().withMessage('Invalid service ID'),
        body('validityDays').optional().isInt({ min: 1, max: 365 }).withMessage('Validity must be 1-365 days')
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { serviceId } = req.params;
            const { validityDays = 90 } = req.body;

            // Generate key pair
            const { publicKey, privateKey } = await new Promise((resolve, reject) => {
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
                    if (err) reject(err);
                    else resolve({ publicKey, privateKey });
                });
            });

            const certificate = await certificateService.generateCertificate(serviceId, {
                validityDays,
                publicKey,
                privateKey
            });

            logger.info('Certificate generated via API', {
                serviceId,
                certificateId: certificate.certificateId,
                generatedBy: req.user.id
            });

            // Return private key only once (never store or log it)
            res.status(201).json({
                success: true,
                message: 'Certificate generated successfully',
                data: {
                    certificate: {
                        id: certificate.id,
                        certificateId: certificate.certificateId,
                        fingerprint: certificate.fingerprint,
                        subject: certificate.subject,
                        notBefore: certificate.notBefore,
                        notAfter: certificate.notAfter,
                        status: certificate.status
                    },
                    privateKey, // Return once for client to store securely
                    publicKey,
                    warning: 'Store the private key securely. It will not be shown again.'
                }
            });
        } catch (error) {
            logger.error('Failed to generate certificate', {
                error: error.message,
                serviceId: req.params.serviceId
            });
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
);

/**
 * GET /api/services
 * List all registered services
 */
router.get(
    '/',
    requireAdmin,
    async (req, res) => {
        try {
            const services = await db
                .select()
                .from(serviceIdentities)
                .orderBy(desc(serviceIdentities.createdAt));

            res.json({
                success: true,
                data: services,
                count: services.length
            });
        } catch (error) {
            logger.error('Failed to list services', { error: error.message });
            res.status(500).json({
                success: false,
                message: 'Failed to list services'
            });
        }
    }
);

/**
 * GET /api/services/:serviceId
 * Get service details including certificates
 */
router.get(
    '/:serviceId',
    requireAdmin,
    [param('serviceId').isUUID().withMessage('Invalid service ID')],
    validateRequest,
    async (req, res) => {
        try {
            const { serviceId } = req.params;

            const [service] = await db
                .select()
                .from(serviceIdentities)
                .where(eq(serviceIdentities.id, serviceId));

            if (!service) {
                return res.status(404).json({
                    success: false,
                    message: 'Service not found'
                });
            }

            const certificates = await db
                .select()
                .from(serviceCertificates)
                .where(eq(serviceCertificates.serviceId, serviceId))
                .orderBy(desc(serviceCertificates.createdAt));

            res.json({
                success: true,
                data: {
                    service,
                    certificates: certificates.map(cert => ({
                        ...cert,
                        privateKey: undefined // Never expose private keys
                    }))
                }
            });
        } catch (error) {
            logger.error('Failed to get service', { error: error.message });
            res.status(500).json({
                success: false,
                message: 'Failed to get service'
            });
        }
    }
);

/**
 * PUT /api/services/:serviceId/scopes
 * Update service allowed scopes
 */
router.put(
    '/:serviceId/scopes',
    requireAdmin,
    [
        param('serviceId').isUUID().withMessage('Invalid service ID'),
        body('allowedScopes').isArray().withMessage('Allowed scopes must be an array')
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { serviceId } = req.params;
            const { allowedScopes } = req.body;

            await certificateService.updateServiceScopes(serviceId, allowedScopes);

            logger.info('Service scopes updated', {
                serviceId,
                allowedScopes,
                updatedBy: req.user.id
            });

            res.json({
                success: true,
                message: 'Service scopes updated successfully',
                data: { allowedScopes }
            });
        } catch (error) {
            logger.error('Failed to update service scopes', { error: error.message });
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
);

/**
 * POST /api/services/certificates/:certificateId/revoke
 * Revoke a certificate
 */
router.post(
    '/certificates/:certificateId/revoke',
    requireAdmin,
    [
        param('certificateId').notEmpty().withMessage('Certificate ID is required'),
        body('reason').notEmpty().withMessage('Revocation reason is required')
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { certificateId } = req.params;
            const { reason } = req.body;

            await certificateService.revokeCertificate(certificateId, reason);

            logger.info('Certificate revoked via API', {
                certificateId,
                reason,
                revokedBy: req.user.id
            });

            res.json({
                success: true,
                message: 'Certificate revoked successfully'
            });
        } catch (error) {
            logger.error('Failed to revoke certificate', { error: error.message });
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
);

/**
 * POST /api/services/certificates/:certificateId/rotate
 * Force immediate certificate rotation
 */
router.post(
    '/certificates/:certificateId/rotate',
    requireAdmin,
    [param('certificateId').notEmpty().withMessage('Certificate ID is required')],
    validateRequest,
    async (req, res) => {
        try {
            const { certificateId } = req.params;

            const newCertificate = await certificateRotation.forceRotation(certificateId);

            logger.info('Certificate force-rotated via API', {
                oldCertificateId: certificateId,
                newCertificateId: newCertificate.certificateId,
                initiatedBy: req.user.id
            });

            res.json({
                success: true,
                message: 'Certificate rotated successfully',
                data: {
                    newCertificate: {
                        certificateId: newCertificate.certificateId,
                        fingerprint: newCertificate.fingerprint,
                        notAfter: newCertificate.notAfter
                    }
                }
            });
        } catch (error) {
            logger.error('Failed to rotate certificate', { error: error.message });
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
);

/**
 * GET /api/services/auth-logs
 * Get service authentication logs
 */
router.get(
    '/auth-logs',
    requireAdmin,
    async (req, res) => {
        try {
            const { limit = 100, offset = 0, serviceName, outcome } = req.query;

            let query = db.select().from(serviceAuthLogs);

            if (serviceName) {
                query = query.where(eq(serviceAuthLogs.serviceName, serviceName));
            }

            if (outcome) {
                query = query.where(eq(serviceAuthLogs.outcome, outcome));
            }

            const logs = await query
                .orderBy(desc(serviceAuthLogs.createdAt))
                .limit(parseInt(limit))
                .offset(parseInt(offset));

            res.json({
                success: true,
                data: logs,
                count: logs.length,
                pagination: {
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                }
            });
        } catch (error) {
            logger.error('Failed to get auth logs', { error: error.message });
            res.status(500).json({
                success: false,
                message: 'Failed to get authentication logs'
            });
        }
    }
);

/**
 * POST /api/services/token/generate
 * Generate a service JWT token (for testing/debugging)
 */
router.post(
    '/token/generate',
    requireAdmin,
    [
        body('serviceName').notEmpty().withMessage('Service name is required'),
        body('scopes').isArray().withMessage('Scopes must be an array'),
        body('audience').notEmpty().withMessage('Audience is required')
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { serviceName, scopes, audience, expiresIn } = req.body;

            const service = await certificateService.getServiceByName(serviceName);
            
            if (!service) {
                return res.status(404).json({
                    success: false,
                    message: 'Service not found'
                });
            }

            const token = await serviceJWTService.generateToken({
                serviceId: service.id,
                serviceName,
                scopes,
                audience,
                expiresIn
            });

            logger.info('Service token generated via API', {
                serviceName,
                scopes,
                generatedBy: req.user.id
            });

            res.json({
                success: true,
                data: {
                    token,
                    decoded: serviceJWTService.decodeToken(token)
                }
            });
        } catch (error) {
            logger.error('Failed to generate service token', { error: error.message });
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
);

/**
 * GET /api/services/rotation/status
 * Get certificate rotation job status
 */
router.get(
    '/rotation/status',
    requireAdmin,
    (req, res) => {
        const status = certificateRotation.getStatus();
        res.json({
            success: true,
            data: status
        });
    }
);

export default router;
