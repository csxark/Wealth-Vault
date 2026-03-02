/**
 * Tenant Service
 * 
 * Handles all tenant-related operations including:
 * - Tenant creation and management
 * - Member management
 * - Role-based access control
 * - Tenant subscriptions and features
 */

import { eq, and, or, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import db from '../config/db.js';
import { tenants, tenantMembers, users, rbacRoles } from '../db/schema.js';
import { initializeTenantRbac, assignRolesToMember } from './rbacService.js';
import { getDefaultResidencyPolicy, queueCrossRegionReplication } from './multiRegionService.js';
import { logger } from '../utils/logger.js';

const syncMemberRbacRole = async (tenantId, tenantMemberId, roleSlug, actorUserId) => {
  const [rbacRole] = await db
    .select({ id: rbacRoles.id })
    .from(rbacRoles)
    .where(
      and(
        eq(rbacRoles.tenantId, tenantId),
        eq(rbacRoles.slug, roleSlug)
      )
    );

  if (!rbacRole) {
    return;
  }

  await assignRolesToMember({
    tenantId,
    tenantMemberId,
    roleIds: [rbacRole.id],
    actorUserId
  });
};

/**
 * Create a new tenant
 */
export const createTenant = async (data) => {
  try {
    const {
      name,
      ownerId,
      description = '',
      slug = generateSlug(name),
      tier = 'free',
      maxMembers = 5,
      maxProjects = 3,
      homeRegion = process.env.APP_REGION || 'us-east-1',
      residencyPolicy = null
    } = data;

    // Validate tenant owner exists
    const [owner] = await db
      .select()
      .from(users)
      .where(eq(users.id, ownerId));

    if (!owner) {
      throw new Error('Tenant owner not found');
    }

    // Check if slug is unique
    const [existingTenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, slug));

    if (existingTenant) {
      throw new Error('Tenant slug already exists');
    }

    const tenantId = uuidv4();
    const effectiveResidencyPolicy = {
      ...getDefaultResidencyPolicy(homeRegion),
      ...(residencyPolicy || {}),
      homeRegion,
      dr: {
        ...getDefaultResidencyPolicy(homeRegion).dr,
        ...(residencyPolicy?.dr || {})
      }
    };

    // Create tenant
    const [newTenant] = await db
      .insert(tenants)
      .values({
        id: tenantId,
        name,
        slug,
        description,
        ownerId,
        tier,
        maxMembers,
        maxProjects,
        features: getTierFeatures(tier),
        settings: {
          currency: 'USD',
          timezone: 'UTC',
          language: 'en',
          theme: 'auto',
          multiRegion: {
            enabled: true,
            homeRegion,
            residencyPolicy: effectiveResidencyPolicy,
            createdAt: new Date().toISOString()
          }
        }
      })
      .returning();

    // Add owner as member with owner role
    await db
      .insert(tenantMembers)
      .values({
        id: uuidv4(),
        tenantId,
        userId: ownerId,
        role: 'owner',
        status: 'active'
      });

    const [ownerMembership] = await db
      .select({ id: tenantMembers.id })
      .from(tenantMembers)
      .where(
        and(
          eq(tenantMembers.tenantId, tenantId),
          eq(tenantMembers.userId, ownerId)
        )
      );

    await initializeTenantRbac(tenantId, ownerId, ownerMembership?.id || null);

    await queueCrossRegionReplication({
      tenant: newTenant,
      aggregateType: 'tenant',
      aggregateId: tenantId,
      eventType: 'tenant.created',
      payload: {
        tenantId,
        name: newTenant.name,
        slug: newTenant.slug,
        tier: newTenant.tier,
        homeRegion,
        residencyMode: effectiveResidencyPolicy.mode
      },
      dataClass: 'operational',
      metadata: {
        source: 'tenantService.createTenant'
      }
    });

    logger.info(`Tenant created: ${newTenant.name} (${tenantId})`, {
      tenantId,
      ownerId,
      homeRegion,
      residencyMode: effectiveResidencyPolicy.mode
    });

    return { tenant: newTenant, message: 'Tenant created successfully' };
  } catch (error) {
    logger.error('Error creating tenant:', error);
    throw error;
  }
};

