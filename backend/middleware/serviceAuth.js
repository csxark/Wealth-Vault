import serviceJWTService from '../services/serviceJWTService.js';
import certificateService from '../services/certificateService.js';
import logger from '../utils/logger.js';

/**
 * Service Authentication Middleware - Zero-trust service-to-service auth
 * 
 * Validates both mTLS certificates and scoped JWTs for internal service requests.
 * Enforces certificate trust chain, token expiration, scope-based authorization.
 * 
 * Usage:
 *   router.post('/internal/action', requireServiceAuth(), handler);
 *   router.post('/internal/action', requireServiceAuth({ scopes: ['write:data'] }), handler);
 */

/**
 * Extract certificate fingerprint from request
 * In production, this would come from the TLS layer
 * For development, it can be sent in a header
 * @param {Object} req - Express request
 * @returns {string|null} Certificate fingerprint
 * @private
 */
function extractCertificateFingerprint(req) {
    // In production with proper mTLS setup:
    // return req.socket.getPeerCertificate()?.fingerprint256;
    
    // For development/testing, allow header-based cert info
    if (process.env.NODE_ENV === 'development' || process.env.ALLOW_CERT_HEADER === 'true') {
        return req.headers['x-client-cert-fingerprint'];
    }
    
    // Production: extract from TLS socket
    try {
        const peerCert = req.socket.getPeerCertificate();
        if (peerCert && peerCert.fingerprint256) {
            return peerCert.fingerprint256.replace(/:/g, '').toLowerCase();
        }
    } catch (error) {
        logger.error('Failed to extract peer certificate', { error: error.message });
    }
    
    return null;
}

/**
 * Extract service token from request
 * @param {Object} req - Express request
 * @returns {string|null} Service token
 * @private
 */
function extractServiceToken(req) {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }
    
    // Check X-Service-Token header
    const serviceTokenHeader = req.headers['x-service-token'];
    if (serviceTokenHeader) {
        return serviceTokenHeader;
    }
    
    return null;
}

/**
 * Middleware to require service authentication
 * @param {Object} options - Middleware options
 * @param {Array<string>} options.scopes - Required scopes for this endpoint
 * @param {boolean} options.requireMTLS - Require mTLS (default: true)
 * @param {boolean} options.requireJWT - Require JWT (default: true)
 * @param {string} options.audience - Expected audience (default: current service name)
 * @returns {Function} Express middleware
 */
export function requireServiceAuth(options = {}) {
    const {
        scopes = [],
        requireMTLS = true,
        requireJWT = true,
        audience = process.env.SERVICE_NAME || 'api-gateway'
    } = options;

    return async (req, res, next) => {
        try {
            const requestId = req.id || req.headers['x-request-id'];
            
            // Extract certificate fingerprint
            const certificateFingerprint = extractCertificateFingerprint(req);
            
            if (requireMTLS && !certificateFingerprint) {
                logger.warn('Service request missing certificate', {
                    requestId,
                    ip: req.ip,
                    path: req.path
                });
                
                return res.status(401).json({
                    success: false,
                    message: 'Service authentication required: missing client certificate',
                    code: 'MISSING_CERTIFICATE'
                });
            }

            // Extract service token
            const token = extractServiceToken(req);
            
            if (requireJWT && !token) {
                logger.warn('Service request missing JWT token', {
                    requestId,
                    ip: req.ip,
                    path: req.path
                });
                
                return res.status(401).json({
                    success: false,
                    message: 'Service authentication required: missing service token',
                    code: 'MISSING_TOKEN'
                });
            }

            // Validate authentication
            const authResult = await serviceJWTService.validateServiceAuth({
                certificateFingerprint: certificateFingerprint || 'dev-mode-skip',
                token: token || '',
                expectedAudience: audience,
                requiredScopes: scopes
            });

            if (!authResult.authenticated) {
                // Log failed authentication attempt
                await certificateService.logAuthAttempt({
                    serviceName: 'unknown',
                    certificateId: null,
                    authMethod: authResult.method,
                    outcome: 'failure',
                    failureReason: authResult.reason,
                    requestedScopes: scopes,
                    grantedScopes: [],
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent'],
                    requestId,
                    metadata: {
                        path: req.path,
                        method: req.method
                    }
                });

                logger.warn('Service authentication failed', {
                    requestId,
                    reason: authResult.reason,
                    method: authResult.method,
                    ip: req.ip,
                    path: req.path
                });

                return res.status(403).json({
                    success: false,
                    message: 'Service authentication failed',
                    reason: authResult.reason,
                    code: 'AUTH_FAILED'
                });
            }

            // Authentication successful - attach service info to request
            req.serviceAuth = {
                service: authResult.service,
                scopes: authResult.scopes,
                certificate: authResult.certificate,
                authenticated: true
            };

            // Log successful authentication
            await certificateService.logAuthAttempt({
                serviceId: authResult.service.id,
                serviceName: authResult.service.serviceName,
                certificateId: authResult.certificate.certificateId,
                authMethod: authResult.method,
                outcome: 'success',
                requestedScopes: scopes,
                grantedScopes: authResult.scopes,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                requestId,
                metadata: {
                    path: req.path,
                    method: req.method
                }
            });

            // Update service last auth timestamp
            await certificateService.getServiceByName(authResult.service.serviceName)
                .then(service => {
                    if (service) {
                        // Update last auth in background (don't await)
                        certificateService.updateServiceScopes(service.id, service.allowedScopes)
                            .catch(err => logger.error('Failed to update last auth', { error: err.message }));
                    }
                });

            logger.info('Service authenticated successfully', {
                requestId,
                serviceName: authResult.service.serviceName,
                serviceType: authResult.service.serviceType,
                scopes: authResult.scopes,
                path: req.path
            });

            next();

        } catch (error) {
            logger.error('Service authentication middleware error', {
                error: error.message,
                stack: error.stack,
                path: req.path
            });

            return res.status(500).json({
                success: false,
                message: 'Service authentication error',
                code: 'AUTH_ERROR'
            });
        }
    };
}

