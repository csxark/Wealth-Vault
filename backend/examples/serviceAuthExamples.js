/**
 * Service Registration Examples - Zero-Trust Service Authentication
 * 
 * This file demonstrates how to:
 * 1. Register service identities
 * 2. Generate certificates for services
 * 3. Generate service JWTs
 * 4. Make authenticated service-to-service requests
 * 5. Protect endpoints with service auth
 */

import certificateService from '../services/certificateService.js';
import serviceJWTService from '../services/serviceJWTService.js';
import crypto from 'crypto';

/**
 * Example 1: Register a new service
 */
export async function registerExampleService() {
    try {
        const service = await certificateService.registerService({
            serviceName: 'notification-service',
            displayName: 'Notification Service',
            description: 'Handles email, SMS, and push notification delivery',
            serviceType: 'worker',
            allowedScopes: [
                'read:tenant',
                'read:user',
                'write:notification',
                'read:audit'
            ]
        });

        console.log('Service registered:', service);
        return service;
    } catch (error) {
        console.error('Failed to register service:', error.message);
        throw error;
    }
}

/**
 * Example 2: Generate certificate for a service
 */
export async function generateExampleCertificate(serviceId) {
    try {
        // Generate RSA key pair
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

        // Generate certificate
        const certificate = await certificateService.generateCertificate(serviceId, {
            validityDays: 90,
            publicKey,
            privateKey
        });

        console.log('Certificate generated:', {
            certificateId: certificate.certificateId,
            fingerprint: certificate.fingerprint,
            validUntil: certificate.notAfter
        });

        return { certificate, privateKey };
    } catch (error) {
        console.error('Failed to generate certificate:', error.message);
        throw error;
    }
}

/**
 * Example 3: Generate a service JWT token
 */
export async function generateExampleServiceToken() {
    try {
        const token = await serviceJWTService.generateToken({
            serviceId: 'service-uuid-here',
            serviceName: 'notification-service',
            scopes: ['read:tenant', 'write:notification'],
            audience: 'api-gateway',
            expiresIn: '15m'
        });

        console.log('Service token generated:', token);
        
        // Decode to inspect (for demonstration)
        const decoded = serviceJWTService.decodeToken(token);
        console.log('Token payload:', decoded.payload);

        return token;
    } catch (error) {
        console.error('Failed to generate token:', error.message);
        throw error;
    }
}

/**
 * Example 4: Complete service-to-service authentication flow
 */
export async function exampleServiceToServiceAuth() {
    try {
        // Step 1: Generate authentication request
        const authRequest = await serviceJWTService.generateServiceRequest({
            fromService: 'notification-service',
            toService: 'api-gateway',
            scopes: ['read:tenant', 'write:notification']
        });

        console.log('Auth request generated:', {
            token: authRequest.token.substring(0, 20) + '...',
            certificateFingerprint: authRequest.certificate.fingerprint
        });

        // Step 2: Validate on receiving end
        const validation = await serviceJWTService.validateServiceAuth({
            certificateFingerprint: authRequest.certificate.fingerprint,
            token: authRequest.token,
            expectedAudience: 'api-gateway',
            requiredScopes: ['read:tenant']
        });

        console.log('Validation result:', {
            authenticated: validation.authenticated,
            serviceName: validation.service?.serviceName,
            scopes: validation.scopes
        });

        return validation;
    } catch (error) {
        console.error('Service-to-service auth failed:', error.message);
        throw error;
    }
}

/**
 * Example 5: Using service auth middleware in routes
 */
export function exampleProtectedRoutes() {
    const express = require('express');
    const { requireServiceAuth, requireServiceScopes } = require('../middleware/serviceAuth.js');
    
    const router = express.Router();

    // Basic service auth - any authenticated service
    router.post('/internal/action', 
        requireServiceAuth(),
        async (req, res) => {
            const service = req.serviceAuth.service;
            res.json({
                success: true,
                message: `Hello ${service.serviceName}`,
                scopes: req.serviceAuth.scopes
            });
        }
    );

    // Require specific scopes
    router.post('/internal/sensitive', 
        requireServiceAuth({ scopes: ['write:data', 'admin:system'] }),
        async (req, res) => {
            res.json({
                success: true,
                message: 'Sensitive operation completed'
            });
        }
    );

    // Check scopes in handler
    router.post('/internal/flexible',
        requireServiceAuth(),
        async (req, res) => {
            if (req.serviceAuth.scopes.includes('admin:system')) {
                // Admin operation
                return res.json({ admin: true });
            }
            // Regular operation
            res.json({ admin: false });
        }
    );

    return router;
}

/**
 * Example 6: Making authenticated HTTP requests between services
 */
