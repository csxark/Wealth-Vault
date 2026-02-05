import governanceService from '../services/governanceService.js';

/**
 * Middleware to check if user has required permissions in a vault
 */
export const requirePermission = (permission) => {
    return async (req, res, next) => {
        try {
            const { vaultId } = req.body || req.query || req.params;

            if (!vaultId) {
                return res.status(400).json({ success: false, message: 'Vault ID required' });
            }

            const role = await governanceService.getUserRole(vaultId, req.user.id);

            if (!role) {
                return res.status(403).json({ success: false, message: 'No role assigned in this vault' });
            }

            if (!role.isActive) {
                return res.status(403).json({ success: false, message: 'Role is inactive' });
            }

            // Check specific permission
            if (permission && !role.permissions[permission]) {
                return res.status(403).json({
                    success: false,
                    message: `Insufficient permissions: ${permission} required`
                });
            }

            // Attach role to request for downstream use
            req.vaultRole = role;
            next();
        } catch (error) {
            console.error('[Role Guard] Error:', error);
            return res.status(500).json({ success: false, message: error.message });
        }
    };
};

/**
 * Check if action requires approval
 */
export const checkApprovalRequired = async (req, res, next) => {
    try {
        const { vaultId } = req.body || req.query || req.params;
        const { amount } = req.body;
        const action = req.method === 'POST' ? 'create' : req.method === 'PUT' ? 'update' : 'delete';

        if (!vaultId) return next(); // Skip if no vault context

        const requiresApproval = await governanceService.requiresApproval(
            vaultId,
            req.user.id,
            'expense',
            amount
        );

        if (requiresApproval) {
            // Instead of blocking, create approval request and return pending status
            const request = await governanceService.createApprovalRequest(
                vaultId,
                req.user.id,
                'expense',
                action,
                req.body,
                amount
            );

            return res.status(202).json({
                success: true,
                message: 'Action requires approval',
                requiresApproval: true,
                approvalRequest: request
            });
        }

        next();
    } catch (error) {
        console.error('[Approval Check] Error:', error);
        next(); // Continue on error
    }
};

/**
 * Role hierarchy checker
 */
export const requireRole = (allowedRoles) => {
    return async (req, res, next) => {
        try {
            const { vaultId } = req.body || req.query || req.params;

            if (!vaultId) {
                return res.status(400).json({ success: false, message: 'Vault ID required' });
            }

            const role = await governanceService.getUserRole(vaultId, req.user.id);

            if (!role || !allowedRoles.includes(role.role)) {
                return res.status(403).json({
                    success: false,
                    message: `Role ${allowedRoles.join(' or ')} required`
                });
            }

            req.vaultRole = role;
            next();
        } catch (error) {
            console.error('[Role Hierarchy] Error:', error);
            return res.status(500).json({ success: false, message: error.message });
        }
    };
};

export default {
    requirePermission,
    checkApprovalRequired,
    requireRole
};
