import { and, eq, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db.js';
import {
  tenantMembers,
  rbacRoles,
  rbacPermissions,
  rbacRolePermissions,
  tenantMemberRoles,
  rbacAuditLogs
} from '../db/schema.js';
import { logger } from '../utils/logger.js';
import policyEngineService from './policyEngineService.js';

const DEFAULT_PERMISSION_DEFINITIONS = [
  { key: '*', description: 'Full access to all tenant resources' },
  { key: 'tenant:view', description: 'View tenant details' },
  { key: 'tenant:update', description: 'Update tenant settings' },
  { key: 'member:view', description: 'View tenant members' },
  { key: 'member:add', description: 'Add tenant members' },
  { key: 'member:remove', description: 'Remove tenant members' },
  { key: 'member:role:update', description: 'Update member role' },
  { key: 'rbac:role:manage', description: 'Manage RBAC roles' },
  { key: 'rbac:permission:manage', description: 'Manage RBAC permissions' },
  { key: 'rbac:assign', description: 'Assign RBAC roles to members' },
  { key: 'audit:view', description: 'View audit logs' },
  { key: 'audit:export', description: 'Export audit logs' },
  { key: 'audit:alert:view', description: 'View security alerts' },
  { key: 'audit:integrity:verify', description: 'Verify audit log integrity' },
  { key: 'expense:view', description: 'View expenses' },
  { key: 'expense:create', description: 'Create expenses' },
  { key: 'expense:update', description: 'Update expenses' },
  { key: 'expense:delete', description: 'Delete expenses' },
  { key: 'category:view', description: 'View categories' },
  { key: 'category:manage', description: 'Manage categories' },
  { key: 'goal:view', description: 'View goals' },
  { key: 'goal:manage', description: 'Manage goals' },
  { key: 'analytics:view', description: 'View analytics' }
];

const DEFAULT_ROLE_MODEL = [
  {
    slug: 'viewer',
    name: 'Viewer',
    description: 'Read-only access',
    parentSlug: null,
    permissions: ['tenant:view', 'expense:view', 'goal:view', 'analytics:view']
  },
  {
    slug: 'member',
    name: 'Member',
    description: 'Regular team member',
    parentSlug: 'viewer',
    permissions: [
      'expense:create',
      'goal:manage',
      'category:view'
    ]
  },
  {
    slug: 'manager',
    name: 'Manager',
    description: 'Team manager with operational permissions',
    parentSlug: 'member',
    permissions: [
      'member:view',
      'expense:update',
      'category:manage',
      'audit:view',
      'audit:alert:view'
    ]
  },
  {
    slug: 'admin',
    name: 'Admin',
    description: 'Administrator with team and configuration control',
    parentSlug: 'manager',
    permissions: [
      'tenant:update',
      'member:add',
      'member:remove',
      'member:role:update',
      'rbac:role:manage',
      'rbac:permission:manage',
      'rbac:assign',
      'expense:delete',
      'audit:export',
      'audit:integrity:verify'
    ]
  },
  {
    slug: 'owner',
    name: 'Owner',
    description: 'Tenant owner with full control',
    parentSlug: 'admin',
    permissions: ['*']
  }
];

const normalizePermissionKey = (permissionKey) => String(permissionKey || '').trim().toLowerCase();

const mapLegacyRoleToSlug = (role) => {
  const known = ['owner', 'admin', 'manager', 'member', 'viewer'];
  return known.includes(role) ? role : 'member';
};

export const logRbacAudit = async ({ tenantId, actorUserId, action, entityType, entityId = null, changes = {}, metadata = {} }) => {
  await db.insert(rbacAuditLogs).values({
    id: uuidv4(),
    tenantId,
    actorUserId: actorUserId || null,
    action,
    entityType,
    entityId,
    changes,
    metadata
  });
};

const ensurePermissionRecords = async (tenantId, permissionDefinitions = DEFAULT_PERMISSION_DEFINITIONS) => {
  const existingPermissions = await db
    .select({ id: rbacPermissions.id, key: rbacPermissions.key })
    .from(rbacPermissions)
    .where(eq(rbacPermissions.tenantId, tenantId));

  const existingByKey = new Map(existingPermissions.map((permission) => [permission.key, permission]));

  for (const permission of permissionDefinitions) {
    const normalizedKey = normalizePermissionKey(permission.key);
    if (!normalizedKey || existingByKey.has(normalizedKey)) {
      continue;
    }

    const [inserted] = await db
      .insert(rbacPermissions)
      .values({
        id: uuidv4(),
        tenantId,
        key: normalizedKey,
        description: permission.description || null
      })
      .returning({ id: rbacPermissions.id, key: rbacPermissions.key });

    existingByKey.set(inserted.key, inserted);
  }

  return existingByKey;
};

export const initializeTenantRbac = async (tenantId, actorUserId = null, ownerMembershipId = null) => {
  const existingRoles = await db
    .select({ id: rbacRoles.id, slug: rbacRoles.slug })
    .from(rbacRoles)
    .where(eq(rbacRoles.tenantId, tenantId));

  const roleBySlug = new Map(existingRoles.map((role) => [role.slug, role]));
  const permissionByKey = await ensurePermissionRecords(tenantId);

  if (existingRoles.length === 0) {
    for (const roleDef of DEFAULT_ROLE_MODEL) {
      const [createdRole] = await db
        .insert(rbacRoles)
        .values({
          id: uuidv4(),
          tenantId,
          name: roleDef.name,
          slug: roleDef.slug,
          description: roleDef.description,
          parentRoleId: roleDef.parentSlug ? roleBySlug.get(roleDef.parentSlug)?.id || null : null,
          isSystem: true,
          isActive: true
        })
        .returning({ id: rbacRoles.id, slug: rbacRoles.slug });

      roleBySlug.set(createdRole.slug, createdRole);

      const permissionIds = roleDef.permissions
        .map((permissionKey) => permissionByKey.get(normalizePermissionKey(permissionKey))?.id)
        .filter(Boolean);

      for (const permissionId of permissionIds) {
        await db.insert(rbacRolePermissions).values({
          id: uuidv4(),
          roleId: createdRole.id,
          permissionId
        });
      }
    }

    await logRbacAudit({
      tenantId,
      actorUserId,
      action: 'rbac.bootstrap',
      entityType: 'role',
      changes: { roles: DEFAULT_ROLE_MODEL.map((role) => role.slug) }
    });
  }

  if (ownerMembershipId) {
    const ownerRole = roleBySlug.get('owner');
    if (ownerRole) {
      const [assigned] = await db
        .select({ id: tenantMemberRoles.id })
        .from(tenantMemberRoles)
        .where(
          and(
            eq(tenantMemberRoles.tenantMemberId, ownerMembershipId),
            eq(tenantMemberRoles.roleId, ownerRole.id)
          )
        );

      if (!assigned) {
        await db.insert(tenantMemberRoles).values({
          id: uuidv4(),
          tenantMemberId: ownerMembershipId,
          roleId: ownerRole.id
        });
      }
    }
  }

  return true;
};

const resolveRoleHierarchyIds = (roleMap, startRoleIds) => {
  const visited = new Set();
  const stack = [...startRoleIds];

  while (stack.length > 0) {
    const roleId = stack.pop();
    if (!roleId || visited.has(roleId)) {
      continue;
    }

    visited.add(roleId);
    const role = roleMap.get(roleId);
    if (role?.parentRoleId) {
      stack.push(role.parentRoleId);
    }
  }

  return [...visited];
};

export const getMemberAuthorizationContext = async (tenantId, tenantMemberId) => {
  const [member] = await db
    .select({
      id: tenantMembers.id,
      tenantId: tenantMembers.tenantId,
      role: tenantMembers.role,
      customPermissions: tenantMembers.permissions
    })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.id, tenantMemberId),
        eq(tenantMembers.tenantId, tenantId)
      )
    );

  if (!member) {
    throw new Error('Tenant membership not found');
  }

  const assignedRoles = await db
    .select({
      roleId: tenantMemberRoles.roleId,
      id: rbacRoles.id,
      name: rbacRoles.name,
      slug: rbacRoles.slug,
      parentRoleId: rbacRoles.parentRoleId,
      isSystem: rbacRoles.isSystem,
      isActive: rbacRoles.isActive
    })
    .from(tenantMemberRoles)
    .innerJoin(rbacRoles, eq(tenantMemberRoles.roleId, rbacRoles.id))
    .where(eq(tenantMemberRoles.tenantMemberId, tenantMemberId));

  let roleRecords = assignedRoles.filter((role) => role.isActive);

  if (roleRecords.length === 0) {
    const fallbackSlug = mapLegacyRoleToSlug(member.role);
    const [fallbackRole] = await db
      .select()
      .from(rbacRoles)
      .where(
        and(
          eq(rbacRoles.tenantId, tenantId),
          eq(rbacRoles.slug, fallbackSlug),
          eq(rbacRoles.isActive, true)
        )
      );

    if (fallbackRole) {
      await db.insert(tenantMemberRoles).values({
        id: uuidv4(),
        tenantMemberId,
        roleId: fallbackRole.id
      });
      roleRecords = [{
        roleId: fallbackRole.id,
        id: fallbackRole.id,
        name: fallbackRole.name,
        slug: fallbackRole.slug,
        parentRoleId: fallbackRole.parentRoleId,
        isSystem: fallbackRole.isSystem,
        isActive: fallbackRole.isActive
      }];
    }
  }

  const tenantRoles = await db
    .select({
      id: rbacRoles.id,
      parentRoleId: rbacRoles.parentRoleId,
      tenantId: rbacRoles.tenantId,
      isActive: rbacRoles.isActive
    })
    .from(rbacRoles)
    .where(eq(rbacRoles.tenantId, tenantId));

  const roleMap = new Map(tenantRoles.map((role) => [role.id, role]));
  const directRoleIds = roleRecords.map((role) => role.id);
  const hierarchyRoleIds = resolveRoleHierarchyIds(roleMap, directRoleIds);

  let permissionKeys = [];
  if (hierarchyRoleIds.length > 0) {
    permissionKeys = await db
      .select({ key: rbacPermissions.key })
      .from(rbacRolePermissions)
      .innerJoin(rbacPermissions, eq(rbacRolePermissions.permissionId, rbacPermissions.id))
      .where(inArray(rbacRolePermissions.roleId, hierarchyRoleIds));
  }

  const customPermissions = Array.isArray(member.customPermissions)
    ? member.customPermissions.map((permissionKey) => normalizePermissionKey(permissionKey)).filter(Boolean)
    : [];

  const effectivePermissions = new Set([
    ...permissionKeys.map((permission) => normalizePermissionKey(permission.key)).filter(Boolean),
    ...customPermissions
  ]);

  return {
    roles: roleRecords.map((role) => ({
      id: role.id,
      name: role.name,
      slug: role.slug,
      isSystem: role.isSystem
    })),
    permissions: [...effectivePermissions],
    hasWildcard: effectivePermissions.has('*')
  };
};

