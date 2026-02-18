import express from "express";
import { body, validationResult } from "express-validator";
import { eq } from "drizzle-orm";
import db from "../config/db.js";
import { retirementPlanning } from "../db/schema.js";
import { protect } from "../middleware/auth.js";
import retirementService from "../services/retirementService.js";
import { logInfo, logError } from "../utils/logger.js";

const router = express.Router();

/**
 * @swagger
 * /retirement-planning:
 *   post:
 *     summary: Calculate or create retirement planning goal
 *     tags: [Retirement Planning]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentAge
 *               - retirementAge
 *               - desiredRetirementSavings
 *             properties:
 *               currentAge:
 *                 type: integer
 *                 description: User's current age
 *               retirementAge:
 *                 type: integer
 *                 description: Target retirement age
 *               currentSavings:
 *                 type: number
 *                 description: Current retirement savings
 *                 default: 0
 *               desiredRetirementSavings:
 *                 type: number
 *                 description: Desired amount at retirement (in today's dollars)
 *               expectedAnnualReturn:
 *                 type: number
 *                 description: Expected annual investment return (as decimal, e.g., 0.07 for 7%)
 *                 default: 0.07
 *               monthlyContribution:
 *                 type: number
 *                 description: Amount user plans to save monthly (optional)
 *                 default: 0
 *               inflationRate:
 *                 type: number
 *                 description: Expected inflation rate (as decimal)
 *                 default: 0.03
 *               currency:
 *                 type: string
 *                 description: Currency code
 *                 default: USD
 *               notes:
 *                 type: string
 *                 description: Additional notes
 *     responses:
 *       201:
 *         description: Retirement plan calculated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/RetirementPlanning'
 *       400:
 *         description: Invalid input
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post("/", protect, [
    body("currentAge")
        .isInt({ min: 18, max: 120 })
        .withMessage("Current age must be between 18 and 120"),
    body("retirementAge")
        .isInt({ min: 18, max: 120 })
        .withMessage("Retirement age must be between 18 and 120"),
    body("desiredRetirementSavings")
        .isFloat({ min: 0 })
        .withMessage("Desired retirement savings must be a positive number"),
    body("currentSavings")
        .optional()
        .isFloat({ min: 0 })
        .withMessage("Current savings must be a positive number"),
    body("expectedAnnualReturn")
        .optional()
        .isFloat({ min: -0.5, max: 0.5 })
        .withMessage("Expected annual return must be between -50% and 50%"),
    body("monthlyContribution")
        .optional()
        .isFloat({ min: 0 })
        .withMessage("Monthly contribution must be a positive number"),
    body("inflationRate")
        .optional()
        .isFloat({ min: 0, max: 0.2 })
        .withMessage("Inflation rate must be between 0% and 20%"),
    body("currency")
        .optional()
        .isLength({ min: 3, max: 3 })
        .withMessage("Currency must be a valid 3-letter code")
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: "Validation errors",
                errors: errors.array()
            });
        }

        const {
            currentAge,
            retirementAge,
            currentSavings = 0,
            desiredRetirementSavings,
            expectedAnnualReturn = 0.07,
            monthlyContribution = 0,
            inflationRate = 0.03,
            currency = "USD",
            notes
        } = req.body;

        // Custom validation: retirement age > current age
        if (retirementAge <= currentAge) {
            return res.status(400).json({
                success: false,
                message: "Retirement age must be greater than current age"
            });
        }

        const retirementPlan = await retirementService.createOrUpdateRetirementPlan(
            req.user.id,
            {
                currentAge,
                retirementAge,
                currentSavings,
                desiredRetirementSavings,
                expectedAnnualReturn,
                monthlyContribution,
                inflationRate,
                currency,
                notes
            }
        );

        logInfo("Retirement plan calculated", {
            userId: req.user.id,
            planId: retirementPlan.id,
            status: retirementPlan.status
        });

        res.status(201).json({
            success: true,
            message: "Retirement plan calculated successfully",
            data: retirementPlan
        });

    } catch (error) {
        logError("Error calculating retirement plan", {
            userId: req.user.id,
            error: error.message
        });

        res.status(400).json({
            success: false,
            message: error.message || "Error calculating retirement plan"
        });
    }
});

/**
 * @swagger
 * /retirement-planning:
 *   get:
 *     summary: Get user's retirement planning data
 *     tags: [Retirement Planning]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Retirement planning data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/RetirementPlanning'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: Retirement plan not found
 */
router.get("/", protect, async (req, res) => {
    try {
        const retirementPlan = await retirementService.getRetirementPlan(req.user.id);

        if (!retirementPlan) {
            return res.status(404).json({
                success: false,
                message: "Retirement plan not found. Please create one first."
            });
        }

        res.json({
            success: true,
            data: retirementPlan
        });

    } catch (error) {
        logError("Error fetching retirement plan", {
            userId: req.user.id,
            error: error.message
        });

        res.status(500).json({
            success: false,
            message: "Error fetching retirement plan"
        });
    }
});

