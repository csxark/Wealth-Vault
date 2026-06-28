/**
 * Tenant Management Routes
 * 
 * API endpoints for managing tenants, members, and team operations
 * All routes require authentication via protect middleware
 */

import express from 'express';
import { body, validationResult, param } from 'express-validator';
import { protect } from '../middleware/auth.js';
import {
  validateTenantAccess,
  requireTenantRole,
  requireTenantPermission,
  extractTenantId
} from '../middleware/tenantMiddleware.js';
import {
  createTenant,
  getTenant,
  getUserTenants,
  addTenantMember,
  removeTenantMember,
  updateMemberRole,
  getTenantMembers,
  generateInviteToken,
  hasPermission,
  getTierFeatures
} from '../services/tenantService.js';
import {
  extractTenantRegionConfig,
  getRegionComplianceDashboard,
  getRegionMetrics,
  getTenantFailoverRunbook,
  recordFailoverDrill,
  updateTenantResidencyPolicy
} from '../services/multiRegionService.js';
import { enforceTenantRegionRouting, enforceResidencyDataClass } from '../middleware/regionRouting.js';
import {
  listTenantRoles,
  createTenantRole,
  updateTenantRole,
  deleteTenantRole,
  listTenantPermissions,
  createTenantPermission,
  assignRolesToMember,
  setMemberCustomPermissions,
  getMemberByUserId
} from '../services/rbacService.js';
import { logger } from '../utils/logger.js';

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

// ============== TENANT MANAGEMENT ==============

/**
 * POST /api/tenants
 * Create a new tenant
 */
router.post(
  '/',
  protect,
  [
    body('name').notEmpty().withMessage('Tenant name is required'),
    body('description').optional().isString(),
    body('slug').optional().matches(/^[a-z0-9-]+$/).withMessage('Invalid slug format')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { name, description = '', slug, tier = 'free', homeRegion, residencyPolicy } = req.body;

      const tenantData = {
        name,
        description,
        ownerId: req.user.id,
        tier,
        slug: slug ? slug.toLowerCase() : undefined,
        homeRegion,
        residencyPolicy
      };

      const { tenant, message } = await createTenant(tenantData);

      logger.info('Tenant created via API', {
        tenantId: tenant.id,
        userId: req.user.id
      });

      return res.status(201).json({
        success: true,
        message,
        data: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          tier: tenant.tier,
          createdAt: tenant.createdAt
        }
      });
    } catch (error) {
      logger.error('Error creating tenant:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error creating tenant'
      });
    }
  }
);

/**
 * GET /api/tenants
 * Get all tenants for current user
 */
router.get('/', protect, async (req, res) => {
  try {
    const tenants = await getUserTenants(req.user.id);

    return res.status(200).json({
      success: true,
      data: tenants.map(t => ({
        id: t.tenant.id,
        name: t.tenant.name,
        slug: t.tenant.slug,
        tier: t.tenant.tier,
        role: t.role,
        joinedAt: t.joinedAt
      }))
    });
  } catch (error) {
    logger.error('Error fetching user tenants:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching tenants'
    });
  }
});

/**
 * GET /api/tenants/:tenantId
 * Get tenant details
 */
router.get(
  '/:tenantId',
  protect,
  validateTenantAccess,
  enforceTenantRegionRouting(),
  async (req, res) => {
    try {
      const tenant = await getTenant(req.params.tenantId);
      const regionConfig = extractTenantRegionConfig(tenant);

      return res.status(200).json({
        success: true,
        data: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          description: tenant.description,
          tier: tenant.tier,
          features: tenant.features,
          settings: tenant.settings,
          memberCount: tenant.memberCount,
          maxMembers: tenant.maxMembers,
          homeRegion: regionConfig.homeRegion,
          residencyPolicy: regionConfig.residencyPolicy,
          createdAt: tenant.createdAt,
          updatedAt: tenant.updatedAt
        }
      });
    } catch (error) {
      logger.error('Error fetching tenant:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching tenant'
      });
    }
  }
);

/**
 * PUT /api/tenants/:tenantId
 * Update tenant (owner/admin only)
 */
