import express from "express";
import { body, validationResult } from "express-validator";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import db from "../config/db.js";
import { subscriptions, subscriptionUsage, cancellationSuggestions, expenses } from "../db/schema.js";
import { protect } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { AppError } from "../utils/AppError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import subscriptionDetector from "../services/subscriptionDetector.js";
import subscriptionAI from "../services/subscriptionAI.js";

const router = express.Router();

/**
 * @route   GET /api/subscriptions
 * @desc    Get all active subscriptions for a user
 * @access  Private
 */
router.get("/", protect, asyncHandler(async (req, res, next) => {
    const userSubs = await db.query.subscriptions.findMany({
        where: eq(subscriptions.userId, req.user.id),
        orderBy: [desc(subscriptions.nextRenewalDate)],
    });

    const healthScore = await subscriptionAI.calculateHealthScore(req.user.id);

    return new ApiResponse(200, {
        subscriptions: userSubs,
        healthScore
    }, "Subscriptions retrieved successfully").send(res);
}));

/**
 * @route   POST /api/subscriptions/detect
 * @desc    Detect subscriptions from expense patterns
 * @access  Private
 */
router.post("/detect", protect, asyncHandler(async (req, res, next) => {
    const detected = await subscriptionDetector.detectFromExpenses(req.user.id);
    return new ApiResponse(200, detected, `Detected ${detected.length} potential subscriptions`).send(res);
}));

/**
 * @route   POST /api/subscriptions
 * @desc    Manually add a subscription or confirm a detected one
 * @access  Private
 */
router.post("/", protect, [
    body("name").notEmpty().withMessage("Subscription name is required"),
    body("amount").isNumeric().withMessage("Valid amount is required"),
    body("billingCycle").isIn(["weekly", "biweekly", "monthly", "quarterly", "yearly"]),
    body("startDate").isISO8601(),
    body("nextRenewalDate").isISO8601(),
], asyncHandler(async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return next(new AppError(400, "Validation failed", errors.array()));
    }

    const { name, provider, category, amount, currency, billingCycle, startDate, nextRenewalDate, paymentMethod, notes, metadata } = req.body;

    const [newSub] = await db.insert(subscriptions).values({
        userId: req.user.id,
        name,
        provider,
        category: category || "other",
        amount: amount.toString(),
        currency: currency || "INR",
        billingCycle,
        startDate: new Date(startDate),
        nextRenewalDate: new Date(nextRenewalDate),
        paymentMethod,
        notes,
        metadata: metadata || {},
    }).returning();

    return new ApiResponse(201, newSub, "Subscription added successfully").send(res);
}));

/**
 * @route   PATCH /api/subscriptions/:id
 * @desc    Update a subscription
 * @access  Private
 */
router.patch("/:id", protect, asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    const [existingSub] = await db.select().from(subscriptions).where(and(eq(subscriptions.id, id), eq(subscriptions.userId, req.user.id)));
    if (!existingSub) {
        return next(new AppError(404, "Subscription not found"));
    }

    const updateData = { ...req.body, updatedAt: new Date() };
    if (req.body.amount) updateData.amount = req.body.amount.toString();
    if (req.body.startDate) updateData.startDate = new Date(req.body.startDate);
    if (req.body.nextRenewalDate) updateData.nextRenewalDate = new Date(req.body.nextRenewalDate);

    const [updatedSub] = await db.update(subscriptions)
        .set(updateData)
        .where(eq(subscriptions.id, id))
        .returning();

    return new ApiResponse(200, updatedSub, "Subscription updated successfully").send(res);
}));

/**
 * @route   GET /api/subscriptions/suggestions
 * @desc    Get AI-powered cancellation suggestions
 * @access  Private
 */
router.get("/suggestions", protect, asyncHandler(async (req, res, next) => {
    // Trigger analysis
    const newSuggestions = await subscriptionAI.analyzeSubscriptions(req.user.id);

    // Save new suggestions to DB if they don't exist
    for (const suggestion of newSuggestions) {
        const [existing] = await db.select().from(cancellationSuggestions).where(
            and(
                eq(cancellationSuggestions.userId, req.user.id),
                eq(cancellationSuggestions.subscriptionId, suggestion.subscriptionId),
                eq(cancellationSuggestions.status, 'pending')
            )
        );

        if (!existing) {
            await db.insert(cancellationSuggestions).values(suggestion);
        }
    }

    const savedSuggestions = await db.query.cancellationSuggestions.findMany({
        where: and(
            eq(cancellationSuggestions.userId, req.user.id),
            eq(cancellationSuggestions.status, 'pending')
        ),
        with: {
            subscription: true
        },
        orderBy: [desc(cancellationSuggestions.createdAt)]
    });

    return new ApiResponse(200, savedSuggestions, "Cancellation suggestions retrieved successfully").send(res);
}));

/**
 * @route   POST /api/subscriptions/usage/:id
 * @desc    Log usage for a subscription
 * @access  Private
 */
router.post("/usage/:id", protect, asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const month = new Date().toISOString().substring(0, 7); // YYYY-MM

    const [existingUsage] = await db.select().from(subscriptionUsage).where(
        and(
            eq(subscriptionUsage.subscriptionId, id),
            eq(subscriptionUsage.userId, req.user.id),
            eq(subscriptionUsage.month, month)
        )
    );

    if (existingUsage) {
        const [updated] = await db.update(subscriptionUsage)
            .set({
                usageCount: (existingUsage.usageCount || 0) + 1,
                lastUsedAt: new Date(),
                updatedAt: new Date()
            })
            .where(eq(subscriptionUsage.id, existingUsage.id))
            .returning();
        return new ApiResponse(200, updated, "Usage updated successfully").send(res);
    } else {
        const [created] = await db.insert(subscriptionUsage).values({
            subscriptionId: id,
            userId: req.user.id,
            month,
            usageCount: 1,
            lastUsedAt: new Date()
        }).returning();
        return new ApiResponse(201, created, "Usage logged successfully").send(res);
    }
}));

/**
 * @route   GET /api/subscriptions/insights
 * @desc    Get detailed subscription insights
 * @access  Private
 */
router.get("/insights", protect, asyncHandler(async (req, res, next) => {
    const stats = await db.select({
        category: subscriptions.category,
        count: sql`count(*)`,
        totalMonthly: sql`sum(CASE 
      WHEN billing_cycle = 'yearly' THEN amount / 12 
      WHEN billing_cycle = 'quarterly' THEN amount / 3
      WHEN billing_cycle = 'weekly' THEN amount * 4
      ELSE amount 
    END)`
    }).from(subscriptions)
        .where(and(eq(subscriptions.userId, req.user.id), eq(subscriptions.status, 'active')))
        .groupBy(subscriptions.category);

    const annualPotentialSavings = await db.select({
        total: sql`sum(amount * CASE 
      WHEN billing_cycle = 'yearly' THEN 1 
      WHEN billing_cycle = 'quarterly' THEN 4
      WHEN billing_cycle = 'monthly' THEN 12
      ELSE 52 
    END)`
    }).from(subscriptions)
        .innerJoin(cancellationSuggestions, eq(subscriptions.id, cancellationSuggestions.subscriptionId))
        .where(and(
            eq(subscriptions.userId, req.user.id),
            eq(cancellationSuggestions.status, 'pending'),
            eq(cancellationSuggestions.severity, 'high')
        ));

    return new ApiResponse(200, {
        categoryBreakdown: stats,
        annualPotentialSavings: annualPotentialSavings[0]?.total || 0,
        healthHistory: [] // To be implemented with historical data
    }, "Insights retrieved successfully").send(res);
}));

export default router;
