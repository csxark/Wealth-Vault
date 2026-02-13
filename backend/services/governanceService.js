import db from '../config/db.js';
import { familyRoles, approvalRequests, vaults } from '../db/schema.js';
import { eq, and, or } from 'drizzle-orm';

class GovernanceService {
    /**
     * Assign a role to a user in a vault
     */
    async assignRole(vaultId, userId, role, permissions, assignedBy) {
        // Verify assigner has permission
        const assignerRole = await this.getUserRole(vaultId, assignedBy);
        if (!assignerRole?.permissions?.canManageRoles) {
            throw new Error('Insufficient permissions to assign roles');
        }

        // Check if role already exists
        const existingRole = await db.query.familyRoles.findFirst({
            where: and(
                eq(familyRoles.vaultId, vaultId),
                eq(familyRoles.userId, userId),
                eq(familyRoles.isActive, true)
            )
        });

        if (existingRole) {
            // Update existing role
            const [updated] = await db.update(familyRoles)
                .set({ role, permissions, assignedBy, assignedAt: new Date() })
                .where(eq(familyRoles.id, existingRole.id))
                .returning();
            return updated;
        }

        // Create new role
        const [newRole] = await db.insert(familyRoles).values({
            vaultId,
            userId,
            role,
            permissions,
            assignedBy,
        }).returning();

        return newRole;
    }

    /**
     * Get user's role in a vault
     */
    async getUserRole(vaultId, userId) {
        const role = await db.query.familyRoles.findFirst({
            where: and(
                eq(familyRoles.vaultId, vaultId),
                eq(familyRoles.userId, userId),
                eq(familyRoles.isActive, true)
            )
        });

        return role;
    }

    /**
     * Check if user requires approval for an action
     */
    async requiresApproval(vaultId, userId, action, amount = 0) {
        const role = await this.getUserRole(vaultId, userId);

        if (!role) return false; // No role = no governance

        const { requiresApproval, approvalThreshold } = role.permissions;

        // Check if always requires approval
        if (requiresApproval) {
            // Check threshold for expense amounts
            if (action === 'expense' && amount > 0) {
                return parseFloat(amount) >= parseFloat(approvalThreshold);
            }
            return true;
        }

        return false;
    }

    /**
     * Create an approval request
     */
    async createApprovalRequest(vaultId, requesterId, resourceType, action, requestData, amount = null) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

        const [request] = await db.insert(approvalRequests).values({
            vaultId,
            requesterId,
            resourceType,
            action,
            requestData,
            amount: amount ? amount.toString() : null,
            expiresAt,
            status: 'pending'
        }).returning();

        return request;
    }

    /**
     * Approve a request (with Multi-Sig support)
     */
    async approveRequest(requestId, approverId, reason = '') {
        const request = await db.query.approvalRequests.findFirst({
            where: eq(approvalRequests.id, requestId)
        });

        if (!request) throw new Error('Request not found');
        if (request.status !== 'pending' && request.status !== 'partially_approved') {
            throw new Error('Request already processed or invalid status');
        }

        // Verify approver has permission
        const approverRole = await this.getUserRole(request.vaultId, approverId);
        if (!approverRole?.permissions?.canApprove) {
            // Special case for inheritance executors who might not have a vault role
            if (request.resourceType === 'inheritance_trigger') {
                // Verification is handled inside successionService.castApproval
            } else {
                throw new Error('Insufficient permissions to approve');
            }
        }

        // Cannot approve own request
        if (request.requesterId === approverId) {
            throw new Error('Cannot approve your own request');
        }

        // Check if already approved by this user
        const metadata = request.metadata || { approvers: [] };
        if (metadata.approvers.includes(approverId)) {
            throw new Error('You have already approved this request');
        }

        metadata.approvers.push(approverId);
        const newApprovalCount = (request.currentApprovals || 0) + 1;
        const required = request.requiredApprovals || 1;

        const isFullyApproved = newApprovalCount >= required;

        const [updated] = await db.update(approvalRequests)
            .set({
                status: isFullyApproved ? 'approved' : 'partially_approved',
                currentApprovals: newApprovalCount,
                metadata,
                approvedAt: isFullyApproved ? new Date() : null,
                updatedAt: new Date()
            })
            .where(eq(approvalRequests.id, requestId))
            .returning();

        // If fully approved, execute the action
        if (isFullyApproved) {
            await this.executeApprovedAction(updated);
        }

        return updated;
    }

    /**
     * Reject a request
     */
    async rejectRequest(requestId, rejecterId, reason) {
        const request = await db.query.approvalRequests.findFirst({
            where: eq(approvalRequests.id, requestId)
        });

        if (!request) throw new Error('Request not found');
        if (request.status !== 'pending' && request.status !== 'partially_approved') {
            throw new Error('Request already processed');
        }

        const [updated] = await db.update(approvalRequests)
            .set({
                status: 'rejected',
                rejectedBy: rejecterId,
                rejectionReason: reason,
                rejectedAt: new Date()
            })
            .where(eq(approvalRequests.id, requestId))
            .returning();

        return updated;
    }

    /**
     * Execute approved action
     */
    async executeApprovedAction(request) {
        const { resourceType, resourceId, action, requestData } = request;

        console.log(`[Governance] Executing approved ${action} on ${resourceType}: ${resourceId}`);

        if (resourceType === 'inheritance_trigger') {
            const successionService = (await import('./successionService.js')).default;

            if (request.action === 'trigger') {
                await successionService.triggerSuccessionEvent(request.requesterId, 'manual_approval');
            } else {
                await successionService.executeSuccession(request.resourceId);
            }
        } else if (resourceType === 'expense' && action === 'create') {
            // Expense creation logic...
        }

        return true;
    }

    /**
     * Get pending approvals for a vault
     */
    async getPendingApprovals(vaultId, userId = null) {
        const conditions = [
            eq(approvalRequests.vaultId, vaultId),
            eq(approvalRequests.status, 'pending')
        ];

        if (userId) {
            // Only show requests where user can approve
            const role = await this.getUserRole(vaultId, userId);
            if (!role?.permissions?.canApprove) {
                return [];
            }
        }

        const requests = await db.query.approvalRequests.findMany({
            where: and(...conditions),
            with: {
                requester: {
                    columns: { id: true, firstName: true, lastName: true, email: true }
                }
            },
            orderBy: (approvalRequests, { desc }) => [desc(approvalRequests.createdAt)]
        });

        return requests;
    }

    /**
     * Get all roles in a vault
     */
    async getVaultRoles(vaultId) {
        const roles = await db.query.familyRoles.findMany({
            where: and(
                eq(familyRoles.vaultId, vaultId),
                eq(familyRoles.isActive, true)
            ),
            with: {
                user: {
                    columns: { id: true, firstName: true, lastName: true, email: true }
                }
            }
        });

        return roles;
    }

    /**
     * Revoke a role
     */
    async revokeRole(roleId, revokedBy) {
        const role = await db.query.familyRoles.findFirst({
            where: eq(familyRoles.id, roleId)
        });

        if (!role) throw new Error('Role not found');

        // Verify revoker has permission
        const revokerRole = await this.getUserRole(role.vaultId, revokedBy);
        if (!revokerRole?.permissions?.canManageRoles) {
            throw new Error('Insufficient permissions to revoke roles');
        }

        await db.update(familyRoles)
            .set({ isActive: false })
            .where(eq(familyRoles.id, roleId));

        return role;
    }
}

export default new GovernanceService();