router.put(
  '/:tenantId',
  protect,
  validateTenantAccess,
  enforceTenantRegionRouting(),
  enforceResidencyDataClass(),
  requireTenantRole(['owner', 'admin']),
  [
    body('name').optional().notEmpty().withMessage('Name cannot be empty'),
    body('description').optional().isString(),
    body('settings').optional().isObject(),
    body('homeRegion').optional().isString(),
    body('residencyPolicy').optional().isObject()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { homeRegion, residencyPolicy } = req.body;

      if (homeRegion || residencyPolicy) {
        const updated = await updateTenantResidencyPolicy({
          tenantId: req.params.tenantId,
          homeRegion,
          residencyPolicy: residencyPolicy || {},
          actorUserId: req.user.id
        });

        return res.status(200).json({
          success: true,
          message: 'Tenant residency policy updated successfully',
          data: updated
        });
      }

      return res.status(200).json({
        success: true,
        message: 'No residency update requested'
      });
    } catch (error) {
      logger.error('Error updating tenant:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error updating tenant'
      });
    }
  }
);

/**
 * GET /api/tenants/:tenantId/residency
 * Get tenant residency and region routing profile
 */
router.get(
  '/:tenantId/residency',
  protect,
  validateTenantAccess,
  enforceTenantRegionRouting(),
  async (req, res) => {
    try {
      const tenant = await getTenant(req.params.tenantId);
      const regionProfile = extractTenantRegionConfig(tenant);

      return res.status(200).json({
        success: true,
        data: {
          tenantId: tenant.id,
          homeRegion: regionProfile.homeRegion,
          residencyPolicy: regionProfile.residencyPolicy,
          regionMetrics: getRegionMetrics()
        }
      });
    } catch (error) {
      logger.error('Error fetching tenant residency profile:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error fetching tenant residency profile'
      });
    }
  }
);

/**
 * GET /api/tenants/:tenantId/residency/compliance
 * Get tenant regional compliance dashboard
 */
router.get(
  '/:tenantId/residency/compliance',
  protect,
  validateTenantAccess,
  enforceTenantRegionRouting({ allowReadRedirect: false }),
  async (req, res) => {
    try {
      const dashboard = await getRegionComplianceDashboard({ tenantId: req.params.tenantId });

      return res.status(200).json({
        success: true,
        data: dashboard
      });
    } catch (error) {
      logger.error('Error fetching tenant residency compliance dashboard:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error fetching tenant residency compliance dashboard'
      });
    }
  }
);

/**
 * PUT /api/tenants/:tenantId/residency
 * Update tenant home region and residency policy
 */
router.put(
  '/:tenantId/residency',
  protect,
  validateTenantAccess,
  enforceTenantRegionRouting(),
  requireTenantRole(['owner', 'admin']),
  [
    body('homeRegion').optional().isString(),
    body('residencyPolicy').optional().isObject()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const updated = await updateTenantResidencyPolicy({
        tenantId: req.params.tenantId,
        homeRegion: req.body.homeRegion,
        residencyPolicy: req.body.residencyPolicy || {},
        actorUserId: req.user.id
      });

      return res.status(200).json({
        success: true,
        message: 'Tenant residency policy updated successfully',
        data: updated
      });
    } catch (error) {
      logger.error('Error updating tenant residency policy:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error updating tenant residency policy'
      });
    }
  }
);

/**
 * GET /api/tenants/:tenantId/failover/runbook
 * Get tenant failover runbook and RPO/RTO targets
 */
router.get(
  '/:tenantId/failover/runbook',
  protect,
  validateTenantAccess,
  enforceTenantRegionRouting(),
  requireTenantRole(['owner', 'admin', 'manager']),
  async (req, res) => {
    try {
      const tenant = await getTenant(req.params.tenantId);
      const runbook = getTenantFailoverRunbook(tenant);

      return res.status(200).json({
        success: true,
        data: runbook
      });
    } catch (error) {
      logger.error('Error fetching tenant failover runbook:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error fetching tenant failover runbook'
      });
    }
  }
);

/**
 * POST /api/tenants/:tenantId/failover/drill
 * Record failover drill execution for RPO/RTO evidence
 */
