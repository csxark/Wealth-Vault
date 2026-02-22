import express from "express";
import { body, validationResult } from "express-validator";
import { eq, and, sql, desc, sum, count } from "drizzle-orm";
import crypto from "crypto";
import db from "../config/db.js";
import { vaults, vaultMembers, vaultInvites, users, vaultBalances } from "../db/schema.js";
import { protect } from "../middleware/auth.js";
import { checkVaultAccess, isVaultOwner } from "../middleware/vaultAuth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { AppError } from "../utils/AppError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { shieldGuard } from "../middleware/shieldGuard.js";
import { safeModeGuard } from "../middleware/safeModeGuard.js";
import { complianceGuard } from "../middleware/complianceGuard.js";
import { getSimplifiedDebts } from "../services/settlementService.js";
import vaultService from "../services/vaultService.js";
import fxService from "../services/fxService.js";
import { enforceInstitutionalGovernance } from "../middleware/govGuard.js";
import { ledgerEntries, ledgerAccounts, fxValuationSnapshots } from "../db/schema.js";

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
    safeModeGuard,
    complianceGuard,
    [
        body("name").trim().isLength({ min: 1, max: 100 }),
        body("description").optional().trim().isLength({ max: 500 }),
        body("currency").optional().isLength({ min: 3, max: 3 }),
    ],
    asyncHandler(async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return next(new AppError(400, "Validation failed", errors.array()));
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

        return new ApiResponse(201, newVault, "Vault created successfully").send(res);
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
    asyncHandler(async (req, res, next) => {
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

        return new ApiResponse(200, userVaults, "Vaults retrieved successfully").send(res);
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
    asyncHandler(async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return next(new AppError(400, "Validation failed", errors.array()));
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
            return next(new AppError(409, "User is already a member of this vault"));
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
        return new ApiResponse(200, { inviteToken: token }, `Invite sent to ${email}`).send(res);
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
    asyncHandler(async (req, res, next) => {
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
            return next(new AppError(404, "Invalid or expired invite token"));
        }

        if (new Date() > invite.expiresAt) {
            await db
                .update(vaultInvites)
                .set({ status: "expired" })
                .where(eq(vaultInvites.id, invite.id));
            return next(new AppError(400, "Invite token has expired"));
        }

        if (invite.email !== req.user.email) {
            return next(new AppError(403, "This invite was sent to a different email address"));
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

        return new ApiResponse(200, null, "Successfully joined the vault").send(res);
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
    asyncHandler(async (req, res, next) => {
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

        return new ApiResponse(200, members, "Vault members retrieved successfully").send(res);
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
    asyncHandler(async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return next(new AppError(400, "Validation failed", errors.array()));
        }

        const { vaultId } = req.params;
        const budget = await createSharedBudget(vaultId, req.body, req.user.id);

        return new ApiResponse(201, budget, "Shared budget created successfully").send(res);
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
    asyncHandler(async (req, res, next) => {
        const { vaultId } = req.params;
        const budgets = await getSharedBudgets(vaultId, req.user.id);

        return new ApiResponse(200, budgets, "Shared budgets retrieved successfully").send(res);
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
    asyncHandler(async (req, res, next) => {
        const { vaultId } = req.params;
        const approvals = await getPendingApprovals(vaultId, req.user.id);

        return new ApiResponse(200, approvals, "Pending approvals retrieved successfully").send(res);
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
    asyncHandler(async (req, res, next) => {
        const { approvalId } = req.params;
        const { notes } = req.body;

        const result = await processExpenseApproval(approvalId, req.user.id, true, notes);

        return new ApiResponse(200, result, "Expense approved successfully").send(res);
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
    asyncHandler(async (req, res, next) => {
        const { approvalId } = req.params;
        const { notes } = req.body;

        const result = await processExpenseApproval(approvalId, req.user.id, false, notes);

        return new ApiResponse(200, result, "Expense rejected successfully").send(res);
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
    asyncHandler(async (req, res, next) => {
        const { vaultId } = req.params;
        const { period } = req.query;

        const utilization = await getBudgetUtilization(vaultId, req.user.id, period);

        return new ApiResponse(200, utilization, "Budget utilization retrieved successfully").send(res);
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
    asyncHandler(async (req, res, next) => {
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

        return new ApiResponse(200, {
            balances,
            debtStructure
        }, "Vault balances retrieved successfully").send(res);
    })
);

/**
 * @route   GET /api/vaults/:vaultId/ledger
 * @desc    Get detailed double-entry ledger auditing for a vault
 */
router.get("/:vaultId/ledger", protect, checkVaultAccess(), asyncHandler(async (req, res) => {
    const { vaultId } = req.params;
    const reval = await vaultService.getVaultLedgerBalance(vaultId, req.user.id);

    // Get detailed entries
    const entries = await db.select().from(ledgerEntries)
        .where(and(eq(ledgerEntries.accountId, reval.accountId), eq(ledgerEntries.userId, req.user.id)))
        .orderBy(desc(ledgerEntries.entryDate))
        .limit(50);

    return new ApiResponse(200, {
        summary: reval,
        history: entries
    }, "Vault ledger audit retrieved successfully").send(res);
}));

/**
 * @route   GET /api/vaults/:vaultId/fx-deltas
 * @desc    Get real-time FX realized/unrealized delta history
 */
router.get("/:vaultId/fx-deltas", protect, checkVaultAccess(), asyncHandler(async (req, res) => {
    const { vaultId } = req.params;
    const delta = await fxService.getVaultRevaluationDelta(req.user.id, vaultId);

    // Get recent snapshots
    const accounts = await db.select({ id: ledgerAccounts.id }).from(ledgerAccounts)
        .where(and(eq(ledgerAccounts.vaultId, vaultId), eq(ledgerAccounts.userId, req.user.id)));

    const accountIds = accounts.map(a => a.id);
    if (accountIds.length === 0) return new ApiResponse(200, delta).send(res);

    // Filter snapshots manually since in IN-clause might be empty or too large
    const snapshots = await db.select().from(fxValuationSnapshots)
        .where(eq(fxValuationSnapshots.userId, req.user.id))
        .orderBy(desc(fxValuationSnapshots.valuationDate))
        .limit(50);

    const relevantSnapshots = snapshots.filter(s => accountIds.includes(s.accountId));

    return new ApiResponse(200, {
        currentDelta: delta,
        snapshotHistory: relevantSnapshots.slice(0, 20)
    }, "FX valuation history retrieved successfully").send(res);
}));

// ============================================================================
// DOUBLE-ENTRY LEDGER ENDPOINTS (L3)
// ============================================================================

/**
 * Get vault balance from ledger (reconstructed balance)
 * GET /vaults/:id/ledger/balance
 */
router.get('/:id/ledger/balance', protect, asyncWrapper(async (req, res) => {
    const { id: vaultId } = req.params;

    const balance = await vaultService.getVaultLedgerBalance(vaultId, req.user.id);

    return new ApiResponse(200, balance, "Ledger-based balance retrieved successfully").send(res);
}));

/**
 * Get vault ledger history (all journal entries)
 * GET /vaults/:id/ledger/history
 */
router.get('/:id/ledger/history', protect, asyncWrapper(async (req, res) => {
    const { id: vaultId } = req.params;
    const { startDate, endDate, limit = 50 } = req.query;

    const account = await db.query.ledgerAccounts.findFirst({
        where: and(
            eq(ledgerAccounts.vaultId, vaultId),
            eq(ledgerAccounts.userId, req.user.id)
        )
    });

    if (!account) {
        return new ApiResponse(404, null, "Vault ledger account not found").send(res);
    }

    let query = db.select().from(ledgerEntries)
        .where(eq(ledgerEntries.accountId, account.id))
        .orderBy(desc(ledgerEntries.createdAt))
        .limit(parseInt(limit));

    const entries = await query;

    return new ApiResponse(200, {
        accountId: account.id,
        accountName: account.name,
        entries,
        count: entries.length
    }, "Ledger history retrieved successfully").send(res);
}));

/**
 * Get trial balance for user's ledger
 * GET /vaults/ledger/trial-balance
 */
router.get('/ledger/trial-balance', protect, asyncWrapper(async (req, res) => {
    const trialBalance = await ledgerService.getTrialBalance(req.user.id);

    return new ApiResponse(200, trialBalance, "Trial balance retrieved successfully").send(res);
}));

/**
 * Trigger FX revaluation for all vaults
 * POST /vaults/ledger/revalue
 */
router.post('/ledger/revalue', protect, asyncWrapper(async (req, res) => {
    const { fxRates } = req.body;

    if (!fxRates) {
        return new ApiResponse(400, null, "FX rates are required").send(res);
    }

    const result = await ledgerService.revalueAllAccounts(req.user.id, fxRates);

    return new ApiResponse(200, result, "FX revaluation completed successfully").send(res);
}));

export default router;