export const listTenantPermissions = async (tenantId) => {
  return db
    .select({
      id: rbacPermissions.id,
      key: rbacPermissions.key,
      description: rbacPermissions.description,
      createdAt: rbacPermissions.createdAt
    })
    .from(rbacPermissions)
    .where(eq(rbacPermissions.tenantId, tenantId));
};

export const createTenantPermission = async ({ tenantId, key, description, actorUserId }) => {
  const normalizedKey = normalizePermissionKey(key);
  if (!normalizedKey) {
    throw new Error('Permission key is required');
  }

  const [existingPermission] = await db
    .select({ id: rbacPermissions.id })
    .from(rbacPermissions)
    .where(
      and(
        eq(rbacPermissions.tenantId, tenantId),
        eq(rbacPermissions.key, normalizedKey)
      )
    );

  if (existingPermission) {
    throw new Error('Permission key already exists');
  }

  const [permission] = await db
    .insert(rbacPermissions)
    .values({
      id: uuidv4(),
      tenantId,
      key: normalizedKey,
      description: description || null
    })
    .returning();

  await logRbacAudit({
    tenantId,
    actorUserId,
    action: 'permission.create',
    entityType: 'permission',
    entityId: permission.id,
    changes: { key: normalizedKey, description: description || null }
  });

  await policyEngineService.invalidateAuthorizationCache({ tenantId });

  return permission;
};

