import db from '../config/db.js';
import { vaultGroups } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Vault Guard - Validates access to vault groups
 */
export const checkGroupAccess = (role = 'viewer') => {
    return async (req, res, next) => {
        try {
            const groupId = req.params.groupId || req.body.groupId;
            const userId = req.user.id;

            if (!groupId) return next();

            const [group] = await db.select()
                .from(vaultGroups)
                .where(
                    and(
                        eq(vaultGroups.id, groupId),
                        eq(vaultGroups.userId, userId)
                    )
                )
                .limit(1);

            if (!group) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied to this vault group'
                });
            }

            req.vaultGroup = group;
            next();
        } catch (error) {
            console.error('Group access check failed:', error);
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    };
};

/**
 * Validate vault identifiers
 */
export const validateVaults = (req, res, next) => {
    const { vaultIds } = req.body;
    if (!Array.isArray(vaultIds) || vaultIds.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'At least one valid vault ID must be provided'
        });
    }
    next();
};
