import express from "express";
import { body, param, validationResult } from "express-validator";
import { eq, and } from "drizzle-orm";
import db from "../config/db.js";
import { emergencyFundGoals } from "../db/schema.js";
import { protect } from "../middleware/auth.js";
import emergencyFundService from "../services/emergencyFundService.js";

const router = express.Router();

// Get emergency fund summary
router.get("/", protect, async (req, res) => {
    try {
        const summary = await emergencyFundService.getSummary(req.user.id);
        res.json({
            success: true,
            data: summary
        });
    } catch (error) {
        console.error("Get emergency fund error:", error);
        res.status(500).json({
            success: false,
            message: "Server error while fetching emergency fund data"
        });
    }
});

// Get all emergency fund goals
router.get("/goals", protect, async (req, res) => {
    try {
        const { status } = req.query;
        const goals = await emergencyFundService.getAllGoals(req.user.id, { status });
        res.json({
            success: true,
            data: goals
        });
    } catch (error) {
        console.error("Get emergency fund goals error:", error);
        res.status(500).json({
            success: false,
            message: "Server error while fetching emergency fund goals"
        });
    }
});

// Calculate recommended target
router.post("/calculate", protect, [
    body("targetMonths")
        .optional()
        .isInt({ min: 3, max: 12 })
        .withMessage("Target months must be between 3 and 12")
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }
        const { targetMonths = 3 } = req.body;
        const calculation = await emergencyFundService.calculateTargetAmount(req.user.id, targetMonths);
        res.json({
            success: true,
            data: calculation
        });
    } catch (error) {
        console.error("Calculate emergency fund error:", error);
        res.status(500).json({
            success: false,
            message: "Server error while calculating emergency fund target"
        });
    }
});

// Create new emergency fund goal
router.post("/goals", protect, [
    body("targetMonths")
        .isInt({ min: 3, max: 12 })
        .withMessage("Target months must be between 3 and 12"),
    body("targetAmount")
        .isFloat({ min: 0 })
        .withMessage("Target amount must be a positive number")
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }
        const { targetMonths, targetAmount, currentSavings = 0, monthlyExpenses = 0, notes } = req.body;
        const [goal] = await db
            .insert(emergencyFundGoals)
            .values({
                userId: req.user.id,
                targetMonths,
                targetAmount: targetAmount.toString(),
                currentSavings: currentSavings.toString(),
                monthlyExpenses: monthlyExpenses.toString(),
                notes,
                status: "active",
                currency: req.user.currency || "USD",
                metadata: {
                    lastContribution: currentSavings > 0 ? new Date().toISOString() : null,
                    totalContributions: currentSavings > 0 ? 1 : 0,
                    contributionHistory: []
                }
            })
            .returning();
        res.status(201).json({
            success: true,
            message: "Emergency fund goal created successfully",
            data: {
                ...goal,
                progress: emergencyFundService.calculateProgress(goal)
            }
        });
    } catch (error) {
        console.error("Create emergency fund goal error:", error);
        res.status(500).json({
            success: false,
            message: "Server error while creating emergency fund goal"
        });
    }
});

// Update emergency fund goal
router.put("/goals/:id", protect, [
    param("id").isUUID().withMessage("Invalid goal ID")
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }
        const { id } = req.params;
        const updates = req.body;
        const updatedGoal = await emergencyFundService.updateGoal(id, req.user.id, updates);
        res.json({
            success: true,
            message: "Emergency fund goal updated successfully",
            data: {
                ...updatedGoal,
                progress: emergencyFundService.calculateProgress(updatedGoal)
            }
        });
    } catch (error) {
        console.error("Update emergency fund goal error:", error);
        if (error.message === "Emergency fund goal not found") {
            return res.status(404).json({
                success: false,
                message: "Emergency fund goal not found"
            });
        }
        res.status(500).json({
            success: false,
            message: "Server error while updating emergency fund goal"
        });
    }
});

// Add contribution to goal
router.post("/goals/:id/contribute", protect, [
    param("id").isUUID().withMessage("Invalid goal ID"),
    body("amount")
        .isFloat({ min: 0.01 })
        .withMessage("Amount must be at least 0.01")
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }
        const { id } = req.params;
        const { amount } = req.body;
        const result = await emergencyFundService.addSavings(id, req.user.id, amount);
        res.json({
            success: true,
            message: "Contribution added successfully",
            data: result
        });
    } catch (error) {
        console.error("Add contribution error:", error);
        if (error.message === "Emergency fund goal not found") {
            return res.status(404).json({
                success: false,
                message: "Emergency fund goal not found"
            });
        }
        res.status(500).json({
            success: false,
            message: "Server error while adding contribution"
        });
    }
});

// Recalculate target based on expenses
router.post("/goals/:id/recalculate", protect, [
    param("id").isUUID().withMessage("Invalid goal ID")
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }
        const { id } = req.params;
        const updatedGoal = await emergencyFundService.recalculateTarget(id, req.user.id);
        res.json({
            success: true,
            message: "Target amount recalculated based on current expenses",
            data: {
                ...updatedGoal,
                progress: emergencyFundService.calculateProgress(updatedGoal)
            }
        });
    } catch (error) {
        console.error("Recalculate target error:", error);
        if (error.message === "Emergency fund goal not found") {
            return res.status(404).json({
                success: false,
                message: "Emergency fund goal not found"
            });
        }
        res.status(500).json({
            success: false,
            message: "Server error while recalculating target"
        });
    }
});

// Delete emergency fund goal
router.delete("/goals/:id", protect, [
    param("id").isUUID().withMessage("Invalid goal ID")
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }
        const { id } = req.params;
        await emergencyFundService.deleteGoal(id, req.user.id);
        res.json({
            success: true,
            message: "Emergency fund goal deleted successfully"
        });
    } catch (error) {
        console.error("Delete emergency fund goal error:", error);
        if (error.message === "Emergency fund goal not found") {
            return res.status(404).json({
                success: false,
                message: "Emergency fund goal not found"
            });
        }
        res.status(500).json({
            success: false,
            message: "Server error while deleting emergency fund goal"
        });
    }
});

export default router;
