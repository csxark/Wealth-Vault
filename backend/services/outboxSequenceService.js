import db from "../config/db.js";
import { 
  outboxSequenceNumbers, 
  consumerIdempotency, 
  eventSequenceAudit 
} from "../db/schema-outbox.js";
import { eq, and, gt, sql, desc, isNull } from "drizzle-orm";
import logger from "../utils/logger.js";

/**
 * OutboxSequenceService
 * Manages per-aggregate monotonic ordering and consumer-side idempotency
 * Issue #571: Prevents projection drift from out-of-order or duplicate events
 */
export class OutboxSequenceService {
  /**
   * Assign sequence number to event for an aggregate
   * Ensures monotonic ordering
   */
  async assignEventSequence({
    tenantId,
    aggregateId,
    aggregateType,
    eventId,
  }) {
    try {
      // Ensure sequence record exists for this aggregate
      await db
        .insert(outboxSequenceNumbers)
        .values({
          tenantId,
          aggregateId,
          aggregateType,
          currentSequence: 0,
        })
        .onConflictDoNothing();

      // Atomically increment sequence counter
      const result = await db
        .update(outboxSequenceNumbers)
        .set({
          currentSequence: sql`${outboxSequenceNumbers.currentSequence} + 1`,
          lastEventId: eventId,
          lastTimestamp: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(outboxSequenceNumbers.tenantId, tenantId),
            eq(outboxSequenceNumbers.aggregateId, aggregateId),
            eq(outboxSequenceNumbers.aggregateType, aggregateType)
          )
        )
        .returning();

      const sequence = result[0]?.currentSequence;

      logger.debug("Event sequence assigned", {
        tenantId,
        aggregateId,
        aggregateType,
        eventId,
        sequence,
      });

      return sequence;
    } catch (error) {
      logger.error("Error assigning event sequence", {
        tenantId,
        aggregateId,
        aggregateType,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Detect sequence violations (gaps, out-of-order, duplicates)
   */
  async detectViolation({
    tenantId,
    aggregateId,
    aggregateType,
    eventSequence,
  }) {
    try {
      const sequence = await db
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

      if (sequence.length === 0) {
        // First event for this aggregate
        return {
          violated: false,
          violationType: null,
          expectedSequence: 1,
          actualSequence: eventSequence,
      
          gapSize: eventSequence > 1 ? eventSequence - 1 : 0,
        };
      }

      const currentSeq = sequence[0].currentSequence;
      const expectedNext = currentSeq + 1;

      if (eventSequence > expectedNext) {
        // Gap detected
        return {
          violated: true,
          violationType: "gap",
          expectedSequence: expectedNext,
          actualSequence: eventSequence,
          gapSize: eventSequence - expectedNext,
        };
      }

      if (eventSequence <= currentSeq) {
        // Out of order or duplicate
        return {
          violated: true,
          violationType: eventSequence === currentSeq ? "duplicate" : "out_of_order",
          expectedSequence: expectedNext,
          actualSequence: eventSequence,
          gapSize: 0,
        };
      }

      // Sequence is valid (monotonic)
      return {
        violated: false,
        violationType: null,
        expectedSequence: expectedNext,
        actualSequence: eventSequence,
        gapSize: 0,
      };
    } catch (error) {
      logger.error("Error detecting sequence violation", {
        tenantId,
        aggregateId,
        aggregateType,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Record event processing by consumer for idempotency
   */
  async recordConsumerProcessing({
    tenantId,
    eventId,
    consumerName,
    aggregateId,
    aggregateType,
    eventSequence,
  }) {
    try {
      // Check if already processed
      const existing = await db
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

      if (existing.length > 0) {
        logger.warn("Event already processed by consumer", {
          tenantId,
          eventId,
          consumerName,
          previousTime: existing[0].processedAt,
        });
        return {
          isDuplicate: true,
          alreadyProcessed: existing[0],
        };
      }

      // Record this processing
      await db.insert(consumerIdempotency).values({
        tenantId,
        eventId,
        consumerName,
        aggregateId,
        aggregateType,
        eventSequence,
        processedAt: new Date(),
      });

      logger.debug("Consumer processing recorded", {
        tenantId,
        eventId,
        consumerName,
        eventSequence,
      });

      return {
        isDuplicate: false,
        recorded: true,
      };
    } catch (error) {
      logger.error("Error recording consumer processing", {
        tenantId,
        eventId,
        consumerName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Log sequence violation and alert
   */
  async logViolation({
    tenantId,
    aggregateId,
    aggregateType,
    violationType,
    expectedSequence,
    actualSequence,
    gapSize,
    eventIds,
    affectedConsumers,
    autoBackfilled = false,
    rootCause,
  }) {
    try {
      // Determine severity
      let severity = "low";
      if (violationType === "gap" && gapSize > 10) severity = "high";
      if (violationType === "duplicate" && affectedConsumers?.length > 5)
        severity = "high";
      if (violationType === "out_of_order") severity = "medium";

      const violation = await db
        .insert(eventSequenceAudit)
        .values({
          tenantId,
          aggregateId,
          aggregateType,
          violationType,
          expectedSequence,
          actualSequence,
          gapSize: gapSize || null,
          eventIds: eventIds || [],
          affectedConsumers: affectedConsumers || [],
          severity,
          autoBackfilled,
          detectedAt: new Date(),
          rootCause,
        })
        .returning();

      logger.warn("Event sequence violation logged", {
        tenantId,
        aggregateId,
        aggregateType,
        violationType,
        severity,
        gapSize,
        autoBackfilled,
      });

      return violation[0];
    } catch (error) {
      logger.error("Error logging violation", {
        tenantId,
        aggregateId,
        aggregateType,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Detect and report sequence gaps
   */
  async detectSequenceGaps({
    tenantId,
    lookbackDays = 1,
  }) {
    try {
      const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

      const gaps = await db
        .select()
        .from(eventSequenceAudit)
        .where(
          and(
            eq(eventSequenceAudit.tenantId, tenantId),
            eq(eventSequenceAudit.violationType, "gap"),
            gt(eventSequenceAudit.detectedAt, cutoff),
            isNull(eventSequenceAudit.resolvedAt)
          )
        );

      return {
        gapCount: gaps.length,
        gaps,
        summary: {
          totalGaps: gaps.length,
          largestGap: Math.max(...gaps.map((g) => g.gapSize || 0)),
          affectedAggregates: new Set(gaps.map((g) => g.aggregateId)).size,
        },
      };
    } catch (error) {
      logger.error("Error detecting sequence gaps", {
        tenantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get consumer processing status and lag
   */
  async getConsumerStatus({
    tenantId,
    consumerName,
  }) {
    try {
      const result = await db
        .select({
          consumerName: consumerIdempotency.consumerName,
          eventsProcessed: sql`COUNT(*)`.as("events_processed"),
          aggregatesTouched: sql`COUNT(DISTINCT ${consumerIdempotency.aggregateId})`.as("aggregates_touched"),
          lastProcessed: sql`MAX(${consumerIdempotency.processedAt})`.as("last_processed"),
          minSequence: sql`MIN(${consumerIdempotency.eventSequence})`.as("min_sequence"),
          maxSequence: sql`MAX(${consumerIdempotency.eventSequence})`.as("max_sequence"),
        })
        .from(consumerIdempotency)
        .where(
          and(
            eq(consumerIdempotency.tenantId, tenantId),
            eq(consumerIdempotency.consumerName, consumerName)
          )
        )
        .limit(1);

      return result[0] || null;
    } catch (error) {
      logger.error("Error getting consumer status", {
        tenantId,
        consumerName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get all unresolved violations
   */
  async getUnresolvedViolations({
    tenantId,
    severity,
  }) {
    try {
      let query = db
        .select()
        .from(eventSequenceAudit)
        .where(
          and(
            eq(eventSequenceAudit.tenantId, tenantId),
            isNull(eventSequenceAudit.resolvedAt)
          )
        );

      if (severity) {
        query = query.where(
          eq(eventSequenceAudit.severity, severity)
        );
      }

      const violations = await query
        .orderBy(desc(eventSequenceAudit.detectedAt))
        .limit(100);

      return violations;
    } catch (error) {
      logger.error("Error getting unresolved violations", {
        tenantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Mark violation as resolved
   */
  async resolveViolation({
    tenantId,
    violationId,
    rootCause,
  }) {
    try {
      const result = await db
        .update(eventSequenceAudit)
        .set({
          resolvedAt: new Date(),
          rootCause,
        })
        .where(
          and(
            eq(eventSequenceAudit.id, violationId),
            eq(eventSequenceAudit.tenantId, tenantId)
          )
        )
        .returning();

      logger.info("Violation resolved", {
        tenantId,
        violationId,
        rootCause,
      });

      return result[0];
    } catch (error) {
      logger.error("Error resolving violation", {
        tenantId,
        violationId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get metrics for outbox processing
   */
  async getMetrics({
    tenantId,
    days = 7,
  }) {
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const aggregateCount = await db
        .select({
          count: sql`COUNT(*)`.as("count"),
        })
        .from(outboxSequenceNumbers)
        .where(eq(outboxSequenceNumbers.tenantId, tenantId));

      const violations = await db
        .select({
          violationType: eventSequenceAudit.violationType,
          count: sql`COUNT(*)`.as("count"),
          unresolved: sql`SUM(CASE WHEN ${eventSequenceAudit.resolvedAt} IS NULL THEN 1 ELSE 0 END)`.as("unresolved"),
        })
        .from(eventSequenceAudit)
        .where(
          and(
            eq(eventSequenceAudit.tenantId, tenantId),
            gt(eventSequenceAudit.detectedAt, cutoff)
          )
        )
        .groupBy(eventSequenceAudit.violationType);

      const consumerCount = await db
        .select({
          count: sql`COUNT(DISTINCT ${consumerIdempotency.consumerName})`.as("count"),
        })
        .from(consumerIdempotency)
        .where(eq(consumerIdempotency.tenantId, tenantId));

      return {
        aggregateCount: aggregateCount[0]?.count || 0,
        consumerCount: consumerCount[0]?.count || 0,
        violations: violations.reduce((acc, v) => {
          acc[v.violationType] = {
            count: v.count,
            unresolved: v.unresolved,
          };
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
}

export default new OutboxSequenceService();