/**
 * Middleware to check if service has specific scopes
 * (Must be used after requireServiceAuth)
 * @param {Array<string>} requiredScopes - Required scopes
 * @returns {Function} Express middleware
 */
export function requireServiceScopes(requiredScopes = []) {
    return async (req, res, next) => {
        if (!req.serviceAuth || !req.serviceAuth.authenticated) {
            return res.status(401).json({
                success: false,
                message: 'Service not authenticated',
                code: 'NOT_AUTHENTICATED'
            });
        }

        const { scopes } = req.serviceAuth;
        const hasAllScopes = requiredScopes.every(scope => scopes.includes(scope));

        if (!hasAllScopes) {
            const missingScopes = requiredScopes.filter(scope => !scopes.includes(scope));
            
            logger.warn('Service missing required scopes', {
                serviceName: req.serviceAuth.service.serviceName,
                requiredScopes,
                availableScopes: scopes,
                missingScopes
            });

            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions',
                code: 'INSUFFICIENT_SCOPES',
                requiredScopes,
                missingScopes
            });
        }

        next();
    };
}

/**
 * Middleware to allow either user auth OR service auth
 * Useful for endpoints that can be called by both users and services
 * @param {Object} userAuthMiddleware - User authentication middleware (e.g., protect)
 * @param {Object} serviceAuthOptions - Service auth options
 * @returns {Function} Express middleware
 */
export function requireUserOrServiceAuth(userAuthMiddleware, serviceAuthOptions = {}) {
    return async (req, res, next) => {
        // Try user authentication first
        const userAuth = new Promise((resolve) => {
            userAuthMiddleware(req, res, (err) => {
                if (err || !req.user) {
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });

        const isUserAuthenticated = await userAuth;
        
        if (isUserAuthenticated) {
            // User authenticated successfully
            req.authType = 'user';
            return next();
        }

        // Try service authentication
        const serviceAuthMiddleware = requireServiceAuth(serviceAuthOptions);
        serviceAuthMiddleware(req, res, (err) => {
            if (err || !req.serviceAuth) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required: neither user nor service credentials provided',
                    code: 'AUTH_REQUIRED'
                });
            }
            
            req.authType = 'service';
            next();
        });
    };
}

/**
 * Extract service identity from request
 * (Must be used after requireServiceAuth)
 * @param {Object} req - Express request
 * @returns {Object|null} Service identity
 */
export function getServiceIdentity(req) {
    return req.serviceAuth?.service || null;
}

/**
 * Check if request is from a specific service
 * (Must be used after requireServiceAuth)
 * @param {Object} req - Express request
 * @param {string} serviceName - Service name to check
 * @returns {boolean} True if request is from specified service
 */
export function isService(req, serviceName) {
    return req.serviceAuth?.service?.serviceName === serviceName;
}

/**
 * Check if service has a specific scope
 * (Must be used after requireServiceAuth)
 * @param {Object} req - Express request
 * @param {string} scope - Scope to check
 * @returns {boolean} True if service has the scope
 */
export function hasServiceScope(req, scope) {
    return req.serviceAuth?.scopes?.includes(scope) || false;
}
