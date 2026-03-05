/**
 * Goal Permission Middleware
 * 
 * Provides granular permission checking for goal operations
 * Integrates with goal sharing service to validate user permissions
 * Supports role-based access control (viewer, contributor, manager, owner)
 * 
 * Issue #611: Collaborative Goal Sharing with Permission Inheritance
 */

import goalSharingService from '../services/goalSharingService.js';
import { eq, and } from 'drizzle-orm';
import db from '../config/db.js';
import { goals } from '../db/schema.js';
import logger from '../utils/logger.js';

/**
 * Check if user has specific permission for a goal
 * Usage: requireGoalPermission('canView')
 */
export const requireGoalPermission = (permission) => {
    return async (req, res, next) => {
        try {
            const goalId = req.params.goalId || req.body.goalId;
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            if (!goalId) {
                return res.status(400).json({
                    success: false,
                    error: 'Goal ID is required'
                });
            }

            // Verify goal exists
            const goal = await db.query.goals.findFirst({
                where: and(
                    eq(goals.id, goalId),
                    eq(goals.tenantId, tenantId)
                )
            });

            if (!goal) {
                return res.status(404).json({
                    success: false,
                    error: 'Goal not found'
                });
            }

            // Check if user is goal owner (owners have all permissions)
            if (goal.userId === userId) {
                req.goal = goal;
                req.isGoalOwner = true;
                return next();
            }

            // Check share permission
            const hasPermission = await goalSharingService.checkPermission(goalId, userId, permission);

            if (!hasPermission) {
                return res.status(403).json({
                    success: false,
                    error: `You do not have the required permission (${permission}) for this goal`,
                    requiredPermission: permission
                });
            }

            // Attach goal to request for later use
            req.goal = goal;
            req.isGoalOwner = false;

            next();
        } catch (error) {
            logger.error('Error checking goal permission:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to verify permissions'
            });
        }
    };
};

/**
 * Check if user can view goal
 */
export const canViewGoal = requireGoalPermission('canView');

/**
 * Check if user can contribute to goal
 */
export const canContributeToGoal = requireGoalPermission('canContribute');

/**
 * Check if user can edit goal
 */
export const canEditGoal = requireGoalPermission('canEdit');

/**
 * Check if user can delete goal
 */
export const canDeleteGoal = requireGoalPermission('canDelete');

/**
 * Check if user can share goal
 */
export const canShareGoal = requireGoalPermission('canShare');

/**
 * Check if user can view contributions
 */
export const canViewContributions = requireGoalPermission('canViewContributions');

/**
 * Check if user can edit their own contributions
 */
export const canEditOwnContributions = requireGoalPermission('canEditOwnContributions');

/**
 * Check if user can edit all contributions
 */
export const canEditAllContributions = requireGoalPermission('canEditAllContributions');

/**
 * Check if user can withdraw from goal
 */
export const canWithdraw = requireGoalPermission('canWithdraw');

/**
 * Check if user can change goal details
 */
export const canChangeGoalDetails = requireGoalPermission('canChangeGoalDetails');

/**
 * Check if user is goal owner
 */
export const requireGoalOwner = async (req, res, next) => {
    try {
        const goalId = req.params.goalId || req.body.goalId;
        const userId = req.user.id;
        const tenantId = req.user.tenantId;

        if (!goalId) {
            return res.status(400).json({
                success: false,
                error: 'Goal ID is required'
            });
        }

        // Verify goal exists and user is owner
        const goal = await db.query.goals.findFirst({
            where: and(
                eq(goals.id, goalId),
                eq(goals.tenantId, tenantId),
                eq(goals.userId, userId)
            )
        });

        if (!goal) {
            return res.status(404).json({
                success: false,
                error: 'Goal not found or you are not the owner'
            });
        }

        req.goal = goal;
        req.isGoalOwner = true;

        next();
    } catch (error) {
        logger.error('Error checking goal ownership:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to verify ownership'
        });
    }
};

/**
 * Check multiple permissions (user must have at least one)
 * Usage: requireAnyGoalPermission(['canEdit', 'canChangeGoalDetails'])
 */