export async function exampleMakeServiceRequest() {
    const axios = require('axios');

    try {
        // Generate auth for the request
        const authRequest = await serviceJWTService.generateServiceRequest({
            fromService: 'worker-service',
            toService: 'api-gateway',
            scopes: ['read:tenant', 'read:user']
        });

        // Make HTTP request with service credentials
        const response = await axios.post(
            'https://api.example.com/internal/action',
            {
                data: 'payload'
            },
            {
                headers: {
                    'Authorization': `Bearer ${authRequest.token}`,
                    'X-Client-Cert-Fingerprint': authRequest.certificate.fingerprint,
                    'Content-Type': 'application/json'
                },
                // In production with mTLS, you'd also provide client cert:
                // httpsAgent: new https.Agent({
                //     cert: fs.readFileSync('client-cert.pem'),
                //     key: fs.readFileSync('client-key.pem'),
                //     ca: fs.readFileSync('ca-cert.pem')
                // })
            }
        );

        console.log('Service request successful:', response.data);
        return response.data;

    } catch (error) {
        console.error('Service request failed:', error.message);
        throw error;
    }
}

/**
 * Example 7: Bootstrap script - Register all internal services
 */
export async function bootstrapInternalServices() {
    const services = [
        {
            serviceName: 'api-gateway',
            displayName: 'API Gateway',
            description: 'Main API entry point',
            serviceType: 'api',
            allowedScopes: ['read:*', 'write:*', 'admin:*']
        },
        {
            serviceName: 'notification-worker',
            displayName: 'Notification Worker',
            description: 'Background notification processor',
            serviceType: 'worker',
            allowedScopes: ['read:tenant', 'read:user', 'write:notification']
        },
        {
            serviceName: 'analytics-engine',
            displayName: 'Analytics Engine',
            description: 'Data analytics and reporting',
            serviceType: 'worker',
            allowedScopes: ['read:tenant', 'read:expense', 'read:goal', 'write:analytics']
        },
        {
            serviceName: 'scheduled-jobs',
            displayName: 'Scheduled Jobs Runner',
            description: 'Cron job scheduler and executor',
            serviceType: 'scheduler',
            allowedScopes: ['read:*', 'write:job-execution', 'admin:cleanup']
        }
    ];

    console.log('Bootstrapping internal services...');

    for (const serviceData of services) {
        try {
            // Check if service already exists
            const existing = await certificateService.getServiceByName(serviceData.serviceName);
            
            if (existing) {
                console.log(`✓ Service already exists: ${serviceData.serviceName}`);
                continue;
            }

            // Register service
            const service = await certificateService.registerService(serviceData);
            console.log(`✓ Registered: ${service.serviceName}`);

            // Generate certificate
            const { publicKey, privateKey } = await new Promise((resolve, reject) => {
                crypto.generateKeyPair('rsa', {
                    modulusLength: 2048,
                    publicKeyEncoding: { type: 'spki', format: 'pem' },
                    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
                }, (err, publicKey, privateKey) => {
                    if (err) reject(err);
                    else resolve({ publicKey, privateKey });
                });
            });

            const certificate = await certificateService.generateCertificate(service.id, {
                validityDays: 90,
                publicKey,
                privateKey
            });

            console.log(`  ✓ Certificate: ${certificate.certificateId}`);
            console.log(`  ✓ Expires: ${certificate.notAfter.toISOString()}`);
            console.log(`  ✓ Fingerprint: ${certificate.fingerprint.substring(0, 16)}...`);

        } catch (error) {
            console.error(`✗ Failed to bootstrap ${serviceData.serviceName}:`, error.message);
        }
    }

    console.log('Service bootstrap complete!');
}

/**
 * Example 8: Scope definitions and best practices
 */
export const SCOPE_DEFINITIONS = {
    // Read scopes
    'read:tenant': 'Read tenant information',
    'read:user': 'Read user profiles',
    'read:expense': 'Read expense records',
    'read:goal': 'Read goal data',
    'read:audit': 'Read audit logs',
    'read:analytics': 'Read analytics data',
    
    // Write scopes
    'write:tenant': 'Create/update tenants',
    'write:user': 'Create/update users',
    'write:expense': 'Create/update expenses',
    'write:goal': 'Create/update goals',
    'write:notification': 'Send notifications',
    'write:analytics': 'Write analytics data',
    
    // Admin scopes
    'admin:system': 'System administration',
    'admin:cleanup': 'Run cleanup operations',
    'admin:monitoring': 'Access monitoring data',
    
    // Wildcard scopes (use with caution)
    'read:*': 'Read all resources',
    'write:*': 'Write all resources',
    'admin:*': 'Full administrative access'
};

/**
 * Run all examples
 */
export async function runAllExamples() {
    console.log('='.repeat(60));
    console.log('SERVICE AUTHENTICATION EXAMPLES');
    console.log('='.repeat(60));

    try {
        console.log('\n1. Registering service...');
        const service = await registerExampleService();

        console.log('\n2. Generating certificate...');
        const { certificate } = await generateExampleCertificate(service.id);

        console.log('\n3. Generating service token...');
        await generateExampleServiceToken();

        console.log('\n4. Full auth flow...');
        await exampleServiceToServiceAuth();

        console.log('\n✓ All examples completed successfully!');
    } catch (error) {
        console.error('\n✗ Examples failed:', error.message);
    }
}

// Export for CLI usage
if (require.main === module) {
    runAllExamples();
}
