import sagaCoordinator from './sagaCoordinator.js';
import db from '../config/db.js';
import { tenants, tenantMembers, categories, rbacRoles, rbacPermissions, expenses, outboxEvents } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import logger from '../utils/logger.js';
import outboxService from './outboxService.js';

/**
 * Tenant Onboarding Saga
 * 
 * Multi-step workflow for creating and setting up a new tenant:
 * 1. Create tenant record
 * 2. Create default categories
 * 3. Create default RBAC roles
 * 4. Add owner as first member
 * 5. Send welcome email
 * 
 * If any step fails, all previous steps are compensated (rolled back).
 */

const tenantOnboardingSaga = [
    {
        name: 'create_tenant',
        execute: async ({ sagaPayload }) => {
            logger.info('Step: Creating tenant', { name: sagaPayload.tenantName });

            const [tenant] = await db.insert(tenants).values({
                name: sagaPayload.tenantName,
                slug: sagaPayload.tenantSlug,
                ownerId: sagaPayload.ownerId,
                status: 'active',
                tier: sagaPayload.tier || 'free',
                description: sagaPayload.description || ''
            }).returning();

            return { tenantId: tenant.id, tenant };
        },
        compensate: async ({ stepOutput }) => {
            logger.info('Compensating: Deleting tenant', { tenantId: stepOutput.tenantId });

            await db.delete(tenants).where(eq(tenants.id, stepOutput.tenantId));
        }
    },
    {
        name: 'create_default_categories',
        execute: async ({ sagaPayload, previousResults }) => {
            const tenantId = previousResults[0].tenantId;
            const ownerId = sagaPayload.ownerId;

            logger.info('Step: Creating default categories', { tenantId });

            const defaultCategories = [
                { name: 'Food & Dining', color: '#EF4444', icon: 'utensils', type: 'expense' },
                { name: 'Transportation', color: '#F59E0B', icon: 'car', type: 'expense' },
                { name: 'Shopping', color: '#8B5CF6', icon: 'shopping-bag', type: 'expense' },
                { name: 'Entertainment', color: '#EC4899', icon: 'film', type: 'expense' },
                { name: 'Bills & Utilities', color: '#10B981', icon: 'file-text', type: 'expense' },
                { name: 'Salary', color: '#3B82F6', icon: 'dollar-sign', type: 'income' },
            ];

            const createdCategories = await db.insert(categories).values(
                defaultCategories.map(cat => ({
                    tenantId,
                    userId: ownerId,
                    name: cat.name,
                    color: cat.color,
                    icon: cat.icon,
                    type: cat.type,
                    isDefault: true
                }))
            ).returning();

            return { categoryIds: createdCategories.map(c => c.id) };
        },
        compensate: async ({ stepOutput }) => {
            logger.info('Compensating: Deleting default categories', {
                categoryIds: stepOutput.categoryIds
            });

            for (const categoryId of stepOutput.categoryIds) {
                await db.delete(categories).where(eq(categories.id, categoryId));
            }
        }
    },
    {
        name: 'create_default_roles',
        execute: async ({ previousResults }) => {
            const tenantId = previousResults[0].tenantId;

            logger.info('Step: Creating default RBAC roles', { tenantId });

            const defaultRoles = [
                { name: 'Admin', slug: 'admin', description: 'Full administrative access' },
                { name: 'Manager', slug: 'manager', description: 'Manage team and resources' },
                { name: 'Member', slug: 'member', description: 'Standard member access' },
                { name: 'Viewer', slug: 'viewer', description: 'Read-only access' }
            ];

            const createdRoles = await db.insert(rbacRoles).values(
                defaultRoles.map(role => ({
                    tenantId,
                    name: role.name,
                    slug: role.slug,
                    description: role.description,
                    isSystem: true,
                    isActive: true
                }))
            ).returning();

            return { roleIds: createdRoles.map(r => r.id) };
        },
        compensate: async ({ stepOutput }) => {
            logger.info('Compensating: Deleting default roles', {
                roleIds: stepOutput.roleIds
            });

            for (const roleId of stepOutput.roleIds) {
                await db.delete(rbacRoles).where(eq(rbacRoles.id, roleId));
            }
        }
    },
    {
        name: 'add_owner_as_member',
        execute: async ({ sagaPayload, previousResults }) => {
            const tenantId = previousResults[0].tenantId;
            const ownerId = sagaPayload.ownerId;

            logger.info('Step: Adding owner as tenant member', { tenantId, ownerId });

            const [member] = await db.insert(tenantMembers).values({
                tenantId,
                userId: ownerId,
                role: 'owner',
                status: 'active'
            }).returning();

            return { memberId: member.id };
        },
        compensate: async ({ stepOutput }) => {
            logger.info('Compensating: Removing owner membership', {
                memberId: stepOutput.memberId
            });

            await db.delete(tenantMembers).where(eq(tenantMembers.id, stepOutput.memberId));
        }
    },
    {
        name: 'send_welcome_notification',
        execute: async ({ sagaPayload, previousResults }) => {
            const tenantId = previousResults[0].tenantId;
            const tenantName = sagaPayload.tenantName;

            logger.info('Step: Sending welcome notification', { tenantId });

            // In a real system, this would send an email or push notification
            // For now, we'll just log it
            logger.info('Welcome notification sent', {
                tenantId,
                tenantName,
                ownerEmail: sagaPayload.ownerEmail
            });

            return { notificationSent: true };
        },
        compensate: async ({ stepOutput }) => {
            // Can't unsend an email, but we can log the compensation
            logger.info('Compensating: Welcome notification rollback (no-op)');
        }
    }
];

