import express from 'express';
import { protect } from '../middleware/auth.js';
import forecastEngine from '../services/forecastEngine.js';
import liquidityMonitor from '../services/liquidityMonitor.js';
import simulationService from '../services/simulationService.js';
import { db } from '../config/db.js';
import { liquidityAlerts, transferSuggestions, goals, simulationResults, goalRiskProfiles } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

const router = express.Router();

/**
 * @route   GET /api/forecasts
 * @desc    Get cash flow forecast for the next N days
 */
router.get('/', protect, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const forecast = await forecastEngine.projectCashFlow(req.user.id, days);
    const runway = await liquidityMonitor.calculateRunway(req.user.id);

    res.json({
      success: true,
      data: {
        ...forecast,
        runway
      }
    });
  } catch (error) {
    console.error('Forecast error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/forecasts/liquidity
 * @desc    Get liquidity alerts and transfer suggestions
 */
router.get('/liquidity', protect, async (req, res) => {
  try {
    const alerts = await db.query.liquidityAlerts.findMany({
      where: eq(liquidityAlerts.userId, req.user.id),
      orderBy: (liquidityAlerts, { desc }) => [desc(liquidityAlerts.createdAt)]
    });

    const suggestions = await db.query.transferSuggestions.findMany({
      where: and(
        eq(transferSuggestions.userId, req.user.id),
        eq(transferSuggestions.status, 'pending')
      ),
      orderBy: (transferSuggestions, { desc }) => [desc(transferSuggestions.createdAt)]
    });

    res.json({
      success: true,
      data: {
        alerts,
        suggestions
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/forecasts/what-if
 * @desc    Simulate a what-if scenario (e.g., large purchase)
 */
router.post('/what-if', protect, async (req, res) => {
  try {
    const { amount, date, description, days = 60 } = req.body;

    // Target date for the event
    const eventDate = new Date(date || new Date());
    const forecast = await forecastEngine.projectCashFlow(req.user.id, days);

    // Apply the "what-if" event to the forecast
    const eventDateStr = eventDate.toISOString().split('T')[0];
    let eventApplied = false;

    const modifiedProjections = forecast.projections.map(p => {
      if (p.date >= eventDateStr) {
        eventApplied = true;
        return {
          ...p,
          balance: p.balance - parseFloat(amount)
        };
      }
      return p;
    });

    if (!eventApplied) {
      return res.status(400).json({
        success: false,
        message: "Event date is outside the forecast range"
      });
    }

    // Identify new danger zones
    const dangerZones = [];
    let currentZone = null;
    modifiedProjections.forEach((p, idx) => {
      if (p.balance < 0) {
        if (!currentZone) {
          currentZone = { startDate: p.date, lowestBalance: p.balance, duration: 1 };
        } else {
          currentZone.duration++;
          if (p.balance < currentZone.lowestBalance) currentZone.lowestBalance = p.balance;
        }
      } else if (currentZone) {
        currentZone.endDate = modifiedProjections[idx - 1].date;
        dangerZones.push(currentZone);
        currentZone = null;
      }
    });

    res.json({
      success: true,
      data: {
        originalSummary: forecast.summary,
        simulation: {
          event: { amount, date: eventDateStr, description },
          endBalance: modifiedProjections[modifiedProjections.length - 1].balance,
          impact: -parseFloat(amount),
          newDangerZones: dangerZones
        },
        projections: modifiedProjections
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/forecasts/alerts
 * @desc    Configure a liquidity alert threshold
 */
router.post('/alerts', protect, async (req, res) => {
  try {
    const { threshold, alertDays, severity } = req.body;

    const [alert] = await db.insert(liquidityAlerts).values({
      userId: req.user.id,
      threshold: threshold.toString(),
      alertDays: alertDays || 7,
      severity: severity || 'warning',
    }).returning();

    res.json({ success: true, data: alert });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   PATCH /api/forecasts/suggestions/:id
 * @desc    Update transfer suggestion status
 */
router.patch('/suggestions/:id', protect, async (req, res) => {
  try {
    const { status } = req.body;
    const [updated] = await db.update(transferSuggestions)
      .set({ status, updatedAt: new Date() })
      .where(and(
        eq(transferSuggestions.id, req.params.id),
        eq(transferSuggestions.userId, req.user.id)
      ))
      .returning();

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/forecasts/monte-carlo/goal/:goalId
 * @desc    Run a 10,000 iteration Monte Carlo simulation for a goal
 */
router.post('/monte-carlo/goal/:goalId', protect, async (req, res) => {
  try {
    const goal = await db.query.goals.findFirst({
      where: and(eq(goals.id, req.params.goalId), eq(goals.userId, req.user.id))
    });

    if (!goal) return res.status(404).json({ success: false, message: 'Goal not found' });

    const result = await simulationService.runGoalSimulation(req.user.id, goal);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/forecasts/monte-carlo/history/:goalId
 * @desc    Get simulation history for a specific goal
 */
router.get('/monte-carlo/history/:goalId', protect, async (req, res) => {
  try {
    const history = await db.select().from(simulationResults)
      .where(and(eq(simulationResults.resourceId, req.params.goalId), eq(simulationResults.userId, req.user.id)))
      .orderBy(desc(simulationResults.simulatedOn));

    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   PATCH /api/forecasts/monte-carlo/profile/:goalId
 * @desc    Update goal risk profile and rebalance settings
 */
router.patch('/monte-carlo/profile/:goalId', protect, async (req, res) => {
  try {
    const [updated] = await db.update(goalRiskProfiles)
      .set({
        ...req.body,
        updatedAt: new Date()
      })
      .where(eq(goalRiskProfiles.goalId, req.params.goalId))
      .returning();

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/forecasts/monte-carlo/stress-test/:goalId
 * @desc    Run a stress test simulation for a goal
 */
router.post('/monte-carlo/stress-test/:goalId', protect, async (req, res) => {
  try {
    const { regime } = req.body;
    const result = await simulationService.runStressTest(req.user.id, req.params.goalId, regime);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