router.post(
  '/:tenantId/failover/drill',
  protect,
  validateTenantAccess,
  enforceTenantRegionRouting(),
  requireTenantRole(['owner', 'admin']),
  [
    body('notes').optional().isString()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const result = await recordFailoverDrill({
        tenantId: req.params.tenantId,
        actorUserId: req.user.id,
        notes: req.body.notes || ''
      });

      return res.status(200).json({
        success: true,
        message: 'Failover drill recorded',
        data: result
      });
    } catch (error) {
      logger.error('Error recording failover drill:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error recording failover drill'
      });
    }
  }
);

// ============== MEMBER MANAGEMENT ==============

/**
 * GET /api/tenants/:tenantId/members
 * Get all tenant members
 */
router.get(
  '/:tenantId/members',
  protect,
  validateTenantAccess,
  async (req, res) => {
    try {
      const members = await getTenantMembers(req.params.tenantId);

      return res.status(200).json({
        success: true,
        data: members
      });
    } catch (error) {
      logger.error('Error fetching tenant members:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching members'
      });
    }
  }
);

/**
 * POST /api/tenants/:tenantId/members
 * Add member to tenant (admin/owner only)
 */
router.post(
  '/:tenantId/members',
  protect,
  validateTenantAccess,
  requireTenantRole(['owner', 'admin']),
  [
    body('userId').isUUID().withMessage('Invalid user ID'),
    body('role')
      .optional()
      .isIn(['member', 'manager', 'viewer'])
      .withMessage('Invalid role')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { userId, role = 'member' } = req.body;

      const member = await addTenantMember(req.params.tenantId, userId, role);

      logger.info('Member added to tenant via API', {
        tenantId: req.params.tenantId,
        userId,
        requestedBy: req.user.id
      });

      return res.status(201).json({
        success: true,
        message: 'Member added successfully',
        data: {
          userId: member.userId,
          role: member.role,
          joinedAt: member.joinedAt
        }
      });
    } catch (error) {
      logger.error('Error adding member:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error adding member'
      });
    }
  }
);

/**
 * PUT /api/tenants/:tenantId/members/:userId/role
 * Update member role (owner/admin only)
 */
router.put(
  '/:tenantId/members/:userId/role',
  protect,
  validateTenantAccess,
  requireTenantRole(['owner', 'admin']),
  [
    body('role')
      .isIn(['member', 'manager', 'admin', 'viewer'])
      .withMessage('Invalid role')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { role } = req.body;

      const updated = await updateMemberRole(req.params.tenantId, req.params.userId, role);

      logger.info('Member role updated via API', {
        tenantId: req.params.tenantId,
        userId: req.params.userId,
        newRole: role,
        updatedBy: req.user.id
      });

      return res.status(200).json({
        success: true,
        message: 'Member role updated successfully',
        data: {
          role: updated.role
        }
      });
    } catch (error) {
      logger.error('Error updating member role:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error updating role'
      });
    }
  }
);

/**
 * DELETE /api/tenants/:tenantId/members/:userId
 * Remove member from tenant (owner/admin only)
 */
router.delete(
  '/:tenantId/members/:userId',
  protect,
  validateTenantAccess,
  requireTenantRole(['owner', 'admin']),
  async (req, res) => {
    try {
      await removeTenantMember(req.params.tenantId, req.params.userId);

      logger.info('Member removed from tenant via API', {
        tenantId: req.params.tenantId,
        userId: req.params.userId,
        removedBy: req.user.id
      });

      return res.status(200).json({
        success: true,
        message: 'Member removed successfully'
      });
    } catch (error) {
      logger.error('Error removing member:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error removing member'
      });
    }
  }
);

// ============== INVITE MANAGEMENT ==============

/**
 * POST /api/tenants/:tenantId/invite
 * Generate invite link for new member
 */
router.post(
  '/:tenantId/invite',
  protect,
  validateTenantAccess,
  requireTenantRole(['owner', 'admin']),
  [
    body('email').isEmail().withMessage('Invalid email address')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { email } = req.body;

      const { token, inviteLink } = await generateInviteToken(req.params.tenantId, email);

      logger.info('Invite generated', {
        tenantId: req.params.tenantId,
        email,
        generatedBy: req.user.id
      });

      return res.status(200).json({
        success: true,
        message: 'Invite generated successfully',
        data: {
          inviteLink,
          expiresIn: '7 days'
        }
      });
    } catch (error) {
      logger.error('Error generating invite:', error);
      return res.status(500).json({
        success: false,
        message: 'Error generating invite'
      });
    }
  }
);

