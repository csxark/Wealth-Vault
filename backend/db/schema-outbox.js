import { pgTable, bigserial, uuid, varchar, bigint, timestamp, text, boolean, index, uniqueIndex, check, array } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Outbox Event Ordering Schema (Issue #571)
 * Ensures monotonic event ordering per-aggregate and consumer-side idempotency
 */

// 1. Per-aggregate sequence number tracking
export const outboxSequenceNumbers = pgTable(
  "outbox_sequence_numbers",
  {
    id: bigserial("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    aggregateType: varchar("aggregate_type", { length: 255 }).notNull(),
    currentSequence: bigint("current_sequence", { mode: "number" }).notNull().default(0),
    lastEventId: uuid("last_event_id"),
    lastTimestamp: timestamp("last_timestamp", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueTenantAgg: uniqueIndex("unique_outbox_seq_tenant_agg")
      .on(table.tenantId, table.aggregateId, table.aggregateType),
    idxTenantAggregate: index("idx_outbox_seq_tenant_aggregate")
      .on(table.tenantId, table.aggregateId, table.aggregateType),
    idxUpdated: index("idx_outbox_seq_updated")
      .on(table.updatedAt),
    chkValidSequence: check("valid_sequence", sql`${table.currentSequence} >= 0`),
  })
);

// 2. Consumer-side idempotency tracking
export const consumerIdempotency = pgTable(
  "consumer_idempotency",
  {
    id: bigserial("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    eventId: uuid("event_id").notNull(),
    consumerName: varchar("consumer_name", { length: 255 }).notNull(),
    aggregateId: uuid("aggregate_id"),
    aggregateType: varchar("aggregate_type", { length: 255 }),
    eventSequence: bigint("event_sequence", { mode: "number" }),
    processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueConsumerEvent: uniqueIndex("unique_consumer_event")
      .on(table.tenantId, table.eventId, table.consumerName),
    idxTenant: index("idx_consumer_idempotent_tenant")
      .on(table.tenantId, table.consumerName),
    idxEvent: index("idx_consumer_idempotent_event")
      .on(table.eventId),
    idxProcessed: index("idx_consumer_idempotent_processed")
      .on(table.processedAt),
    chkValidSeq: check("valid_event_seq", 
      sql`${table.eventSequence} IS NULL OR ${table.eventSequence} >= 0`
    ),
  })
);

// 3. Event sequence violation audit
export const eventSequenceAudit = pgTable(
  "event_sequence_audit",
  {
    id: bigserial("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    aggregateType: varchar("aggregate_type", { length: 255 }).notNull(),
    violationType: varchar("violation_type", { length: 100 }).notNull(), // 'gap', 'out_of_order', 'duplicate'
    expectedSequence: bigint("expected_sequence", { mode: "number" }),
    actualSequence: bigint("actual_sequence", { mode: "number" }),
    gapSize: bigint("gap_size", { mode: "number" }),
    eventIds: array(uuid("event_ids"))
      .default(sql`'{}'`),
    affectedConsumers: array(text("affected_consumers")),
    severity: varchar("severity", { length: 50 }).default("medium"), // 'low', 'medium', 'high'
    autoBackfilled: boolean("auto_backfilled").default(false),
    detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    rootCause: text("root_cause"),
  },
  (table) => ({
    idxTenant: index("idx_event_seq_audit_tenant")
      .on(table.tenantId),
    idxViolation: index("idx_event_seq_audit_violation")
      .on(table.violationType, table.severity),
    idxDetected: index("idx_event_seq_audit_detected")
      .on(table.detectedAt),
    idxAggregate: index("idx_event_seq_audit_aggregate")
      .on(table.tenantId, table.aggregateId, table.aggregateType),
    chkValidGap: check("valid_gap_size", 
      sql`${table.gapSize} IS NULL OR ${table.gapSize} > 0`
    ),
  })
);

// 4. Projection rebuild audit trail
export const projectionRebuildAudit = pgTable(
  "projection_rebuild_audit",
  {
    id: bigserial("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    projectionName: varchar("projection_name", { length: 255 }).notNull(),
    rebuildType: varchar("rebuild_type", { length: 100 }).notNull(), // 'full', 'partial', 'backfill'
    scopeAggregateId: uuid("scope_aggregate_id"),
    scopeAggregateType: varchar("scope_aggregate_type", { length: 255 }),
    startSequence: bigint("start_sequence", { mode: "number" }),
    endSequence: bigint("end_sequence", { mode: "number" }),
    eventsReplayed: bigint("events_replayed", { mode: "number" }).default(0),
    durationMs: bigint("duration_ms", { mode: "number" }),
    status: varchar("status", { length: 50 }).default("in_progress"), // 'in_progress', 'completed', 'failed'
    errorMessage: text("error_message"),
    initiatedBy: varchar("initiated_by", { length: 255 }), // 'system', 'manual', 'auto_recovery'
    initiatedAt: timestamp("initiated_at", { withTimezone: true }).defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    idxTenant: index("idx_projection_rebuild_tenant")
      .on(table.tenantId, table.projectionName),
    idxStatus: index("idx_projection_rebuild_status")
      .on(table.status, table.initiatedAt),
    idxInitiated: index("idx_projection_rebuild_initiated")
      .on(table.initiatedAt),
    chkValidDuration: check("valid_duration", 
      sql`${table.durationMs} IS NULL OR ${table.durationMs} >= 0`
    ),
    chkValidEvents: check("valid_events_replayed", 
      sql`${table.eventsReplayed} >= 0`
    ),
  })
);

// Relations
export const outboxSequenceNumbersRelations = relations(outboxSequenceNumbers, ({ many }) => ({
  consumerIdempotencies: many(consumerIdempotency),
  sequenceViolations: many(eventSequenceAudit),
}));

export const consumerIdempotencyRelations = relations(consumerIdempotency, ({ one }) => ({
  outboxSequence: one(outboxSequenceNumbers, {
    fields: [consumerIdempotency.tenantId, consumerIdempotency.aggregateId, consumerIdempotency.aggregateType],
    references: [outboxSequenceNumbers.tenantId, outboxSequenceNumbers.aggregateId, outboxSequenceNumbers.aggregateType],
  }),
}));

export const eventSequenceAuditRelations = relations(eventSequenceAudit, ({ one }) => ({
  outboxSequence: one(outboxSequenceNumbers, {
    fields: [eventSequenceAudit.tenantId, eventSequenceAudit.aggregateId, eventSequenceAudit.aggregateType],
    references: [outboxSequenceNumbers.tenantId, outboxSequenceNumbers.aggregateId, outboxSequenceNumbers.aggregateType],
  }),
}));

export default {
  outboxSequenceNumbers,
  consumerIdempotency,
  eventSequenceAudit,
  projectionRebuildAudit,
};
