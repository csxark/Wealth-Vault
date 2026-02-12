import express from "express";
import { body, validationResult } from "express-validator";
import { protect } from "../middleware/auth.js";
import { securityInterceptor } from "../middleware/auditMiddleware.js";
import { checkVaultAccess, isVaultOwner } from "../middleware/vaultAuth.js";
import { asyncHandler, ValidationError, NotFoundError } from "../middleware/errorHandler.js";
import forecastingService from "../services/forecastingService.js";
import BudgetRepository from "../repositories/BudgetRepository.js";
import ApiResponse from "../utils/ApiResponse.js";
import AppError from "../utils/AppError.js";

const router = express.Router();

/**
 * @swagger
 * /budgets/vault/:vaultId:
 *   get:
 *     summary: Get vault budget
 *     tags: [Budgets]
 */
router.get("/vault/:vaultId", protect, checkVaultAccess(), asyncHandler(async (req, res) => {
  const { vaultId } = req.params;
  const { period = 'monthly' } = req.query;

  // Get vault settings
  const vaultSettings = await BudgetRepository.findVaultSettings(vaultId);

  if (!vaultSettings) {
    throw new NotFoundError('Vault settings not found');
  }

  // Calculate date range based on period
  const now = new Date();
  let startDate, endDate;

  if (period === 'monthly') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (period === 'yearly') {
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate = new Date(now.getFullYear(), 11, 31);
  } else {
    throw new AppError('Invalid period', 400);
  }

  // Get vault expenses for the period
  const vaultExpenses = await BudgetRepository.getVaultSpendingByCategory(vaultId, startDate, endDate);

  // Calculate total spending
  const totalSpending = vaultExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);

  // Get vault members count for budget allocation
  const memberCount = await BudgetRepository.getVaultMemberCount(vaultId);

  new ApiResponse(200, {
    vaultId,
    period,
    totalBudget: Number(vaultSettings.monthlyBudget || 0),
    totalSpending,
    remainingBudget: Number(vaultSettings.monthlyBudget || 0) - totalSpending,
    memberCount,
    spendingByCategory: vaultExpenses.map(exp => ({
      categoryId: exp.categoryId,
      categoryName: exp.categoryName,
      categoryColor: exp.categoryColor,
      amount: Number(exp.amount),
      count: Number(exp.count),
    })),
  }, 'Vault budget retrieved successfully').send(res);
}));

/**
 * @swagger
 * /budgets/vault/:vaultId:
 *   put:
 *     summary: Update vault budget
 *     tags: [Budgets]
 */
router.put("/vault/:vaultId", protect, isVaultOwner,
  async (req, res, next) => {
    try {
      const [settings] = await db.select().from(familySettings).where(eq(familySettings.vaultId, req.params.vaultId));
      req.resource = settings;
      next();
    } catch (e) {
      next();
    }
  },
  securityInterceptor(),
  [
    body("monthlyBudget").optional().isFloat({ min: 0 }),
    body("defaultSplitMethod").optional().isIn(['equal', 'percentage', 'custom']),
    body("enableReimbursements").optional().isBoolean(),
  ], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError("Validation failed", errors.array());
    }

  const { vaultId } = req.params;
  const { monthlyBudget, defaultSplitMethod, enableReimbursements } = req.body;

  // Update or create vault settings
  const updateData = {};
  if (monthlyBudget !== undefined) updateData.monthlyBudget = monthlyBudget.toString();
  if (defaultSplitMethod) updateData.defaultSplitMethod = defaultSplitMethod;
  if (enableReimbursements !== undefined) updateData.enableReimbursements = enableReimbursements;

  const updatedSettings = await BudgetRepository.updateVaultSettings(vaultId, updateData);

  if (!updatedSettings) {
    throw new NotFoundError('Vault settings not found');
  }

  new ApiResponse(200, updatedSettings, 'Vault budget updated successfully').send(res);
}));

/**
 * @swagger
 * /budgets/vault/:vaultId/alerts:
 *   get:
 *     summary: Get vault budget alerts
 *     tags: [Budgets]
 */
