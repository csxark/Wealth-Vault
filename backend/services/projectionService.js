import db from "../config/db.js";
import { 
  projectionRebuildAudit, 
  consumerIdempotency,
  outboxSequenceNumbers 
} from "../db/schema-outbox.js";
import { eq, and, gte, lte, isNull, desc, sql } from "drizzle-orm";
import logger from "../utils/logger.js";

/**
 * ProjectionService
 * Manages replay-safe projection rebuilds and recovery from drift
 * Issue #571: Prevents analytics projection drift from event ordering violations
 */
export class ProjectionService {
  constructor() {
    this.activeRebuilds = new Map(); // Track in-progress rebuilds by key
  }

  /**
   * Start a full projection rebuild
   * Replays all events for a projection
   * WARNING: This is expensive and should be scheduled during off-peak
   */
  async startFullRebuild({
    tenantId,
    projectionName,
    initiatedBy = "manual",
  }) {
    try {
      const rebuildKey = `${tenantId}:${projectionName}:full`;

      // Prevent multiple concurrent rebuilds for same projection
      if (this.activeRebuilds.has(rebuildKey)) {
        throw new Error(
          `Full rebuild already in progress for projection: ${projectionName}`
        );
      }

      const startTime = Date.now();

      // Log rebuild operation
      const rebuild = await db
        .insert(projectionRebuildAudit)
        .values({
          tenantId,
          projectionName,
          rebuildType: "full",
          status: "in_progress",
          initiatedBy,
          initiatedAt: new Date(),
        })
        .returning();

      const rebuildId = rebuild[0].id;
      this.activeRebuilds.set(rebuildKey, { rebuildId, startTime });

      logger.info("Full projection rebuild started", {
        tenantId,
        projectionName,
        rebuildId,
        initiatedBy,
      });

      return {
        rebuildId,
        status: "in_progress",
        projectioName,
        startTime,
      };
    } catch (error) {
      logger.error("Error starting full rebuild", {
        tenantId,
        projectionName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Start a partial rebuild for specific aggregates
   * Useful for recovering from specific violation
   */
  async startPartialRebuild({
    tenantId,
    projectionName,
    aggregateId,
    aggregateType,
    initiatedBy = "manual",
  }) {
    try {
      const rebuildKey = `${tenantId}:${projectionName}:${aggregateId}`;

      if (this.activeRebuilds.has(rebuildKey)) {
        throw new Error(
          `Partial rebuild already in progress for aggregate: ${aggregateId}`
        );
      }

      const startTime = Date.now();

      // Get sequence range for this aggregate
      const seqRecord = await db
        .select()
        .from(outboxSequenceNumbers)
        .where(
          and(
            eq(outboxSequenceNumbers.tenantId, tenantId),
            eq(outboxSequenceNumbers.aggregateId, aggregateId),
            eq(outboxSequenceNumbers.aggregateType, aggregateType)
          )
        )
        .limit(1);

      const endSequence = seqRecord[0]?.currentSequence || 0;
      const startSequence = 1;

      const rebuild = await db
        .insert(projectionRebuildAudit)
        .values({
          tenantId,
          projectionName,
          rebuildType: "partial",
          scopeAggregateId: aggregateId,
          scopeAggregateType: aggregateType,
          startSequence,
          endSequence,
          status: "in_progress",
          initiatedBy,
          initiatedAt: new Date(),
        })
        .returning();

      const rebuildId = rebuild[0].id;
      this.activeRebuilds.set(rebuildKey, { rebuildId, startTime });

      logger.info("Partial projection rebuild started", {
        tenantId,
        projectionName,
        aggregateId,
        sequenceRange: [startSequence, endSequence],
        rebuildId,
        initiatedBy,
      });

      return {
        rebuildId,
        status: "in_progress",
        sequenceRange: [startSequence, endSequence],
        startTime,
      };
    } catch (error) {
      logger.error("Error starting partial rebuild", {
        tenantId,
        projectionName,
        aggregateId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Start backfill for specific sequence range
   * Fills in gap after sequence violation
   */
  async startBackfill({
    tenantId,
    projectionName,
    startSequence,
    endSequence,
    initiatedBy = "system",
  }) {
    try {
      if (startSequence > endSequence) {
        throw new Error("Invalid sequence range: start > end");
      }

      const rebuildKey = `${tenantId}:${projectionName}:backfill:${startSequence}-${endSequence}`;

      if (this.activeRebuilds.has(rebuildKey)) {
        throw new Error(
          `Backfill already in progress for range: ${startSequence}-${endSequence}`
        );
      }

      const startTime = Date.now();

      const rebuild = await db
        .insert(projectionRebuildAudit)
        .values({
          tenantId,
          projectionName,
          rebuildType: "backfill",
          startSequence,
          endSequence,
          status: "in_progress",
          initiatedBy,
          initiatedAt: new Date(),
        })
        .returning();

      const rebuildId = rebuild[0].id;
      this.activeRebuilds.set(rebuildKey, { rebuildId, startTime });

      logger.info("Backfill operation started", {
        tenantId,
        projectionName,
        sequenceRange: [startSequence, endSequence],
        rebuildId,
        initiatedBy,
      });

      return {
        rebuildId,
        status: "in_progress",
        sequenceRange: [startSequence, endSequence],
        startTime,
      };
    } catch (error) {
      logger.error("Error starting backfill", {
        tenantId,
        projectionName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Complete a rebuild operation
   * Called after events have been replayed
   */
  async completeRebuild({
    rebuildId,
    tenantId,
    eventsReplayed,
    durationMs,
  }) {
    try {
      const result = await db
        .update(projectionRebuildAudit)
        .set({
          status: "completed",
          eventsReplayed,
          durationMs,
          completedAt: new Date(),
        })
        .where(
          and(
            eq(projectionRebuildAudit.id, rebuildId),
            eq(projectionRebuildAudit.tenantId, tenantId)
          )
        )
        .returning();

      // Remove from active rebuilds
      const rebuild = result[0];
      if (rebuild) {
        const projectionName = rebuild.projectionName;
        const aggregateId = rebuild.scopeAggregateId;
        let rebuildKey;

        if (rebuild.rebuildType === "full") {
          rebuildKey = `${tenantId}:${projectionName}:full`;
        } else if (rebuild.rebuildType === "partial") {
          rebuildKey = `${tenantId}:${projectionName}:${aggregateId}`;
        } else {
          rebuildKey = `${tenantId}:${projectionName}:backfill:${rebuild.startSequence}-${rebuild.endSequence}`;
        }

        this.activeRebuilds.delete(rebuildKey);
      }

      logger.info("Rebuild operation completed", {
        tenantId,
        rebuildId,
        eventsReplayed,
        durationMs,
        status: "completed",
      });

      return rebuild;
    } catch (error) {
      logger.error("Error completing rebuild", {
        rebuildId,
        tenantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Fail a rebuild operation
   */
  async failRebuild({
    rebuildId,
    tenantId,
    errorMessage,
  }) {
    try {
      const result = await db
        .update(projectionRebuildAudit)
        .set({
          status: "failed",
          errorMessage,
          completedAt: new Date(),
        })
        .where(
          and(
            eq(projectionRebuildAudit.id, rebuildId),
            eq(projectionRebuildAudit.tenantId, tenantId)
          )
        )
        .returning();

      const rebuild = result[0];
      if (rebuild) {
        const projectionName = rebuild.projectionName;
        const aggregateId = rebuild.scopeAggregateId;
        let rebuildKey;

        if (rebuild.rebuildType === "full") {
          rebuildKey = `${tenantId}:${projectionName}:full`;
        } else if (rebuild.rebuildType === "partial") {
          rebuildKey = `${tenantId}:${projectionName}:${aggregateId}`;
        } else {
          rebuildKey = `${tenantId}:${projectionName}:backfill:${rebuild.startSequence}-${rebuild.endSequence}`;
        }

        this.activeRebuilds.delete(rebuildKey);
      }

      logger.error("Rebuild operation failed", {
        tenantId,
        rebuildId,
        errorMessage,
      });

      return rebuild;
    } catch (error) {
      logger.error("Error failing rebuild", {
        rebuildId,
        tenantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get rebuild status
   */
  async getRebuildStatus({
    rebuildId,
    tenantId,
  }) {
    try {
      const result = await db
        .select()
        .from(projectionRebuildAudit)
        .where(
          and(
            eq(projectionRebuildAudit.id, rebuildId),
            eq(projectionRebuildAudit.tenantId, tenantId)
          )
        )
        .limit(1);

      return result[0] || null;
    } catch (error) {
      logger.error("Error getting rebuild status", {
        rebuildId,
        tenantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get all active rebuilds
   */
  async getActiveRebuilds({
    tenantId,
  }) {
    try {
      const result = await db
        .select()
        .from(projectionRebuildAudit)
        .where(
          and(
            eq(projectionRebuildAudit.tenantId, tenantId),
            eq(projectionRebuildAudit.status, "in_progress")
          )
        )
        .orderBy(desc(projectionRebuildAudit.initiatedAt));

      return result;
    } catch (error) {
      logger.error("Error getting active rebuilds", {
        tenantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get rebuild history for a projection
   */
  async getRebuildHistory({
    tenantId,
    projectionName,
    limit = 20,
  }) {
    try {
      const result = await db
        .select()
        .from(projectionRebuildAudit)
        .where(
          and(
            eq(projectionRebuildAudit.tenantId, tenantId),
            eq(projectionRebuildAudit.projectionName, projectionName)
          )
        )
        .orderBy(desc(projectionRebuildAudit.initiatedAt))
        .limit(limit);

      return result;
    } catch (error) {
      logger.error("Error getting rebuild history", {
        tenantId,
        projectionName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Check if consumer has already processed event (idempotency)
   */
  async isEventProcessed({
    tenantId,
    eventId,
    consumerName,
  }) {
    try {
      const result = await db
        .select()
        .from(consumerIdempotency)
        .where(
          and(
            eq(consumerIdempotency.tenantId, tenantId),
            eq(consumerIdempotency.eventId, eventId),
            eq(consumerIdempotency.consumerName, consumerName)
          )
        )
        .limit(1);

      return {
        processed: result.length > 0,
        record: result[0] || null,
      };
    } catch (error) {
      logger.error("Error checking event processing", {
        tenantId,
        eventId,
        consumerName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get metrics for projection rebuilds
   */
  async getMetrics({
    tenantId,
    days = 7,
  }) {
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const rebuilds = await db
        .select({
          rebuildType: projectionRebuildAudit.rebuildType,
          status: projectionRebuildAudit.status,
          count: sql`COUNT(*)`.as("count"),
          avgDurationMs: sql`AVG(${projectionRebuildAudit.durationMs})`.as("avg_duration_ms"),
          avgEventsReplayed: sql`AVG(${projectionRebuildAudit.eventsReplayed})`.as("avg_events_replayed"),
        })
        .from(projectionRebuildAudit)
        .where(
          and(
            eq(projectionRebuildAudit.tenantId, tenantId),
            gte(projectionRebuildAudit.initiatedAt, cutoff)
          )
        )
        .groupBy(projectionRebuildAudit.rebuildType, projectionRebuildAudit.status);

      const activeCount = await db
        .select()
        .from(projectionRebuildAudit)
        .where(
          and(
            eq(projectionRebuildAudit.tenantId, tenantId),
            eq(projectionRebuildAudit.status, "in_progress")
          )
        );

      return {
        activeRebuilds: activeCount.length,
        rebuildsByType: rebuilds.reduce((acc, r) => {
          if (!acc[r.rebuildType]) {
            acc[r.rebuildType] = [];
          }
          acc[r.rebuildType].push({
            status: r.status,
            count: r.count,
            avgDurationMs: r.avgDurationMs,
            avgEventsReplayed: r.avgEventsReplayed,
          });
          return acc;
        }, {}),
        timeRange: {
          from: cutoff,
          to: new Date(),
          days,
        },
      };
    } catch (error) {
      logger.error("Error getting metrics", {
        tenantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get all active rebuilds across system
   */
  getActiveRebuildCount() {
    return this.activeRebuilds.size;
  }
}

export default new ProjectionService();