export const requireAnyGoalPermission = (permissions) => {
    return async (req, res, next) => {
        try {
            const goalId = req.params.goalId || req.body.goalId;
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            if (!goalId) {
                return res.status(400).json({
                    success: false,
                    error: 'Goal ID is required'
                });
            }

            // Verify goal exists
            const goal = await db.query.goals.findFirst({
                where: and(
                    eq(goals.id, goalId),
                    eq(goals.tenantId, tenantId)
                )
            });

            if (!goal) {
                return res.status(404).json({
                    success: false,
                    error: 'Goal not found'
                });
            }

            // Check if user is goal owner
            if (goal.userId === userId) {
                req.goal = goal;
                req.isGoalOwner = true;
                return next();
            }

            // Check if user has any of the required permissions
            let hasAnyPermission = false;
            for (const permission of permissions) {
                const hasPermission = await goalSharingService.checkPermission(goalId, userId, permission);
                if (hasPermission) {
                    hasAnyPermission = true;
                    break;
                }
            }

            if (!hasAnyPermission) {
                return res.status(403).json({
                    success: false,
                    error: `You do not have any of the required permissions for this goal`,
                    requiredPermissions: permissions
                });
            }

            req.goal = goal;
            req.isGoalOwner = false;

            next();
        } catch (error) {
            logger.error('Error checking goal permissions:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to verify permissions'
            });
        }
    };
};

/**
 * Check multiple permissions (user must have all)
 * Usage: requireAllGoalPermissions(['canView', 'canContribute'])
 */
export const requireAllGoalPermissions = (permissions) => {
    return async (req, res, next) => {
        try {
            const goalId = req.params.goalId || req.body.goalId;
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            if (!goalId) {
                return res.status(400).json({
                    success: false,
                    error: 'Goal ID is required'
                });
            }

            // Verify goal exists
            const goal = await db.query.goals.findFirst({
                where: and(
                    eq(goals.id, goalId),
                    eq(goals.tenantId, tenantId)
                )
            });

            if (!goal) {
                return res.status(404).json({
                    success: false,
                    error: 'Goal not found'
                });
            }

            // Check if user is goal owner
            if (goal.userId === userId) {
                req.goal = goal;
                req.isGoalOwner = true;
                return next();
            }

            // Check if user has all required permissions
            for (const permission of permissions) {
                const hasPermission = await goalSharingService.checkPermission(goalId, userId, permission);
                if (!hasPermission) {
                    return res.status(403).json({
                        success: false,
                        error: `You do not have the required permission (${permission}) for this goal`,
                        requiredPermissions: permissions,
                        missingPermission: permission
                    });
                }
            }

            req.goal = goal;
            req.isGoalOwner = false;

            next();
        } catch (error) {
            logger.error('Error checking goal permissions:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to verify permissions'
            });
        }
    };
};

/**
 * Check contribution permissions
 * Validates if user can edit/delete a specific contribution
 */
export const canModifyContribution = async (req, res, next) => {
    try {
        const contributionId = req.params.contributionId || req.body.contributionId;
        const goalId = req.params.goalId || req.body.goalId;
        const userId = req.user.id;
        const tenantId = req.user.tenantId;

        if (!contributionId || !goalId) {
            return res.status(400).json({
                success: false,
                error: 'Goal ID and Contribution ID are required'
            });
        }

        // Get contribution
        const contribution = await db.query.goalContributionLineItems.findFirst({
            where: and(
                eq(schema.goalContributionLineItems.id, contributionId),
                eq(schema.goalContributionLineItems.goalId, goalId),
                eq(schema.goalContributionLineItems.tenantId, tenantId)
            )
        });

        if (!contribution) {
            return res.status(404).json({
                success: false,
                error: 'Contribution not found'
            });
        }

        // Check if user created the contribution
        if (contribution.userId === userId) {
            // Check if user can edit own contributions
            const canEditOwn = await goalSharingService.checkPermission(goalId, userId, 'canEditOwnContributions');
            if (canEditOwn) {
                req.contribution = contribution;
                req.isContributionOwner = true;
                return next();
            }
        }

        // Check if user can edit all contributions
        const canEditAll = await goalSharingService.checkPermission(goalId, userId, 'canEditAllContributions');
        if (canEditAll) {
            req.contribution = contribution;
            req.isContributionOwner = false;
            return next();
        }

        // Check if user is goal owner
        const goal = await db.query.goals.findFirst({
            where: eq(goals.id, goalId)
        });

        if (goal && goal.userId === userId) {
            req.contribution = contribution;
            req.isContributionOwner = false;
            return next();
        }

        res.status(403).json({
            success: false,
            error: 'You do not have permission to modify this contribution'
        });
    } catch (error) {
        logger.error('Error checking contribution permissions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to verify contribution permissions'
        });
    }
};

export default {
    requireGoalPermission,
    canViewGoal,
    canContributeToGoal,
    canEditGoal,
    canDeleteGoal,
    canShareGoal,
    canViewContributions,
    canEditOwnContributions,
    canEditAllContributions,
    canWithdraw,
    canChangeGoalDetails,
    requireGoalOwner,
    requireAnyGoalPermission,
    requireAllGoalPermissions,
    canModifyContribution
};
