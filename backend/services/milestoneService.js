import db from "../config/db.js";
import { 
  goalMilestones, 
  milestoneTriggerLedger,
  milestoneMissedAudit,
  goalProgressSnapshots
} from "../db/schema-milestone.js";
import { eq, and, sql, isNull, desc } from "drizzle-orm";
import logger from "../utils/logger.js";

/**
 * MilestoneService
 * Manages goal milestone evaluation with transactional locking
 * Issue #573: Prevents duplicate/missed milestone triggers during concurrent updates
 */
export class MilestoneService {
  /**
   * Convert dollar amount to cents deterministically
   */
  dollarsToCents(dollarAmount) {
    return Math.floor(dollarAmount * 100);
  }

  /**
   * Evaluate milestone crossing with row-level locking
   * Uses SELECT FOR UPDATE to prevent race conditions
   */
  async evaluateMilestoneCrossing({
    tenantId,
    goalId,
    progressBeforeDollars,
    progressAfterDollars,
    targetAmountDollars,
    contributionId,
  }) {
    try {
      const progressBeforeCents = this.dollarsToCents(progressBeforeDollars);
      const progressAfterCents = this.dollarsToCents(progressAfterDollars);
      const targetCents = this.dollarsToCents(targetAmountDollars);

      logger.debug("Evaluating milestone crossing", {
        tenantId,
        goalId,
        progressBeforeCents,
        progressAfterCents,
        contributionId,
      });

      // Get all milestones for this goal
      const milestones = await db
        .select()
        .from(goalMilestones)
        .where(
          and(
            eq(goalMilestones.tenantId, tenantId),
            eq(goalMilestones.goalId, goalId)
          )
        );

      if (milestones.length === 0) {
        logger.debug("No milestones defined for goal", { goalId });
        return {
          triggered: [],
          skipped: [],
        };
      }

      const triggered = [];
      const skipped = [];

      // Evaluate each milestone within a transaction
      for (const milestone of milestones) {
        try {
          // Use PostgreSQL function for atomic evaluation
          const result = await db.execute(
            sql`SELECT * FROM evaluate_milestone_crossing(
              ${tenantId}::uuid,
              ${goalId}::bigint,
              ${milestone.id}::bigint,
              ${progressBeforeCents}::bigint,
              ${progressAfterCents}::bigint,
              ${contributionId}::bigint
            )`
          );

          const evaluation = result.rows[0];

          if (evaluation.crossed && !evaluation.is_duplicate) {
            // Milestone crossed - record it atomically
            const triggerId = await this.recordMilestoneTrigger({
              tenantId,
              goalId,
              milestoneId: milestone.id,
              progressBeforeCents,
              progressAfterCents,
              thresholdCents: evaluation.threshold_cents,
              targetCents,
              contributionId,
            });

            if (triggerId) {
              triggered.push({
                milestoneId: milestone.id,
                milestoneName: milestone.milestoneName,
                triggerId,
                thresholdCents: evaluation.threshold_cents,
                rewardMessage: milestone.rewardMessage,
              });

              logger.info("Milestone triggered", {
                tenantId,
                goalId,
                milestoneId: milestone.id,
                triggerId,
              });
            }
          } else if (evaluation.crossed && evaluation.is_duplicate) {
            skipped.push({
              milestoneId: milestone.id,
              reason: "already_triggered",
              thresholdCents: evaluation.threshold_cents,
            });

            logger.warn("Duplicate milestone trigger prevented", {
              tenantId,
              goalId,
              milestoneId: milestone.id,
            });
          }
        } catch (error) {
          logger.error("Error evaluating milestone", {
            tenantId,
            goalId,
            milestoneId: milestone.id,
            error: error.message,
          });
        }
      }

      return {
        triggered,
        skipped,
        evaluatedCount: milestones.length,
      };
    } catch (error) {
      logger.error("Error evaluating milestone crossing", {
        tenantId,
        goalId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Record milestone trigger atomically
   * Protected by UNIQUE constraint
   */
  async recordMilestoneTrigger({
    tenantId,
    goalId,
    milestoneId,
    progressBeforeCents,
    progressAfterCents,
    thresholdCents,
    targetCents,
    contributionId,
  }) {
    try {
      const result = await db.execute(
        sql`SELECT record_milestone_trigger(
          ${tenantId}::uuid,
          ${goalId}::bigint,
          ${milestoneId}::bigint,
          ${progressBeforeCents}::bigint,
          ${progressAfterCents}::bigint,
          ${thresholdCents}::bigint,
          ${targetCents}::bigint,
          ${contributionId}::bigint
        ) AS trigger_id`
      );

      return result.rows[0]?.trigger_id || null;
    } catch (error) {
      logger.error("Error recording milestone trigger", {
        tenantId,
        goalId,
        milestoneId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Detect missed milestones for a goal
   */
  async detectMissedMilestones({
    tenantId,
    goalId,
    currentProgressDollars,
  }) {
    try {
      const currentProgressCents = this.dollarsToCents(currentProgressDollars);

      const result = await db.execute(
        sql`SELECT * FROM detect_missed_milestones(
          ${tenantId}::uuid,
          ${goalId}::bigint,
          ${currentProgressCents}::bigint
        )`
      );

      const missed = result.rows.filter((r) => r.should_have_triggered);

      if (missed.length > 0) {
        logger.warn("Missed milestones detected", {
          tenantId,
          goalId,
          missedCount: missed.length,
          currentProgressCents,
        });

        // Log to audit table
        for (const milestone of missed) {
          await db.insert(milestoneMissedAudit).values({
            tenantId,
            goalId,
            milestoneId: milestone.milestone_id,
            expectedTriggerAmountCents: milestone.threshold_cents,
            currentProgressCents,
            detectedAt: new Date(),
            severity:
              currentProgressCents - milestone.threshold_cents > 10000
                ? "high"
                : "medium",
          }).onConflictDoNothing();
        }
      }

      return {
        missedCount: missed.length,
        milestones: missed,
      };
    } catch (error) {
      logger.error("Error detecting missed milestones", {
        tenantId,
        goalId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Backfill missed milestones
   */
  async backfillMissedMilestone({
    tenantId,
    goalId,
    milestoneId,
    currentProgressCents,
    targetCents,
  }) {
    try {
      // Get milestone details
      const milestone = await db
        .select()
        .from(goalMilestones)
        .where(eq(goalMilestones.id, milestoneId))
        .limit(1);

      if (milestone.length === 0) {
        throw new Error("Milestone not found");
      }

      const thresholdCents = milestone[0].thresholdCents;

      // Record backfilled trigger
      const result = await db
        .insert(milestoneTriggerLedger)
        .values({
          tenantId,
          goalId,
          milestoneId,
          triggeredAt: new Date(),
          triggeredByContributionId: null,
          progressBeforeCents: thresholdCents - 1, // Simulate crossing
          progressAfterCents: currentProgressCents,
          thresholdCrossedCents: thresholdCents,
          targetAmountCents: targetCents,
          isDuplicate: false,
          reconciliationBackfilled: true,
        })
        .onConflictDoNothing()
        .returning();

      if (result.length > 0) {
        const triggerId = result[0].id;

        // Update missed audit record
        await db
          .update(milestoneMissedAudit)
          .set({
            backfilledAt: new Date(),
            backfillTriggerId: triggerId,
          })
          .where(
            and(
              eq(milestoneMissedAudit.tenantId, tenantId),
              eq(milestoneMissedAudit.goalId, goalId),
              eq(milestoneMissedAudit.milestoneId, milestoneId),
              isNull(milestoneMissedAudit.backfilledAt)
            )
          );

        logger.info("Milestone backfilled", {
          tenantId,
          goalId,
          milestoneId,
          triggerId,
        });

        return {
          success: true,
          triggerId,
          milestoneName: milestone[0].milestoneName,
        };
      }

      return {
        success: false,
        reason: "already_backfilled",
      };
    } catch (error) {
      logger.error("Error backfilling milestone", {
        tenantId,
        goalId,
        milestoneId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get milestone status for a goal
   */
  async getMilestoneStatus({
    tenantId,
    goalId,
  }) {
    try {
      const milestones = await db
        .select({
          milestoneId: goalMilestones.id,
          milestoneName: goalMilestones.milestoneName,
          thresholdCents: goalMilestones.thresholdCents,
          thresholdPercent: goalMilestones.thresholdPercent,
          rewardMessage: goalMilestones.rewardMessage,
          triggered: sql`CASE WHEN ${milestoneTriggerLedger.id} IS NOT NULL THEN true ELSE false END`.as("triggered"),
          triggeredAt: milestoneTriggerLedger.triggeredAt,
          isBackfilled: milestoneTriggerLedger.reconciliationBackfilled,
        })
        .from(goalMilestones)
        .leftJoin(
          milestoneTriggerLedger,
          and(
            eq(milestoneTriggerLedger.milestoneId, goalMilestones.id),
            eq(milestoneTriggerLedger.goalId, goalId)
          )
        )
        .where(
          and(
            eq(goalMilestones.tenantId, tenantId),
            eq(goalMilestones.goalId, goalId)
          )
        )
        .orderBy(goalMilestones.thresholdCents);

      return milestones;
    } catch (error) {
      logger.error("Error getting milestone status", {
        tenantId,
        goalId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get triggered milestones for a goal
   */
  async getTriggeredMilestones({
    tenantId,
    goalId,
  }) {
    try {
      const triggered = await db
        .select()
        .from(milestoneTriggerLedger)
        .where(
          and(
            eq(milestoneTriggerLedger.tenantId, tenantId),
            eq(milestoneTriggerLedger.goalId, goalId)
          )
        )
        .orderBy(desc(milestoneTriggerLedger.triggeredAt));

      return triggered;
    } catch (error) {
      logger.error("Error getting triggered milestones", {
        tenantId,
        goalId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get missed milestones for tenant
   */
  async getMissedMilestones({
    tenantId,
    pendingOnly = false,
  }) {
    try {
      const conditions = [eq(milestoneMissedAudit.tenantId, tenantId)];

      if (pendingOnly) {
        conditions.push(isNull(milestoneMissedAudit.backfilledAt));
      }

      const missed = await db
        .select()
        .from(milestoneMissedAudit)
        .where(and(...conditions))
        .orderBy(desc(milestoneMissedAudit.detectedAt));

      return missed;
    } catch (error) {
      logger.error("Error getting missed milestones", {
        tenantId,
        pendingOnly,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get milestone metrics for tenant
   */
  async getMetrics({
    tenantId,
    days = 7,
  }) {
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const triggeredCount = await db
        .select({
          count: sql`COUNT(*)`.as("count"),
          backfilled: sql`COUNT(CASE WHEN ${milestoneTriggerLedger.reconciliationBackfilled} THEN 1 END)`.as(
            "backfilled"
          ),
        })
        .from(milestoneTriggerLedger)
        .where(
          and(
            eq(milestoneTriggerLedger.tenantId, tenantId),
            sql`${milestoneTriggerLedger.triggeredAt} >= ${cutoff}`
          )
        );

      const missedCount = await db
        .select({
          count: sql`COUNT(*)`.as("count"),
          pending: sql`COUNT(CASE WHEN ${milestoneMissedAudit.backfilledAt} IS NULL THEN 1 END)`.as(
            "pending"
          ),
        })
        .from(milestoneMissedAudit)
        .where(
          and(
            eq(milestoneMissedAudit.tenantId, tenantId),
            sql`${milestoneMissedAudit.detectedAt} >= ${cutoff}`
          )
        );

      const goalCount = await db
        .select({
          count: sql`COUNT(DISTINCT ${goalMilestones.goalId})`.as("count"),
        })
        .from(goalMilestones)
        .where(eq(goalMilestones.tenantId, tenantId));

      return {
        triggered: triggeredCount[0],
        missed: missedCount[0],
        goalsWithMilestones: goalCount[0]?.count || 0,
        timeRange: {
          from: cutoff,
          to: new Date(),
          days,
        },
      };
    } catch (error) {
      logger.error("Error getting milestone metrics", {
        tenantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Create milestone for a goal
   */
  async createMilestone({
    tenantId,
    goalId,
    milestoneName,
    thresholdPercent,
    targetAmountDollars,
    rewardMessage,
    icon,
  }) {
    try {
      const thresholdCents = Math.floor(
        (thresholdPercent / 100) * this.dollarsToCents(targetAmountDollars)
      );

      const milestone = await db
        .insert(goalMilestones)
        .values({
          tenantId,
          goalId,
          milestoneName,
          thresholdCents,
          thresholdPercent,
          rewardMessage,
          icon,
        })
        .returning();

      logger.info("Milestone created", {
        tenantId,
        goalId,
        milestoneId: milestone[0].id,
        thresholdPercent,
      });

      return milestone[0];
    } catch (error) {
      logger.error("Error creating milestone", {
        tenantId,
        goalId,
        error: error.message,
      });
      throw error;
    }
  }
}

export default new MilestoneService();
