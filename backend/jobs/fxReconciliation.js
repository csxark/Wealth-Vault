import db from "../config/db.js";
import { FXConversionService } from "../services/fxConversionService.js";
import { 
  fxReconciliationAudit, 
  fxRateSnapshots,
  goalContributionFxDetails 
} from "../db/schema-fx.js";
import { eq, sql } from "drizzle-orm";
import logger from "../utils/logger.js";

const fxService = new FXConversionService();

/**
 * FX Reconciliation Job
 * Runs on a schedule to:
 * 1. Detect stale FX rates
 * 2. Reconcile contribution normalizations
 * 3. Identify goals affected by rate changes
 * 4. Generate reconciliation audit trail
 */
class FXReconciliationJob {
  constructor() {
    this.isRunning = false;
    this.interval = null;
  }

  /**
   * Start the FX reconciliation job
   * Runs every 60 minutes
   */
  start(intervalMs = 60 * 60 * 1000) {
    if (this.isRunning) {
      logger.warn("FX reconciliation job already running");
      return;
    }

    this.isRunning = true;
    logger.info("Starting FX reconciliation job", { interval: intervalMs });

    // Run immediately on startup
    this.execute().catch(error => {
      logger.error("FX reconciliation job execution error", {
        error: error.message,
        stack: error.stack
      });
    });

    // Then run on interval
    this.interval = setInterval(() => {
      this.execute().catch(error => {
        logger.error("FX reconciliation job execution error", {
          error: error.message,
          stack: error.stack
        });
      });
    }, intervalMs);
  }

  /**
   * Stop the FX reconciliation job
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.isRunning = false;
      logger.info("FX reconciliation job stopped");
    }
  }

  /**
   * Execute the reconciliation logic
   */
  async execute() {
    const startTime = Date.now();
    let processedGoals = 0;
    let reconciliationsApplied = 0;
    let staleRatesDetected = 0;

    try {
      logger.info("FX reconciliation job starting", { timestamp: new Date().toISOString() });

      // Get all tenants with FX contributions
      const tenants = await db
        .selectDistinct({ tenantId: goalContributionFxDetails.tenantId })
        .from(goalContributionFxDetails)
        .limit(100); // Process in batches per tenant

      if (tenants.length === 0) {
        logger.info("No tenants with FX contributions found");
        return;
      }

      for (const { tenantId } of tenants) {
        try {
          // 1. Detect stale FX rates (>24hr old)
          const staleRates = await db
            .select()
            .from(fxRateSnapshots)
            .where(
              sql`
                ${fxRateSnapshots.tenantId} = ${tenantId}
                AND ${fxRateSnapshots.timestamp} < NOW() - INTERVAL '24 hours'
                AND is_active = true
              `
            );

          staleRatesDetected += staleRates.length;

          if (staleRates.length > 0) {
            logger.warn("Stale FX rates detected", {
              tenantId,
              count: staleRates.length
            });
          }

          // 2. Get all goals for this tenant with FX contributions
          const goalsWithFX = await db
            .selectDistinct({ goalId: goalContributionFxDetails.goalId })
            .from(goalContributionFxDetails)
            .where(eq(goalContributionFxDetails.tenantId, tenantId));

          // 3. Reconcile each goal
          for (const { goalId } of goalsWithFX) {
            try {
              const result = await fxService.reconcileGoalForRateChange({
                goalId,
                tenantId
              });

              if (result && result.reconciliationNeeded) {
                reconciliationsApplied++;
                
                // Log reconciliation audit
                await db.insert(fxReconciliationAudit).values({
                  tenantId,
                  goalId,
                  rateChangeAmount: result.amountChange,
                  originalNormalizedAmount: result.originalAmount,
                  newNormalizedAmount: result.newAmount,
                  affectedContributions: result.contributionCount,
                  reconciliationType: 'periodic_reconciliation',
                  reason: `Periodic reconciliation detected ${staleRates.length} stale rates`,
                  appliedAt: new Date()
                });
              }

              processedGoals++;
            } catch (goalError) {
              logger.error("Error reconciling goal", {
                tenantId,
                goalId,
                error: goalError.message
              });
            }
          }
        } catch (tenantError) {
          logger.error("Error processing tenant in FX reconciliation", {
            tenantId,
            error: tenantError.message
          });
        }
      }

      const duration = Date.now() - startTime;
      logger.info("FX reconciliation job completed successfully", {
        duration: `${duration}ms`,
        processedGoals,
        reconciliationsApplied,
        staleRatesDetected,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error("FX reconciliation job failed", {
        error: error.message,
        stack: error.stack,
        duration: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Get reconciliation metrics
   */
  async getMetrics(tenantId, days = 30) {
    try {
      const audits = await db
        .select()
        .from(fxReconciliationAudit)
        .where(
          sql`
            ${fxReconciliationAudit.tenantId} = ${tenantId}
            AND ${fxReconciliationAudit.appliedAt} >= NOW() - INTERVAL '${days} days'
          `
        );

      const summary = {
        totalReconciliations: audits.length,
        totalAmountAdjusted: audits.reduce((sum, a) => sum + (a.rateChangeAmount || 0), 0),
        byType: {},
        bySeverity: {}
      };

      audits.forEach(audit => {
        summary.byType[audit.reconciliationType] = 
          (summary.byType[audit.reconciliationType] || 0) + 1;
        
        const severity = Math.abs(audit.rateChangeAmount) > 100 ? 'high' : 'low';
        summary.bySeverity[severity] = (summary.bySeverity[severity] || 0) + 1;
      });

      return {
        audits,
        summary
      };
    } catch (error) {
      logger.error("Error getting FX reconciliation metrics", {
        error: error.message
      });
      throw error;
    }
  }
}

export default new FXReconciliationJob();