/**
 * @swagger
 * /retirement-planning/comparison:
 *   post:
 *     summary: Compare current contribution with required contribution
 *     tags: [Retirement Planning]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - monthlyContribution
 *               - requiredContribution
 *             properties:
 *               monthlyContribution:
 *                 type: number
 *                 description: User's current monthly contribution
 *               requiredContribution:
 *                 type: number
 *                 description: Required monthly contribution to reach goal
 *     responses:
 *       200:
 *         description: Comparison results
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post("/comparison", protect, [
    body("monthlyContribution")
        .isFloat({ min: 0 })
        .withMessage("Monthly contribution must be a positive number"),
    body("requiredContribution")
        .isFloat({ min: 0 })
        .withMessage("Required contribution must be a positive number")
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: "Validation errors",
                errors: errors.array()
            });
        }

        const { monthlyContribution, requiredContribution } = req.body;

        const comparison = retirementService.compareContributions(
            monthlyContribution,
            requiredContribution
        );

        res.json({
            success: true,
            data: comparison
        });

    } catch (error) {
        logError("Error comparing contributions", {
            userId: req.user.id,
            error: error.message
        });

        res.status(500).json({
            success: false,
            message: "Error comparing contributions"
        });
    }
});

/**
 * @swagger
 * /retirement-planning:
 *   put:
 *     summary: Update retirement planning calculation
 *     tags: [Retirement Planning]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               currentAge:
 *                 type: integer
 *               retirementAge:
 *                 type: integer
 *               currentSavings:
 *                 type: number
 *               desiredRetirementSavings:
 *                 type: number
 *               expectedAnnualReturn:
 *                 type: number
 *               monthlyContribution:
 *                 type: number
 *               inflationRate:
 *                 type: number
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Retirement plan updated successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: Retirement plan not found
 */
router.put("/", protect, [
    body("currentAge")
        .optional()
        .isInt({ min: 18, max: 120 })
        .withMessage("Current age must be between 18 and 120"),
    body("retirementAge")
        .optional()
        .isInt({ min: 18, max: 120 })
        .withMessage("Retirement age must be between 18 and 120"),
    body("desiredRetirementSavings")
        .optional()
        .isFloat({ min: 0 })
        .withMessage("Desired retirement savings must be a positive number"),
    body("currentSavings")
        .optional()
        .isFloat({ min: 0 })
        .withMessage("Current savings must be a positive number"),
    body("monthlyContribution")
        .optional()
        .isFloat({ min: 0 })
        .withMessage("Monthly contribution must be a positive number")
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: "Validation errors",
                errors: errors.array()
            });
        }

        const existingPlan = await retirementService.getRetirementPlan(req.user.id);

        if (!existingPlan) {
            return res.status(404).json({
                success: false,
                message: "Retirement plan not found. Please create one first."
            });
        }

        const updateData = {
            currentAge: req.body.currentAge || existingPlan.currentAge,
            retirementAge: req.body.retirementAge || existingPlan.retirementAge,
            currentSavings: req.body.currentSavings !== undefined ? req.body.currentSavings : existingPlan.currentSavings,
            desiredRetirementSavings: req.body.desiredRetirementSavings || existingPlan.desiredRetirementSavings,
            expectedAnnualReturn: req.body.expectedAnnualReturn !== undefined ? req.body.expectedAnnualReturn : existingPlan.expectedAnnualReturn,
            monthlyContribution: req.body.monthlyContribution !== undefined ? req.body.monthlyContribution : existingPlan.monthlyContribution,
            inflationRate: req.body.inflationRate !== undefined ? req.body.inflationRate : existingPlan.inflationRate,
            currency: req.body.currency || existingPlan.currency,
            notes: req.body.notes !== undefined ? req.body.notes : existingPlan.notes
        };

        // Validate retirement age > current age
        if (updateData.retirementAge <= updateData.currentAge) {
            return res.status(400).json({
                success: false,
                message: "Retirement age must be greater than current age"
            });
        }

        const updatedPlan = await retirementService.createOrUpdateRetirementPlan(
            req.user.id,
            updateData
        );

        logInfo("Retirement plan updated", {
            userId: req.user.id,
            planId: updatedPlan.id
        });

        res.json({
            success: true,
            message: "Retirement plan updated successfully",
            data: updatedPlan
        });

    } catch (error) {
        logError("Error updating retirement plan", {
            userId: req.user.id,
            error: error.message
        });

        res.status(400).json({
            success: false,
            message: error.message || "Error updating retirement plan"
        });
    }
});

/**
 * @swagger
 * /retirement-planning:
 *   delete:
 *     summary: Delete user's retirement planning data
 *     tags: [Retirement Planning]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Retirement plan deleted successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: Retirement plan not found
 */
router.delete("/", protect, async (req, res) => {
    try {
        const existingPlan = await retirementService.getRetirementPlan(req.user.id);

        if (!existingPlan) {
            return res.status(404).json({
                success: false,
                message: "Retirement plan not found"
            });
        }

        await retirementService.deleteRetirementPlan(req.user.id);

        logInfo("Retirement plan deleted", {
            userId: req.user.id
        });

        res.json({
            success: true,
            message: "Retirement plan deleted successfully"
        });

    } catch (error) {
        logError("Error deleting retirement plan", {
            userId: req.user.id,
            error: error.message
        });

        res.status(500).json({
            success: false,
            message: "Error deleting retirement plan"
        });
    }
});

export default router;