const fetchRolePermissions = async (roleIds = []) => {
  if (!roleIds.length) {
    return [];
  }

  return db
    .select({
      roleId: rbacRolePermissions.roleId,
      permissionKey: rbacPermissions.key
    })
    .from(rbacRolePermissions)
    .innerJoin(rbacPermissions, eq(rbacRolePermissions.permissionId, rbacPermissions.id))
    .where(inArray(rbacRolePermissions.roleId, roleIds));
};

export const listTenantRoles = async (tenantId) => {
  const roles = await db
    .select({
      id: rbacRoles.id,
      name: rbacRoles.name,
      slug: rbacRoles.slug,
      description: rbacRoles.description,
      parentRoleId: rbacRoles.parentRoleId,
      isSystem: rbacRoles.isSystem,
      isActive: rbacRoles.isActive,
      createdAt: rbacRoles.createdAt
    })
    .from(rbacRoles)
    .where(eq(rbacRoles.tenantId, tenantId));

  const rolePermissions = await fetchRolePermissions(roles.map((role) => role.id));
  const permissionByRoleId = rolePermissions.reduce((acc, entry) => {
    if (!acc[entry.roleId]) {
      acc[entry.roleId] = [];
    }
    acc[entry.roleId].push(entry.permissionKey);
    return acc;
  }, {});

  return roles.map((role) => ({
    ...role,
    permissions: permissionByRoleId[role.id] || []
  }));
};