/**
 * Get tenant by ID
 */
export const getTenant = async (tenantId) => {
  try {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Get member count
    const memberCount = await db
      .select()
      .from(tenantMembers)
      .where(
        and(
          eq(tenantMembers.tenantId, tenantId),
          eq(tenantMembers.status, 'active')
        )
      );

    return {
      ...tenant,
      memberCount: memberCount.length
    };
  } catch (error) {
    logger.error('Error getting tenant:', error);
    throw error;
  }
};

/**
 * Get all tenants for a user
 */
export const getUserTenants = async (userId) => {
  try {
    const userTenants = await db
      .select({
        tenant: tenants,
        role: tenantMembers.role,
        joinedAt: tenantMembers.joinedAt
      })
      .from(tenantMembers)
      .innerJoin(tenants, eq(tenantMembers.tenantId, tenants.id))
      .where(
        and(
          eq(tenantMembers.userId, userId),
          eq(tenantMembers.status, 'active')
        )
      );

    return userTenants;
  } catch (error) {
    logger.error('Error getting user tenants:', error);
    throw error;
  }
};

/**
 * Add member to tenant
 */
export const addTenantMember = async (tenantId, userId, role = 'member') => {
  try {
    // Verify tenant and user exist
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new Error('User not found');
    }

    // Check membership limit
    const activeMembers = await db
      .select()
      .from(tenantMembers)
      .where(
        and(
          eq(tenantMembers.tenantId, tenantId),
          eq(tenantMembers.status, 'active')
        )
      );

    if (activeMembers.length >= tenant.maxMembers) {
      throw new Error(`Tenant has reached maximum member limit (${tenant.maxMembers})`);
    }

    // Check if member already exists
    const [existing] = await db
      .select()
      .from(tenantMembers)
      .where(
        and(
          eq(tenantMembers.tenantId, tenantId),
          eq(tenantMembers.userId, userId)
        )
      );

    if (existing && existing.status === 'active') {
      throw new Error('User is already a member of this tenant');
    }

    // Add or reactivate member
    if (existing) {
      const [updated] = await db
        .update(tenantMembers)
        .set({ role, status: 'active' })
        .where(eq(tenantMembers.id, existing.id))
        .returning();

      await initializeTenantRbac(tenantId, userId, existing.id);

      await syncMemberRbacRole(tenantId, existing.id, role, userId);

      logger.info(`Tenant member reactivated`, {
        tenantId,
        userId,
        role
      });

      return updated;
    } else {
      const [newMember] = await db
        .insert(tenantMembers)
        .values({
          id: uuidv4(),
          tenantId,
          userId,
          role,
          status: 'active'
        })
        .returning();

      await initializeTenantRbac(tenantId, userId, newMember.id);

      await syncMemberRbacRole(tenantId, newMember.id, role, userId);

      logger.info(`Tenant member added`, {
        tenantId,
        userId,
        role
      });

      return newMember;
    }
  } catch (error) {
    logger.error('Error adding tenant member:', error);
    throw error;
  }
};

/**
 * Remove member from tenant
 */
export const removeTenantMember = async (tenantId, userId) => {
  try {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Prevent removing the owner
    if (tenant.ownerId === userId) {
      throw new Error('Cannot remove tenant owner');
    }

    // Soft delete member
    const [updated] = await db
      .update(tenantMembers)
      .set({ status: 'deleted' })
      .where(
        and(
          eq(tenantMembers.tenantId, tenantId),
          eq(tenantMembers.userId, userId)
        )
      )
      .returning();

    logger.info(`Tenant member removed`, {
      tenantId,
      userId
    });

    return updated;
  } catch (error) {
    logger.error('Error removing tenant member:', error);
    throw error;
  }
};

/**
 * Update member role
 */
