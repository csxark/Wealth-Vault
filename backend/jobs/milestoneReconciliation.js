import db from "../config/db.js";
import { sql } from "drizzle-orm";
import logger from "../utils/logger.js";
import { MilestoneService } from "../services/milestoneService.js";

/**
 * Milestone Reconciliation Job
 * Issue #573: Detects and backfills missed milestone triggers across all tenants
 * 
 * Runs periodically (e.g., hourly) to detect goals that crossed thresholds
 * without triggering milestones due to race conditions or data inconsistencies.
 */
class MilestoneReconciliationJob {
  constructor() {
    this.milestoneService = new MilestoneService();
    this.isRunning = false;
    this.lastRunAt = null;
    this.stats = {
      runsTotal: 0,
      tenantsProcessed: 0,
      goalsProcessed: 0,
      missedDetected: 0,
      backfilled: 0,
      errors: 0,
    };
  }

  /**
   * Main reconciliation job
   */
  async run() {
    if (this.isRunning) {
      logger.warn("Milestone reconciliation already running, skipping...");
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    const runId = `milestone-reconcile-${Date.now()}`;

    logger.info("Starting milestone reconciliation", { runId });

    try {
      // Get all active tenants with goals that have milestones
      const tenantsWithMilestones = await db.execute(sql`
        SELECT DISTINCT gm.tenant_id, t.name AS tenant_name
        FROM goal_milestones gm
        JOIN tenants t ON t.id = gm.tenant_id
        WHERE t.status = 'active'
        ORDER BY gm.tenant_id
      `);

      logger.info("Found tenants to process", {
        runId,
        count: tenantsWithMilestones.rows.length,
      });

      let tenantsProcessed = 0;
      let goalsProcessed = 0;
      let missedDetected = 0;
      let backfilled = 0;
      let errors = 0;

      // Process each tenant
      for (const { tenant_id, tenant_name } of tenantsWithMilestones.rows) {
        try {
          await this.reconcileTenant({
            tenantId: tenant_id,
            tenantName: tenant_name,
            runId,
          });

          tenantsProcessed++;
        } catch (error) {
          logger.error("Error reconciling tenant", {
            runId,
            tenantId: tenant_id,
            error: error.message,
          });
          errors++;
        }
      }

      // Get reconciliation stats from this run
      const runStats = await this.getRunStats();
      
      this.stats.runsTotal++;
      this.stats.tenantsProcessed += runStats.tenantsProcessed;
      this.stats.goalsProcessed += runStats.goalsProcessed;
      this.stats.missedDetected += runStats.missedDetected;
      this.stats.backfilled += runStats.backfilled;
      this.stats.errors += errors;

      const duration = Date.now() - startTime;
      this.lastRunAt = new Date();

      logger.info("Milestone reconciliation completed", {
        runId,
        duration: `${duration}ms`,
        stats: {
          tenantsProcessed: runStats.tenantsProcessed,
          goalsProcessed: runStats.goalsProcessed,
          missedDetected: runStats.missedDetected,
          backfilled: runStats.backfilled,
          errors,
        },
      });

      return {
        success: true,
        runId,
        duration,
        stats: runStats,
      };
    } catch (error) {
      logger.error("Milestone reconciliation failed", {
        runId,
        error: error.message,
      });
      this.stats.errors++;
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Reconcile milestones for a single tenant
   */
  async reconcileTenant({ tenantId, tenantName, runId }) {
    logger.debug("Reconciling tenant", { runId, tenantId, tenantName });

    // Get all goals with milestones for this tenant
    const goalsWithMilestones = await db.execute(sql`
      SELECT DISTINCT
        g.id AS goal_id,
        g.name AS goal_name,
        g.current_amount,
        g.target_amount
      FROM goals g
      JOIN goal_milestones gm ON gm.goal_id = g.id AND gm.tenant_id = g.tenant_id
      WHERE g.tenant_id = ${tenantId}
        AND g.status IN ('active', 'completed')
      ORDER BY g.id
    `);

    logger.debug("Found goals to reconcile", {
      runId,
      tenantId,
      count: goalsWithMilestones.rows.length,
    });

    // Process each goal
    for (const goal of goalsWithMilestones.rows) {
      try {
        await this.reconcileGoal({
          tenantId,
          goalId: goal.goal_id,
          goalName: goal.goal_name,
          currentAmount: goal.current_amount,
          targetAmount: goal.target_amount,
          runId,
        });
      } catch (error) {
        logger.error("Error reconciling goal", {
          runId,
          tenantId,
          goalId: goal.goal_id,
          error: error.message,
        });
      }
    }
  }

  /**
   * Reconcile milestones for a single goal
   */
  async reconcileGoal({
    tenantId,
    goalId,
    goalName,
    currentAmount,
    targetAmount,
    runId,
  }) {
    logger.debug("Reconciling goal", {
      runId,
      tenantId,
      goalId,
      goalName,
      currentAmount,
    });

    // Detect missed milestones
    const result = await this.milestoneService.detectMissedMilestones({
      tenantId,
      goalId,
      currentProgressDollars: currentAmount,
    });

    if (result.missedCount > 0) {
      logger.warn("Missed milestones detected for goal", {
        runId,
        tenantId,
        goalId,
        goalName,
        missedCount: result.missedCount,
      });

      // Backfill each missed milestone
      for (const missed of result.milestones) {
        try {
          const backfillResult = await this.milestoneService.backfillMissedMilestone({
            tenantId,
            goalId,
            milestoneId: missed.milestone_id,
            currentProgressCents: this.milestoneService.dollarsToCents(currentAmount),
            targetCents: this.milestoneService.dollarsToCents(targetAmount),
          });

          if (backfillResult.success) {
            logger.info("Milestone backfilled", {
              runId,
              tenantId,
              goalId,
              milestoneId: missed.milestone_id,
              triggerId: backfillResult.triggerId,
            });
          }
        } catch (error) {
          logger.error("Error backfilling milestone", {
            runId,
            tenantId,
            goalId,
            milestoneId: missed.milestone_id,
            error: error.message,
          });
        }
      }
    }
  }

  /**
   * Get stats from the reconciliation job
   */
  async getRunStats() {
    try {
      const result = await db.execute(sql`
        SELECT 
          COUNT(DISTINCT mma.tenant_id) AS tenants_processed,
          COUNT(DISTINCT mma.goal_id) AS goals_processed,
          COUNT(*) AS missed_detected,
          COUNT(mma.backfilled_at) AS backfilled
        FROM milestone_missed_audit mma
        WHERE mma.detected_at >= NOW() - INTERVAL '1 hour'
      `);

      return {
        tenantsProcessed: parseInt(result.rows[0]?.tenants_processed || 0),
        goalsProcessed: parseInt(result.rows[0]?.goals_processed || 0),
        missedDetected: parseInt(result.rows[0]?.missed_detected || 0),
        backfilled: parseInt(result.rows[0]?.backfilled || 0),
      };
    } catch (error) {
      logger.error("Error getting run stats", { error: error.message });
      return {
        tenantsProcessed: 0,
        goalsProcessed: 0,
        missedDetected: 0,
        backfilled: 0,
      };
    }
  }

  /**
   * Get overall job statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt,
    };
  }

  /**
   * Schedule periodic reconciliation
   * @param {number} intervalMinutes - Interval in minutes (default: 60)
   */
  schedule(intervalMinutes = 60) {
    const intervalMs = intervalMinutes * 60 * 1000;

    logger.info("Scheduling milestone reconciliation", {
      intervalMinutes,
    });

    // Run immediately on startup
    this.run().catch((error) => {
      logger.error("Initial milestone reconciliation failed", {
        error: error.message,
      });
    });

    // Schedule recurring runs
    this.intervalId = setInterval(() => {
      this.run().catch((error) => {
        logger.error("Scheduled milestone reconciliation failed", {
          error: error.message,
        });
      });
    }, intervalMs);

    return this.intervalId;
  }

  /**
   * Stop scheduled reconciliation
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info("Milestone reconciliation stopped");
    }
  }
}

export default new MilestoneReconciliationJob();