const resolvePermissionIds = async (tenantId, permissionKeys = []) => {
  const normalizedKeys = [...new Set(permissionKeys.map((key) => normalizePermissionKey(key)).filter(Boolean))];
  if (!normalizedKeys.length) {
    return [];
  }

  const permissionRecords = await db
    .select({ id: rbacPermissions.id, key: rbacPermissions.key })
    .from(rbacPermissions)
    .where(
      and(
        eq(rbacPermissions.tenantId, tenantId),
        inArray(rbacPermissions.key, normalizedKeys)
      )
    );

  if (permissionRecords.length !== normalizedKeys.length) {
    const foundKeys = new Set(permissionRecords.map((permission) => permission.key));
    const missing = normalizedKeys.filter((key) => !foundKeys.has(key));
    throw new Error(`Unknown permissions: ${missing.join(', ')}`);
  }

  return permissionRecords.map((permission) => permission.id);
};

export const createTenantRole = async ({ tenantId, name, slug, description, parentRoleId = null, permissionKeys = [], actorUserId }) => {
  if (!name || !slug) {
    throw new Error('Role name and slug are required');
  }

  const normalizedSlug = slug.trim().toLowerCase();

  const [existingRole] = await db
    .select({ id: rbacRoles.id })
    .from(rbacRoles)
    .where(
      and(
        eq(rbacRoles.tenantId, tenantId),
        eq(rbacRoles.slug, normalizedSlug)
      )
    );

  if (existingRole) {
    throw new Error('Role slug already exists');
  }

  if (parentRoleId) {
    const [parentRole] = await db
      .select({ id: rbacRoles.id })
      .from(rbacRoles)
      .where(
        and(
          eq(rbacRoles.id, parentRoleId),
          eq(rbacRoles.tenantId, tenantId)
        )
      );

    if (!parentRole) {
      throw new Error('Parent role not found in tenant');
    }
  }

  const [role] = await db
    .insert(rbacRoles)
    .values({
      id: uuidv4(),
      tenantId,
      name,
      slug: normalizedSlug,
      description: description || null,
      parentRoleId,
      isSystem: false,
      isActive: true
    })
    .returning();

  const permissionIds = await resolvePermissionIds(tenantId, permissionKeys);
  for (const permissionId of permissionIds) {
    await db.insert(rbacRolePermissions).values({
      id: uuidv4(),
      roleId: role.id,
      permissionId
    });
  }

  await logRbacAudit({
    tenantId,
    actorUserId,
    action: 'role.create',
    entityType: 'role',
    entityId: role.id,
    changes: { name, slug: normalizedSlug, parentRoleId, permissionKeys }
  });

  await policyEngineService.invalidateAuthorizationCache({ tenantId });

  return role;
};

