import { eq, and } from "drizzle-orm";
import db from "../config/db.js";
import { vaultMembers, vaults } from "../db/schema.js";
import { asyncHandler, ForbiddenError, NotFoundError } from "./errorHandler.js";

/**
 * Middleware to check if user has access to a specific vault
 * @param {string[]} allowedRoles - List of roles allowed to perform the action
 */
export const checkVaultAccess = (allowedRoles = ['owner', 'member', 'viewer']) => {
    return asyncHandler(async (req, res, next) => {
        const vaultId = req.params.vaultId || req.body.vaultId || req.query.vaultId;

        if (!vaultId) {
            return next(); // Skip if no vaultId provided (could be a personal resource)
        }

        // Check if vault exists
        const [vault] = await db
            .select()
            .from(vaults)
            .where(eq(vaults.id, vaultId));

        if (!vault) {
            throw new NotFoundError('Vault not found');
        }

        // Check membership
        const [membership] = await db
            .select()
            .from(vaultMembers)
            .where(
                and(
                    eq(vaultMembers.vaultId, vaultId),
                    eq(vaultMembers.userId, req.user.id)
                )
            );

        if (!membership) {
            throw new ForbiddenError('You do not have access to this vault');
        }

        // Check role permission
        if (allowedRoles.length > 0 && !allowedRoles.includes(membership.role)) {
            throw new ForbiddenError(`Insufficient permissions. Required: ${allowedRoles.join(', ')}`);
        }

        // Attach vault and membership info to request
        req.vault = vault;
        req.vaultMembership = membership;
        next();
    });
};

/**
 * Middleware to check if user is the owner of the vault
 */
export const isVaultOwner = asyncHandler(async (req, res, next) => {
    const vaultId = req.params.vaultId || req.body.vaultId;

    if (!vaultId) {
        throw new Error('Vault ID is required for ownership check');
    }

    const [vault] = await db
        .select()
        .from(vaults)
        .where(and(eq(vaults.id, vaultId), eq(vaults.ownerId, req.user.id)));

    if (!vault) {
        throw new ForbiddenError('Only the vault owner can perform this action');
    }

    req.vault = vault;
    next();
});

/**
 * Middleware to check if user has settlement admin permissions
 * Settlement admins can: view all settlements, approve settlements, manage debt structure
 * Roles: owner (full access), settlement_admin (manage settlements)
 */
export const isSettlementAdmin = asyncHandler(async (req, res, next) => {
    const vaultId = req.params.vaultId || req.body.vaultId || req.query.vaultId;

    if (!vaultId) {
        throw new Error('Vault ID is required for settlement admin check');
    }

    // Check if vault exists
    const [vault] = await db
        .select()
        .from(vaults)
        .where(eq(vaults.id, vaultId));

    if (!vault) {
        throw new NotFoundError('Vault not found');
    }

    // Check if user is owner
    if (vault.ownerId === req.user.id) {
        req.vault = vault;
        req.isSettlementAdmin = true;
        return next();
    }

    // Check membership and role
    const [membership] = await db
        .select()
        .from(vaultMembers)
        .where(
            and(
                eq(vaultMembers.vaultId, vaultId),
                eq(vaultMembers.userId, req.user.id)
            )
        );

    if (!membership) {
        throw new ForbiddenError('You do not have access to this vault');
    }

    // Allow settlement_admin role to manage settlements
    if (membership.role === 'settlement_admin' || membership.role === 'owner') {
        req.vault = vault;
        req.vaultMembership = membership;
        req.isSettlementAdmin = true;
        return next();
    }

    throw new ForbiddenError('Settlement admin permissions required for this action');
});

/**
 * Middleware to check if user can create settlements
 * Any vault member can create settlements, but only for themselves
 */
export const canCreateSettlement = asyncHandler(async (req, res, next) => {
    const vaultId = req.body.vaultId;
    const payerId = req.body.payerId;
    const payeeId = req.body.payeeId;

    if (!vaultId) {
        throw new Error('Vault ID is required');
    }

    // Check if vault exists and user is a member
    const [vault] = await db
        .select()
        .from(vaults)
        .where(eq(vaults.id, vaultId));

    if (!vault) {
        throw new NotFoundError('Vault not found');
    }

    const [membership] = await db
        .select()
        .from(vaultMembers)
        .where(
            and(
                eq(vaultMembers.vaultId, vaultId),
                eq(vaultMembers.userId, req.user.id)
            )
        );

    if (!membership) {
        throw new ForbiddenError('You must be a vault member to create settlements');
    }

    // Ensure user is either the payer or payee
    if (payerId !== req.user.id && payeeId !== req.user.id) {
        throw new ForbiddenError('You can only create settlements involving yourself');
    }

    req.vault = vault;
    req.vaultMembership = membership;
    next();
});