// ============== TENANT SETTINGS ==============

/**
 * GET /api/tenants/:tenantId/rbac/roles
 * List all RBAC roles in tenant
 */
router.get(
  '/:tenantId/rbac/roles',
  protect,
  validateTenantAccess,
  requireTenantPermission(['rbac:role:manage', 'member:view']),
  async (req, res) => {
    try {
      const roles = await listTenantRoles(req.params.tenantId);

      return res.status(200).json({
        success: true,
        data: roles
      });
    } catch (error) {
      logger.error('Error fetching RBAC roles:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error fetching RBAC roles'
      });
    }
  }
);

/**
 * POST /api/tenants/:tenantId/rbac/roles
 * Create a custom RBAC role
 */
router.post(
  '/:tenantId/rbac/roles',
  protect,
  validateTenantAccess,
  requireTenantPermission(['rbac:role:manage']),
  [
    body('name').notEmpty().withMessage('Role name is required'),
    body('slug').matches(/^[a-z0-9-_]+$/).withMessage('Invalid role slug'),
    body('description').optional().isString(),
    body('parentRoleId').optional({ nullable: true }).isUUID().withMessage('Invalid parent role ID'),
    body('permissionKeys').optional().isArray().withMessage('permissionKeys must be an array')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const role = await createTenantRole({
        tenantId: req.params.tenantId,
        name: req.body.name,
        slug: req.body.slug,
        description: req.body.description,
        parentRoleId: req.body.parentRoleId || null,
        permissionKeys: req.body.permissionKeys || [],
        actorUserId: req.user.id
      });

      return res.status(201).json({
        success: true,
        message: 'RBAC role created successfully',
        data: role
      });
    } catch (error) {
      logger.error('Error creating RBAC role:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error creating RBAC role'
      });
    }
  }
);

/**
 * PUT /api/tenants/:tenantId/rbac/roles/:roleId
 * Update a RBAC role
 */
router.put(
  '/:tenantId/rbac/roles/:roleId',
  protect,
  validateTenantAccess,
  requireTenantPermission(['rbac:role:manage']),
  [
    body('name').optional().notEmpty().withMessage('Role name cannot be empty'),
    body('description').optional().isString(),
    body('parentRoleId').optional({ nullable: true }).isUUID().withMessage('Invalid parent role ID'),
    body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
    body('permissionKeys').optional().isArray().withMessage('permissionKeys must be an array')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const role = await updateTenantRole({
        tenantId: req.params.tenantId,
        roleId: req.params.roleId,
        name: req.body.name,
        description: req.body.description,
        parentRoleId: req.body.parentRoleId,
        isActive: req.body.isActive,
        permissionKeys: req.body.permissionKeys,
        actorUserId: req.user.id
      });

      return res.status(200).json({
        success: true,
        message: 'RBAC role updated successfully',
        data: role
      });
    } catch (error) {
      logger.error('Error updating RBAC role:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error updating RBAC role'
      });
    }
  }
);

/**
 * DELETE /api/tenants/:tenantId/rbac/roles/:roleId
 * Delete a custom RBAC role
 */
router.delete(
  '/:tenantId/rbac/roles/:roleId',
  protect,
  validateTenantAccess,
  requireTenantPermission(['rbac:role:manage']),
  async (req, res) => {
    try {
      await deleteTenantRole({
        tenantId: req.params.tenantId,
        roleId: req.params.roleId,
        actorUserId: req.user.id
      });

      return res.status(200).json({
        success: true,
        message: 'RBAC role deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting RBAC role:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error deleting RBAC role'
      });
    }
  }
);

/**
 * GET /api/tenants/:tenantId/rbac/permissions
 * List all RBAC permissions in tenant
 */