export const updateTenantRole = async ({ tenantId, roleId, name, description, parentRoleId, isActive, permissionKeys, actorUserId }) => {
  const [existingRole] = await db
    .select()
    .from(rbacRoles)
    .where(
      and(
        eq(rbacRoles.id, roleId),
        eq(rbacRoles.tenantId, tenantId)
      )
    );

  if (!existingRole) {
    throw new Error('Role not found');
  }

  const updatePayload = {};

  if (name !== undefined) updatePayload.name = name;
  if (description !== undefined) updatePayload.description = description;
  if (isActive !== undefined) updatePayload.isActive = Boolean(isActive);

  if (parentRoleId !== undefined) {
    if (parentRoleId === roleId) {
      throw new Error('Role cannot be parent of itself');
    }

    if (parentRoleId) {
      const [parentRole] = await db
        .select({ id: rbacRoles.id })
        .from(rbacRoles)
        .where(
          and(
            eq(rbacRoles.id, parentRoleId),
            eq(rbacRoles.tenantId, tenantId)
          )
        );

      if (!parentRole) {
        throw new Error('Parent role not found in tenant');
      }
    }

    updatePayload.parentRoleId = parentRoleId || null;
  }

  if (Object.keys(updatePayload).length > 0) {
    updatePayload.updatedAt = new Date();
    await db.update(rbacRoles).set(updatePayload).where(eq(rbacRoles.id, roleId));
  }

  if (permissionKeys !== undefined) {
    const permissionIds = await resolvePermissionIds(tenantId, permissionKeys);
    await db.delete(rbacRolePermissions).where(eq(rbacRolePermissions.roleId, roleId));

    for (const permissionId of permissionIds) {
      await db.insert(rbacRolePermissions).values({
        id: uuidv4(),
        roleId,
        permissionId
      });
    }
  }

  await logRbacAudit({
    tenantId,
    actorUserId,
    action: 'role.update',
    entityType: 'role',
    entityId: roleId,
    changes: { ...updatePayload, permissionKeys }
  });

  await policyEngineService.invalidateAuthorizationCache({ tenantId });

  const [updatedRole] = await db
    .select()
    .from(rbacRoles)
    .where(eq(rbacRoles.id, roleId));

  return updatedRole;
};

export const deleteTenantRole = async ({ tenantId, roleId, actorUserId }) => {
  const [role] = await db
    .select()
    .from(rbacRoles)
    .where(
      and(
        eq(rbacRoles.id, roleId),
        eq(rbacRoles.tenantId, tenantId)
      )
    );

  if (!role) {
    throw new Error('Role not found');
  }

  if (role.isSystem) {
    throw new Error('System roles cannot be deleted');
  }

  const [childRole] = await db
    .select({ id: rbacRoles.id })
    .from(rbacRoles)
    .where(eq(rbacRoles.parentRoleId, roleId));

  if (childRole) {
    throw new Error('Cannot delete role with child roles');
  }

  const [assignedRole] = await db
    .select({ id: tenantMemberRoles.id })
    .from(tenantMemberRoles)
    .where(eq(tenantMemberRoles.roleId, roleId));

  if (assignedRole) {
    throw new Error('Cannot delete role assigned to members');
  }

  await db.delete(rbacRolePermissions).where(eq(rbacRolePermissions.roleId, roleId));
  await db.delete(rbacRoles).where(eq(rbacRoles.id, roleId));

  await logRbacAudit({
    tenantId,
    actorUserId,
    action: 'role.delete',
    entityType: 'role',
    entityId: roleId,
    changes: { slug: role.slug }
  });

  await policyEngineService.invalidateAuthorizationCache({ tenantId });

  return true;
};