router.get("/vault/:vaultId/alerts", protect, checkVaultAccess(), asyncHandler(async (req, res) => {
  const { vaultId } = req.params;

  // Get vault settings and current spending
  const vaultSettings = await BudgetRepository.findVaultSettings(vaultId);

  if (!vaultSettings || !vaultSettings.monthlyBudget) {
    return new ApiResponse(200, [], 'No budget alerts').send(res);
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Calculate current month spending
  const currentSpending = await BudgetRepository.getVaultTotalSpending(vaultId, startOfMonth, endOfMonth);
  const monthlyBudget = Number(vaultSettings.monthlyBudget);
  const percentage = (currentSpending / monthlyBudget) * 100;

  const alerts = [];

  if (percentage >= 100) {
    alerts.push({
      type: 'exceeded',
      message: `Vault budget exceeded by $${(currentSpending - monthlyBudget).toFixed(2)} (${percentage.toFixed(1)}%)`,
      severity: 'critical',
    });
  } else if (percentage >= 80) {
    alerts.push({
      type: 'warning',
      message: `Vault budget at ${percentage.toFixed(1)}% - approaching limit`,
      severity: 'warning',
    });
  }

  new ApiResponse(200, alerts, 'Vault budget alerts retrieved successfully').send(res);
}));

/**
 * @swagger
 * /budgets/forecast:
 *   post:
 *     summary: Generate expense forecast
 *     tags: [Budgets]
 */
router.post("/forecast", protect, [
  body("categoryId").optional().isUUID(),
  body("period").optional().isIn(['monthly', 'quarterly', 'yearly']),
  body("monthsAhead").optional().isInt({ min: 1, max: 24 }),
  body("scenario").optional().isIn(['baseline', 'optimistic', 'pessimistic']),
  body("seasonalAdjustment").optional().isBoolean(),
  body("externalFactors").optional().isArray(),
], securityInterceptor(), asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError("Validation failed", errors.array());
  }

  const {
    categoryId,
    period = 'monthly',
    monthsAhead = 6,
    scenario = 'baseline',
    seasonalAdjustment = false,
    externalFactors = []
  } = req.body;

  const forecast = await forecastingService.generateExpenseForecast(
    req.user.id,
    categoryId,
    period,
    monthsAhead,
    {
      scenario,
      seasonalAdjustment,
      externalFactors
    }
  );

  new ApiResponse(200, forecast, 'Expense forecast generated successfully').send(res);
}));

/**
 * @swagger
 * /budgets/forecast/simulation:
 *   post:
 *     summary: Generate what-if scenario forecast
 *     tags: [Budgets]
 */
router.post("/forecast/simulation", protect, [
  body("simulationInputs").isObject(),
  body("simulationInputs.incomeChange").optional().isFloat(),
  body("simulationInputs.expenseAdjustments").optional().isArray(),
  body("simulationInputs.oneTimeExpenses").optional().isArray(),
], securityInterceptor(), asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError("Validation failed", errors.array());
  }

  const { simulationInputs } = req.body;

  const simulation = await forecastingService.generateSimulationForecast(
    req.user.id,
    simulationInputs
  );

  new ApiResponse(200, simulation, 'Simulation forecast generated successfully').send(res);
}));

/**
 * @swagger
 * /budgets/forecast:
 *   get:
 *     summary: Get user forecasts
 *     tags: [Budgets]
 */
router.get("/forecast", protect, asyncHandler(async (req, res) => {
  const { type, limit = 10 } = req.query;

  const forecasts = await forecastingService.getUserForecasts(
    req.user.id,
    type,
    parseInt(limit)
  );

  new ApiResponse(200, forecasts, 'User forecasts retrieved successfully').send(res);
}));

/**
 * @swagger
 * /budgets/forecast/:forecastId:
 *   get:
 *     summary: Get forecast by ID
 *     tags: [Budgets]
 */
router.get("/forecast/:forecastId", protect, asyncHandler(async (req, res) => {
  const { forecastId } = req.params;

  const forecast = await forecastingService.getForecastById(forecastId, req.user.id);

  if (!forecast) {
    throw new NotFoundError('Forecast not found');
  }

  new ApiResponse(200, forecast, 'Forecast retrieved successfully').send(res);
}));

/**
 * @swagger
 * /budgets/forecast/:forecastId:
 *   delete:
 *     summary: Delete forecast
 *     tags: [Budgets]
 */
router.delete("/forecast/:forecastId", protect,
  async (req, res, next) => {
    try {
      const [forecast] = await db.select().from(forecasts).where(and(eq(forecasts.id, req.params.forecastId), eq(forecasts.userId, req.user.id)));
      req.resource = forecast;
      next();
    } catch (e) {
      next();
    }
  },
  securityInterceptor(),
  asyncHandler(async (req, res) => {
    const { forecastId } = req.params;

    await forecastingService.deleteForecast(forecastId, req.user.id);

  new ApiResponse(200, null, 'Forecast deleted successfully').send(res);
}));

export default router;
