import express from "express";
import { body, validationResult } from "express-validator";
import { eq, and, sql, desc, sum, count } from "drizzle-orm";
import crypto from "crypto";
import db from "../config/db.js";
import { vaults, vaultMembers, vaultInvites, users, vaultBalances } from "../db/schema.js";
import { protect } from "../middleware/auth.js";
import { checkVaultAccess, isVaultOwner } from "../middleware/vaultAuth.js";
import { asyncHandler, ValidationError, NotFoundError, ConflictError } from "../middleware/errorHandler.js";
import { getSimplifiedDebts } from "../services/settlementService.js";

const router = express.Router();

/**
 * @swagger
 * /vaults:
 *   post:
 *     summary: Create a new collaborative vault
 *     tags: [Vaults]
 */
router.post(
    "/",
    protect,
    [
        body("name").trim().isLength({ min: 1, max: 100 }),
        body("description").optional().trim().isLength({ max: 500 }),
        body("currency").optional().isLength({ min: 3, max: 3 }),
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            throw new ValidationError("Validation failed", errors.array());
        }

        const { name, description, currency } = req.body;

        // Create vault
        const [newVault] = await db
            .insert(vaults)
            .values({
                name,
                description,
                ownerId: req.user.id,
                currency: currency || "USD",
            })
            .returning();

        // Add owner as the first member
        await db.insert(vaultMembers).values({
            vaultId: newVault.id,
            userId: req.user.id,
            role: "owner",
        });

        res.status(201).json({
            success: true,
            message: "Vault created successfully",
            data: newVault,
        });
    })
);

/**
 * @swagger
 * /vaults:
 *   get:
 *     summary: Get all vaults user is a member of
 *     tags: [Vaults]
 */
router.get(
    "/",
    protect,
    asyncHandler(async (req, res) => {
        const userVaults = await db
            .select({
                id: vaults.id,
                name: vaults.name,
                description: vaults.description,
                ownerId: vaults.ownerId,
                currency: vaults.currency,
                role: vaultMembers.role,
                joinedAt: vaultMembers.joinedAt,
            })
            .from(vaults)
            .innerJoin(vaultMembers, eq(vaults.id, vaultMembers.vaultId))
            .where(eq(vaultMembers.userId, req.user.id));

        res.success(userVaults, "Vaults retrieved successfully");
    })
);

/**
 * @swagger
 * /vaults/:vaultId/invite:
 *   post:
 *     summary: Invite a user to a vault
 *     tags: [Vaults]
 */
router.post(
    "/:vaultId/invite",
    protect,
    checkVaultAccess(['owner']),
    [
        body("email").isEmail().normalizeEmail(),
        body("role").optional().isIn(['member', 'viewer']),
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            throw new ValidationError("Validation failed", errors.array());
        }

        const { email, role } = req.body;
        const { vaultId } = req.params;

        // Check if user is already a member
        const [existingMember] = await db
            .select()
            .from(users)
            .innerJoin(vaultMembers, eq(users.id, vaultMembers.userId))
            .where(and(eq(vaultMembers.vaultId, vaultId), eq(users.email, email)));

        if (existingMember) {
            throw new ConflictError("User is already a member of this vault");
        }

        // Create invite token
        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

        const [invite] = await db
            .insert(vaultInvites)
            .values({
                vaultId,
                inviterId: req.user.id,
                email,
                token,
                role: role || 'member',
                expiresAt,
            })
            .returning();

        // In a real app, send email here
        res.success({ inviteToken: token }, `Invite sent to ${email}`);
    })
);

/**
 * @swagger
 * /vaults/accept-invite:
 *   post:
 *     summary: Accept a vault invitation
 *     tags: [Vaults]
 */
router.post(
    "/accept-invite",
    protect,
    [body("token").notEmpty()],
    asyncHandler(async (req, res) => {
        const { token } = req.body;

        const [invite] = await db
            .select()
            .from(vaultInvites)
            .where(
                and(
                    eq(vaultInvites.token, token),
                    eq(vaultInvites.status, "pending")
                )
            );

        if (!invite) {
            throw new NotFoundError("Invalid or expired invite token");
        }

        if (new Date() > invite.expiresAt) {
            await db
                .update(vaultInvites)
                .set({ status: "expired" })
                .where(eq(vaultInvites.id, invite.id));
            throw new ValidationError("Invite token has expired");
        }

        if (invite.email !== req.user.email) {
            throw new ForbiddenError("This invite was sent to a different email address");
        }

        // Add member to vault
        await db.insert(vaultMembers).values({
            vaultId: invite.vaultId,
            userId: req.user.id,
            role: invite.role,
        });

        // Mark invite as accepted
        await db
            .update(vaultInvites)
            .set({ status: "accepted" })
            .where(eq(vaultInvites.id, invite.id));

        res.success(null, "Successfully joined the vault");
    })
);

/**
 * @swagger
 * /vaults/:vaultId/members:
 *   get:
 *     summary: List all members of a vault
 */