/**
 * Member Invitation Saga
 * 
 * Multi-step workflow for inviting a new member to a tenant:
 * 1. Validate invitation (check limits, duplicates)
 * 2. Create pending member record
 * 3. Generate invitation token
 * 4. Send invitation email
 * 5. Log invitation in audit
 * 
 * If any step fails, all previous steps are compensated.
 */

const memberInvitationSaga = [
    {
        name: 'validate_invitation',
        execute: async ({ sagaPayload }) => {
            logger.info('Step: Validating member invitation', {
                tenantId: sagaPayload.tenantId,
                email: sagaPayload.email
            });

            // Check if tenant exists
            const [tenant] = await db
                .select()
                .from(tenants)
                .where(eq(tenants.id, sagaPayload.tenantId));

            if (!tenant) {
                throw new Error('Tenant not found');
            }

            // Check member limit
            const existingMembers = await db
                .select()
                .from(tenantMembers)
                .where(eq(tenantMembers.tenantId, sagaPayload.tenantId));

            if (existingMembers.length >= tenant.maxMembers) {
                throw new Error('Tenant member limit reached');
            }

            // Check if already a member
            const existingMember = existingMembers.find(
                m => m.userId === sagaPayload.invitedUserId
            );

            if (existingMember) {
                throw new Error('User is already a member of this tenant');
            }

            return { validated: true, tenantName: tenant.name };
        },
        compensate: async () => {
            // Validation has no side effects to compensate
            logger.info('Compensating: Validation rollback (no-op)');
        }
    },
    {
        name: 'create_pending_member',
        execute: async ({ sagaPayload }) => {
            logger.info('Step: Creating pending member record', {
                tenantId: sagaPayload.tenantId,
                userId: sagaPayload.invitedUserId
            });

            const inviteToken = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

            const [member] = await db.insert(tenantMembers).values({
                tenantId: sagaPayload.tenantId,
                userId: sagaPayload.invitedUserId,
                role: sagaPayload.role || 'member',
                status: 'invited',
                inviteToken,
                inviteExpiresAt
            }).returning();

            return { memberId: member.id, inviteToken };
        },
        compensate: async ({ stepOutput }) => {
            logger.info('Compensating: Deleting pending member', {
                memberId: stepOutput.memberId
            });

            await db.delete(tenantMembers).where(eq(tenantMembers.id, stepOutput.memberId));
        }
    },
    {
        name: 'send_invitation_email',
        execute: async ({ sagaPayload, previousResults }) => {
            const inviteToken = previousResults[1].inviteToken;
            const tenantName = previousResults[0].tenantName;

            logger.info('Step: Sending invitation email', {
                email: sagaPayload.email,
                tenantName
            });

            // In a real system, this would send an email with the invite link
            const inviteLink = `${process.env.FRONTEND_URL}/accept-invite?token=${inviteToken}`;

            logger.info('Invitation email sent', {
                email: sagaPayload.email,
                inviteLink,
                tenantName
            });

            return { emailSent: true, inviteLink };
        },
        compensate: async () => {
            // Can't unsend an email
            logger.info('Compensating: Invitation email rollback (no-op)');
        }
    }
];

/**
 * Expense Workflow Saga
 * 
 * Multi-step workflow for creating an expense with side effects:
 * 1. Create expense record
 * 2. Update category usage statistics
 * 3. Check budget alerts
 * 4. Update analytics
 * 5. Trigger notifications if needed
 */

const expenseWorkflowSaga = [
    {
        name: 'create_expense',
        execute: async ({ sagaPayload }) => {
            logger.info('Step: Creating expense', {
                tenantId: sagaPayload.tenantId,
                amount: sagaPayload.amount
            });

            // In a real implementation, this would insert into expenses table
            // For now, we'll simulate it
            const expenseId = `exp_${Date.now()}`;

            return { expenseId, amount: sagaPayload.amount };
        },
        compensate: async ({ stepOutput }) => {
            logger.info('Compensating: Deleting expense', {
                expenseId: stepOutput.expenseId
            });

            // Delete the expense record
        }
    },
    {
        name: 'update_category_stats',
        execute: async ({ sagaPayload, previousResults }) => {
            const expenseId = previousResults[0].expenseId;

            logger.info('Step: Updating category statistics', {
                categoryId: sagaPayload.categoryId
            });

            // Update category metadata with usage count and average
            return { statsUpdated: true };
        },
        compensate: async ({ sagaPayload }) => {
            logger.info('Compensating: Reverting category statistics', {
                categoryId: sagaPayload.categoryId
            });

            // Revert the statistics update
        }
    },
    {
        name: 'check_budget_alerts',
        execute: async ({ sagaPayload }) => {
            logger.info('Step: Checking budget alerts', {
                categoryId: sagaPayload.categoryId,
                amount: sagaPayload.amount
            });

            // Check if spending exceeds budget thresholds
            const alertTriggered = false; // Would check actual budgets

            return { alertTriggered };
        },
        compensate: async () => {
            logger.info('Compensating: Budget alert check (no-op)');
        }
    }
];