export const updateMemberRole = async (tenantId, userId, newRole) => {
  try {
    const allowedRoles = ['owner', 'admin', 'manager', 'member', 'viewer'];
    if (!allowedRoles.includes(newRole)) {
      throw new Error(`Invalid role: ${newRole}`);
    }

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Prevent downgrading owner
    if (tenant.ownerId === userId && newRole !== 'owner') {
      throw new Error('Cannot change owner role');
    }

    const [updated] = await db
      .update(tenantMembers)
      .set({ role: newRole })
      .where(
        and(
          eq(tenantMembers.tenantId, tenantId),
          eq(tenantMembers.userId, userId)
        )
      )
      .returning();

    if (updated) {
      await initializeTenantRbac(tenantId, userId, updated.id);

      await syncMemberRbacRole(tenantId, updated.id, newRole, userId);
    }

    logger.info(`Member role updated`, {
      tenantId,
      userId,
      newRole
    });

    return updated;
  } catch (error) {
    logger.error('Error updating member role:', error);
    throw error;
  }
};

/**
 * Get tenant members
 */
export const getTenantMembers = async (tenantId, includeInactive = false) => {
  try {
    const query = db
      .select({
        id: tenantMembers.id,
        userId: tenantMembers.userId,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        profilePicture: users.profilePicture,
        role: tenantMembers.role,
        status: tenantMembers.status,
        joinedAt: tenantMembers.joinedAt
      })
      .from(tenantMembers)
      .innerJoin(users, eq(tenantMembers.userId, users.id))
      .where(eq(tenantMembers.tenantId, tenantId));

    if (!includeInactive) {
      query.where(eq(tenantMembers.status, 'active'));
    }

    const members = await query;
    return members;
  } catch (error) {
    logger.error('Error getting tenant members:', error);
    throw error;
  }
};

/**
 * Generate invite token for new member
 */
export const generateInviteToken = async (tenantId, email) => {
  try {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    return {
      token,
      expiresAt,
      inviteLink: `${process.env.FRONTEND_URL}/invite?token=${token}&tenant=${tenantId}`
    };
  } catch (error) {
    logger.error('Error generating invite token:', error);
    throw error;
  }
};

/**
 * Check if role has permission
 */
export const hasPermission = (role, permission) => {
  const rolePermissions = {
    owner: ['*'], // All permissions
    admin: [
      'manage_members',
      'manage_roles',
      'view_analytics',
      'edit_settings',
      'manage_categories',
      'view_all_expenses'
    ],
    manager: [
      'manage_categories',
      'view_team_expenses',
      'view_analytics'
    ],
    member: [
      'create_expense',
      'view_own_expenses',
      'manage_own_categories'
    ],
    viewer: [
      'view_analytics'
    ]
  };

  const permissions = rolePermissions[role] || [];
  return permissions.includes('*') || permissions.includes(permission);
};

/**
 * Get features for subscription tier
 */
export const getTierFeatures = (tier) => {
  const tiers = {
    free: {
      ai: false,
      customReports: false,
      teamCollaboration: false,
      advancedAnalytics: false,
      maxCategories: 10,
      maxExpenses: 1000
    },
    pro: {
      ai: true,
      customReports: true,
      teamCollaboration: true,
      advancedAnalytics: false,
      maxCategories: 50,
      maxExpenses: 10000
    },
    enterprise: {
      ai: true,
      customReports: true,
      teamCollaboration: true,
      advancedAnalytics: true,
      maxCategories: -1,
      maxExpenses: -1
    }
  };

  return tiers[tier] || tiers.free;
};

/**
 * Generate URL-friendly slug
 */
function generateSlug(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50) + '-' + uuidv4().substring(0, 8);
}

/**
 * Create default tenant for new user
 */
export const createDefaultTenant = async (userId) => {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new Error('User not found');
    }

    const tenantName = `${user.firstName} ${user.lastName}'s Workspace`;
    const slug = generateSlug(tenantName);

    const { tenant } = await createTenant({
      name: tenantName,
      ownerId: userId,
      slug,
      tier: 'free',
      homeRegion: process.env.APP_REGION || 'us-east-1'
    });

    logger.info(`Default tenant created for new user`, {
      userId,
      tenantId: tenant.id
    });

    return tenant;
  } catch (error) {
    logger.error('Error creating default tenant:', error);
    throw error;
  }
};

export default {
  createTenant,
  getTenant,
  getUserTenants,
  addTenantMember,
  removeTenantMember,
  updateMemberRole,
  getTenantMembers,
  generateInviteToken,
  hasPermission,
  getTierFeatures,
  createDefaultTenant
};