router.get(
    "/:vaultId/members",
    protect,
    checkVaultAccess(),
    asyncHandler(async (req, res) => {
        const members = await db
            .select({
                id: users.id,
                firstName: users.firstName,
                lastName: users.lastName,
                email: users.email,
                role: vaultMembers.role,
                joinedAt: vaultMembers.joinedAt,
            })
            .from(vaultMembers)
            .innerJoin(users, eq(vaultMembers.userId, users.id))
            .where(eq(vaultMembers.vaultId, req.params.vaultId));

    res.success(members, "Vault members retrieved successfully");
    })
);

/**
 * @swagger
 * /vaults/:vaultId/shared-budgets:
 *   post:
 *     summary: Create a shared budget for a vault
 *     tags: [Vaults]
 */
router.post(
    "/:vaultId/shared-budgets",
    protect,
    checkVaultAccess(),
    [
        body("name").trim().isLength({ min: 1, max: 100 }),
        body("description").optional().trim().isLength({ max: 500 }),
        body("totalBudget").isNumeric(),
        body("period").optional().isIn(['monthly', 'yearly']),
        body("approvalRequired").optional().isBoolean(),
        body("approvalThreshold").optional().isNumeric(),
        body("categories").optional().isArray(),
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            throw new ValidationError("Validation failed", errors.array());
        }

        const { vaultId } = req.params;
        const budget = await createSharedBudget(vaultId, req.body, req.user.id);

        res.status(201).json({
            success: true,
            message: "Shared budget created successfully",
            data: budget,
        });
    })
);

/**
 * @swagger
 * /vaults/:vaultId/shared-budgets:
 *   get:
 *     summary: Get shared budgets for a vault
 *     tags: [Vaults]
 */
router.get(
    "/:vaultId/shared-budgets",
    protect,
    checkVaultAccess(),
    asyncHandler(async (req, res) => {
        const { vaultId } = req.params;
        const budgets = await getSharedBudgets(vaultId, req.user.id);

        res.success(budgets, "Shared budgets retrieved successfully");
    })
);

/**
 * @swagger
 * /vaults/:vaultId/expense-approvals:
 *   get:
 *     summary: Get pending expense approvals for a vault
 *     tags: [Vaults]
 */
router.get(
    "/:vaultId/expense-approvals",
    protect,
    checkVaultAccess(),
    asyncHandler(async (req, res) => {
        const { vaultId } = req.params;
        const approvals = await getPendingApprovals(vaultId, req.user.id);

        res.success(approvals, "Pending approvals retrieved successfully");
    })
);

/**
 * @swagger
 * /vaults/:vaultId/expense-approvals/:approvalId/approve:
 *   post:
 *     summary: Approve an expense
 *     tags: [Vaults]
 */
router.post(
    "/:vaultId/expense-approvals/:approvalId/approve",
    protect,
    checkVaultAccess(),
    [body("notes").optional().trim().isLength({ max: 500 })],
    asyncHandler(async (req, res) => {
        const { approvalId } = req.params;
        const { notes } = req.body;

        const result = await processExpenseApproval(approvalId, req.user.id, true, notes);

        res.success(result, "Expense approved successfully");
    })
);

/**
 * @swagger
 * /vaults/:vaultId/expense-approvals/:approvalId/reject:
 *   post:
 *     summary: Reject an expense
 *     tags: [Vaults]
 */
router.post(
    "/:vaultId/expense-approvals/:approvalId/reject",
    protect,
    checkVaultAccess(),
    [body("notes").optional().trim().isLength({ max: 500 })],
    asyncHandler(async (req, res) => {
        const { approvalId } = req.params;
        const { notes } = req.body;

        const result = await processExpenseApproval(approvalId, req.user.id, false, notes);

        res.success(result, "Expense rejected successfully");
    })
);

/**
 * @swagger
 * /vaults/:vaultId/budget-utilization:
 *   get:
 *     summary: Get budget utilization report for a vault
 *     tags: [Vaults]
 */
router.get(
    "/:vaultId/budget-utilization",
    protect,
    checkVaultAccess(),
    asyncHandler(async (req, res) => {
        const { vaultId } = req.params;
        const { period } = req.query;

        const utilization = await getBudgetUtilization(vaultId, req.user.id, period);

        res.success(utilization, "Budget utilization retrieved successfully");
    })
);

/**
 * @swagger
 * /vaults/:vaultId/balances:
 *   get:
 *     summary: Get balance distribution and debt summary for a vault
 */
router.get(
    "/:vaultId/balances",
    protect,
    checkVaultAccess(),
    asyncHandler(async (req, res) => {
        const { vaultId } = req.params;

        // Get all member balances
        const balances = await db
            .select({
                userId: vaultBalances.userId,
                balance: vaultBalances.balance,
                lastSettlementAt: vaultBalances.lastSettlementAt,
                userName: users.name,
                userEmail: users.email
            })
            .from(vaultBalances)
            .innerJoin(users, eq(vaultBalances.userId, users.id))
            .where(eq(vaultBalances.vaultId, vaultId));

        // Get simplified debt structure
        const debtStructure = await getSimplifiedDebts(vaultId);

        res.success({
            balances,
            debtStructure
        }, "Vault balances retrieved successfully");
    })
);

export default router;