export const assignRolesToMember = async ({ tenantId, tenantMemberId, roleIds = [], actorUserId }) => {
  const [member] = await db
    .select({
      id: tenantMembers.id,
      role: tenantMembers.role,
      tenantId: tenantMembers.tenantId
    })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.id, tenantMemberId),
        eq(tenantMembers.tenantId, tenantId)
      )
    );

  if (!member) {
    throw new Error('Tenant member not found');
  }

  const uniqueRoleIds = [...new Set(roleIds.filter(Boolean))];

  if (uniqueRoleIds.length > 0) {
    const validRoles = await db
      .select({ id: rbacRoles.id, slug: rbacRoles.slug })
      .from(rbacRoles)
      .where(
        and(
          eq(rbacRoles.tenantId, tenantId),
          inArray(rbacRoles.id, uniqueRoleIds)
        )
      );

    if (validRoles.length !== uniqueRoleIds.length) {
      throw new Error('One or more roles are invalid for this tenant');
    }
  }

  await db.delete(tenantMemberRoles).where(eq(tenantMemberRoles.tenantMemberId, tenantMemberId));

  for (const roleId of uniqueRoleIds) {
    await db.insert(tenantMemberRoles).values({
      id: uuidv4(),
      tenantMemberId,
      roleId
    });
  }

  if (uniqueRoleIds.length > 0) {
    const [primaryRole] = await db
      .select({ slug: rbacRoles.slug })
      .from(rbacRoles)
      .where(eq(rbacRoles.id, uniqueRoleIds[0]));

    if (primaryRole?.slug && primaryRole.slug !== member.role) {
      await db.update(tenantMembers)
        .set({ role: mapLegacyRoleToSlug(primaryRole.slug), updatedAt: new Date() })
        .where(eq(tenantMembers.id, tenantMemberId));
    }
  }

  await logRbacAudit({
    tenantId,
    actorUserId,
    action: 'member.role.assign',
    entityType: 'member_role',
    entityId: tenantMemberId,
    changes: { roleIds: uniqueRoleIds }
  });

  await policyEngineService.invalidateAuthorizationCache({ tenantId });

  return true;
};

export const setMemberCustomPermissions = async ({ tenantId, tenantMemberId, permissions = [], actorUserId }) => {
  const normalizedPermissions = [...new Set(permissions.map((permissionKey) => normalizePermissionKey(permissionKey)).filter(Boolean))];

  const [member] = await db
    .select({ id: tenantMembers.id })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.id, tenantMemberId),
        eq(tenantMembers.tenantId, tenantId)
      )
    );

  if (!member) {
    throw new Error('Tenant member not found');
  }

  await db.update(tenantMembers)
    .set({ permissions: normalizedPermissions, updatedAt: new Date() })
    .where(eq(tenantMembers.id, tenantMemberId));

  await logRbacAudit({
    tenantId,
    actorUserId,
    action: 'member.permission.update',
    entityType: 'member_permission',
    entityId: tenantMemberId,
    changes: { permissions: normalizedPermissions }
  });

  await policyEngineService.invalidateAuthorizationCache({ tenantId });

  return normalizedPermissions;
};

export const getMemberByUserId = async (tenantId, userId) => {
  const [member] = await db
    .select({
      id: tenantMembers.id,
      tenantId: tenantMembers.tenantId,
      userId: tenantMembers.userId,
      role: tenantMembers.role,
      permissions: tenantMembers.permissions,
      status: tenantMembers.status
    })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.tenantId, tenantId),
        eq(tenantMembers.userId, userId)
      )
    );

  return member || null;
};

export default {
  initializeTenantRbac,
  getMemberAuthorizationContext,
  listTenantPermissions,
  createTenantPermission,
  listTenantRoles,
  createTenantRole,
  updateTenantRole,
  deleteTenantRole,
  assignRolesToMember,
  setMemberCustomPermissions,
  getMemberByUserId,
  logRbacAudit
};