router.get(
  '/:tenantId/rbac/permissions',
  protect,
  validateTenantAccess,
  requireTenantPermission(['rbac:permission:manage', 'member:view']),
  async (req, res) => {
    try {
      const permissions = await listTenantPermissions(req.params.tenantId);

      return res.status(200).json({
        success: true,
        data: permissions
      });
    } catch (error) {
      logger.error('Error fetching RBAC permissions:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error fetching RBAC permissions'
      });
    }
  }
);

/**
 * POST /api/tenants/:tenantId/rbac/permissions
 * Create a custom tenant permission
 */
router.post(
  '/:tenantId/rbac/permissions',
  protect,
  validateTenantAccess,
  requireTenantPermission(['rbac:permission:manage']),
  [
    body('key').notEmpty().withMessage('Permission key is required'),
    body('description').optional().isString()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const permission = await createTenantPermission({
        tenantId: req.params.tenantId,
        key: req.body.key,
        description: req.body.description,
        actorUserId: req.user.id
      });

      return res.status(201).json({
        success: true,
        message: 'Permission created successfully',
        data: permission
      });
    } catch (error) {
      logger.error('Error creating RBAC permission:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error creating RBAC permission'
      });
    }
  }
);

/**
 * PUT /api/tenants/:tenantId/members/:userId/rbac-roles
 * Assign RBAC role IDs to a tenant member
 */
router.put(
  '/:tenantId/members/:userId/rbac-roles',
  protect,
  validateTenantAccess,
  requireTenantPermission(['rbac:assign']),
  [
    body('roleIds').isArray().withMessage('roleIds must be an array')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const member = await getMemberByUserId(req.params.tenantId, req.params.userId);
      if (!member) {
        return res.status(404).json({
          success: false,
          message: 'Tenant member not found'
        });
      }

      await assignRolesToMember({
        tenantId: req.params.tenantId,
        tenantMemberId: member.id,
        roleIds: req.body.roleIds || [],
        actorUserId: req.user.id
      });

      return res.status(200).json({
        success: true,
        message: 'Member roles updated successfully'
      });
    } catch (error) {
      logger.error('Error assigning member roles:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error assigning member roles'
      });
    }
  }
);

/**
 * PUT /api/tenants/:tenantId/members/:userId/permissions
 * Set custom permissions for a tenant member
 */
router.put(
  '/:tenantId/members/:userId/permissions',
  protect,
  validateTenantAccess,
  requireTenantPermission(['rbac:assign']),
  [
    body('permissions').isArray().withMessage('permissions must be an array')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const member = await getMemberByUserId(req.params.tenantId, req.params.userId);
      if (!member) {
        return res.status(404).json({
          success: false,
          message: 'Tenant member not found'
        });
      }

      const updatedPermissions = await setMemberCustomPermissions({
        tenantId: req.params.tenantId,
        tenantMemberId: member.id,
        permissions: req.body.permissions || [],
        actorUserId: req.user.id
      });

      return res.status(200).json({
        success: true,
        message: 'Member custom permissions updated successfully',
        data: {
          permissions: updatedPermissions
        }
      });
    } catch (error) {
      logger.error('Error updating member custom permissions:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error updating member permissions'
      });
    }
  }
);

/**
 * GET /api/tenants/:tenantId/features
 * Get available features for tenant's tier
 */
router.get(
  '/:tenantId/features',
  protect,
  validateTenantAccess,
  async (req, res) => {
    try {
      const tenant = await getTenant(req.params.tenantId);
      const features = getTierFeatures(tenant.tier);

      return res.status(200).json({
        success: true,
        data: {
          tier: tenant.tier,
          features
        }
      });
    } catch (error) {
      logger.error('Error fetching features:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching features'
      });
    }
  }
);

/**
 * GET /api/tenants/:tenantId/usage
 * Get tenant usage statistics
 */
router.get(
  '/:tenantId/usage',
  protect,
  validateTenantAccess,
  async (req, res) => {
    try {
      const tenant = await getTenant(req.params.tenantId);
      const members = await getTenantMembers(req.params.tenantId);

      return res.status(200).json({
        success: true,
        data: {
          members: {
            current: members.length,
            max: tenant.maxMembers
          },
          tier: tenant.tier,
          updatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Error fetching usage:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching usage'
      });
    }
  }
);

export default router;