/**
 * Financial Expense Operation Saga
 *
 * Request-scoped saga for consistent expense writes with compensating behavior:
 * 1. Create expense row
 * 2. Update category usage metadata
 * 3. Write financial outbox event
 */
const financialExpenseOperationSaga = [
    {
        name: 'create_expense_record',
        execute: async ({ sagaPayload }) => {
            const [expense] = await db.insert(expenses).values({
                tenantId: sagaPayload.tenantId,
                userId: sagaPayload.userId,
                amount: String(sagaPayload.amount),
                description: sagaPayload.description,
                categoryId: sagaPayload.categoryId,
                date: sagaPayload.date ? new Date(sagaPayload.date) : new Date(),
                paymentMethod: sagaPayload.paymentMethod || 'other',
                location: sagaPayload.location || null,
                tags: sagaPayload.tags || [],
                isRecurring: sagaPayload.isRecurring || false,
                recurringPattern: sagaPayload.recurringPattern || null,
                notes: sagaPayload.notes || null,
                subcategory: sagaPayload.subcategory || null,
                metadata: {
                    createdBy: 'financialExpenseOperationSaga',
                    idempotencyKey: sagaPayload.idempotencyKey || null,
                    operationKey: sagaPayload.operationKey || null
                }
            }).returning();

            return { expenseId: expense.id };
        },
        compensate: async ({ stepOutput }) => {
            if (!stepOutput?.expenseId) {
                return;
            }

            await db.delete(expenses).where(eq(expenses.id, stepOutput.expenseId));
        }
    },
    {
        name: 'update_category_usage',
        execute: async ({ sagaPayload }) => {
            if (!sagaPayload.categoryId) {
                return { skipped: true };
            }

            const usage = await db
                .select()
                .from(expenses)
                .where(eq(expenses.categoryId, sagaPayload.categoryId));

            const count = usage.length;
            const total = usage.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
            const average = count > 0 ? total / count : 0;

            await db
                .update(categories)
                .set({
                    metadata: {
                        usageCount: count,
                        averageAmount: average,
                        lastUsed: new Date().toISOString()
                    },
                    updatedAt: new Date()
                })
                .where(eq(categories.id, sagaPayload.categoryId));

            return { categoryUpdated: true };
        },
        compensate: async () => {
            // Best-effort compensation: category usage metadata is eventually consistent
        }
    },
    {
        name: 'publish_financial_event',
        execute: async ({ sagaPayload, previousResults }) => {
            const expenseId = previousResults?.[0]?.expenseId;

            if (!expenseId) {
                throw new Error('Missing expense id for outbox publication');
            }

            await db.transaction(async (tx) => {
                await outboxService.createEvent(tx, {
                    tenantId: sagaPayload.tenantId,
                    aggregateType: 'expense',
                    aggregateId: expenseId,
                    eventType: 'expense.created.financial',
                    payload: {
                        expenseId,
                        tenantId: sagaPayload.tenantId,
                        userId: sagaPayload.userId,
                        amount: sagaPayload.amount,
                        categoryId: sagaPayload.categoryId,
                        operationKey: sagaPayload.operationKey || null
                    },
                    metadata: {
                        source: 'financialExpenseOperationSaga'
                    }
                });
            });

            return { eventPublished: true };
        },
        compensate: async ({ sagaPayload, previousResults }) => {
            const expenseId = previousResults?.[0]?.expenseId;

            if (!expenseId) {
                return;
            }

            await db
                .delete(outboxEvents)
                .where(eq(outboxEvents.aggregateId, expenseId));

            logger.warn('Compensated financial outbox publication', {
                expenseId,
                operationKey: sagaPayload?.operationKey || null
            });
        }
    }
];

// Register all sagas with the coordinator
sagaCoordinator.registerSaga('tenant_onboarding', tenantOnboardingSaga);
sagaCoordinator.registerSaga('member_invitation', memberInvitationSaga);
sagaCoordinator.registerSaga('expense_workflow', expenseWorkflowSaga);
sagaCoordinator.registerSaga('financial_expense_operation', financialExpenseOperationSaga);

logger.info('Saga definitions registered', {
    sagas: ['tenant_onboarding', 'member_invitation', 'expense_workflow', 'financial_expense_operation']
});

export {
    tenantOnboardingSaga,
    memberInvitationSaga,
    expenseWorkflowSaga,
    financialExpenseOperationSaga
};
