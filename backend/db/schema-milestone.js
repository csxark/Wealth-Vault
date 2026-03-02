import { pgTable, bigserial, uuid, varchar, bigint, decimal, timestamp, text, boolean, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Milestone Race Condition Prevention Schema (Issue #573)
 * Prevents duplicate/missed milestone triggers through transactional locking
 */

// 1. Goal milestones definitions
export const goalMilestones = pgTable(
  "goal_milestones",
  {
    id: bigserial("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    goalId: bigserial("goal_id")
      .notNull()
      .references(() => ({ name: "goals", column: "id" }), {
        onDelete: "cascade",
      }),
    milestoneName: varchar("milestone_name", { length: 255 }).notNull(),
    thresholdCents: bigint("threshold_cents", { mode: "number" }).notNull(),
    thresholdPercent: decimal("threshold_percent", { precision: 5, scale: 2 }),
    rewardMessage: text("reward_message"),
    icon: varchar("icon", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    idxGoal: index("idx_goal_milestones_goal").on(table.goalId),
    idxTenant: index("idx_goal_milestones_tenant").on(table.tenantId),
    chkValidThresholdCents: check("valid_threshold_cents", 
      sql`${table.thresholdCents} >= 0`
    ),
    chkValidThresholdPercent: check("valid_threshold_percent",
      sql`${table.thresholdPercent} >= 0 AND ${table.thresholdPercent} <= 100`
    ),
  })
);

// 2. Milestone trigger ledger (prevents duplicates)
export const milestoneTriggerLedger = pgTable(
  "milestone_trigger_ledger",
  {
    id: bigserial("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    goalId: bigserial("goal_id")
      .notNull()
      .references(() => ({ name: "goals", column: "id" }), {
        onDelete: "cascade",
      }),
    milestoneId: bigserial("milestone_id")
      .notNull()
      .references(() => goalMilestones.id, {
        onDelete: "cascade",
      }),
    triggeredAt: timestamp("triggered_at", { withTimezone: true }).defaultNow(),
    triggeredByContributionId: bigint("triggered_by_contribution_id", { mode: "number" }),
    progressBeforeCents: bigint("progress_before_cents", { mode: "number" }).notNull(),
    progressAfterCents: bigint("progress_after_cents", { mode: "number" }).notNull(),
    thresholdCrossedCents: bigint("threshold_crossed_cents", { mode: "number" }).notNull(),
    targetAmountCents: bigint("target_amount_cents", { mode: "number" }).notNull(),
    isDuplicate: boolean("is_duplicate").default(false),
    reconciliationBackfilled: boolean("reconciliation_backfilled").default(false),
  },
  (table) => ({
    uniqueTrigger: uniqueIndex("unique_milestone_trigger")
      .on(table.tenantId, table.goalId, table.milestoneId),
    idxGoal: index("idx_milestone_trigger_goal").on(table.goalId),
    idxTenant: index("idx_milestone_trigger_tenant").on(table.tenantId),
    idxTime: index("idx_milestone_trigger_time").on(table.triggeredAt),
    idxBackfilled: index("idx_milestone_trigger_backfilled")
      .on(table.reconciliationBackfilled, table.triggeredAt),
    chkValidProgress: check("valid_progress",
      sql`${table.progressBeforeCents} >= 0 AND ${table.progressAfterCents} >= 0 AND ${table.progressAfterCents} > ${table.progressBeforeCents}`
    ),
  })
);

// 3. Missed milestone detection audit
export const milestoneMissedAudit = pgTable(
  "milestone_missed_audit",
  {
    id: bigserial("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    goalId: bigint("goal_id", { mode: "number" }).notNull(),
    milestoneId: bigint("milestone_id", { mode: "number" }).notNull(),
    expectedTriggerAmountCents: bigint("expected_trigger_amount_cents", { mode: "number" }),
    currentProgressCents: bigint("current_progress_cents", { mode: "number" }),
    detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow(),
    backfilledAt: timestamp("backfilled_at", { withTimezone: true }),
    backfillTriggerId: bigint("backfill_trigger_id", { mode: "number" })
      .references(() => milestoneTriggerLedger.id),
    severity: varchar("severity", { length: 50 }).default("medium"),
  },
  (table) => ({
    idxTenant: index("idx_missed_milestone_tenant").on(table.tenantId),
    idxDetected: index("idx_missed_milestone_detected").on(table.detectedAt),
    idxBackfilled: index("idx_missed_milestone_backfilled").on(table.backfilledAt),
    chkValidMissed: check("valid_missed_amounts",
      sql`${table.currentProgressCents} >= ${table.expectedTriggerAmountCents}`
    ),
  })
);

// 4. Goal progress snapshots (for concurrent update protection)
export const goalProgressSnapshots = pgTable(
  "goal_progress_snapshots",
  {
    id: bigserial("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    goalId: bigserial("goal_id")
      .notNull()
      .references(() => ({ name: "goals", column: "id" }), {
        onDelete: "cascade",
      }),
    snapshotTime: timestamp("snapshot_time", { withTimezone: true }).defaultNow(),
    progressCents: bigint("progress_cents", { mode: "number" }).notNull(),
    targetCents: bigint("target_cents", { mode: "number" }).notNull(),
    contributionCount: bigint("contribution_count", { mode: "number" }).default(0),
    lastContributionId: bigint("last_contribution_id", { mode: "number" }),
    version: bigint("version", { mode: "number" }).notNull().default(1),
  },
  (table) => ({
    idxGoal: index("idx_goal_progress_snapshot_goal")
      .on(table.goalId, table.snapshotTime),
    idxTenant: index("idx_goal_progress_snapshot_tenant").on(table.tenantId),
    chkValidSnapshot: check("valid_snapshot_amounts",
      sql`${table.progressCents} >= 0 AND ${table.targetCents} > 0`
    ),
  })
);

// Relations
export const goalMilestonesRelations = relations(goalMilestones, ({ many, one }) => ({
  triggers: many(milestoneTriggerLedger),
  missedAudits: many(milestoneMissedAudit),
}));

export const milestoneTriggerLedgerRelations = relations(milestoneTriggerLedger, ({ one }) => ({
  milestone: one(goalMilestones, {
    fields: [milestoneTriggerLedger.milestoneId],
    references: [goalMilestones.id],
  }),
}));

export const milestoneMissedAuditRelations = relations(milestoneMissedAudit, ({ one }) => ({
  milestone: one(goalMilestones, {
    fields: [milestoneMissedAudit.milestoneId],
    references: [goalMilestones.id],
  }),
  backfillTrigger: one(milestoneTriggerLedger, {
    fields: [milestoneMissedAudit.backfillTriggerId],
    references: [milestoneTriggerLedger.id],
  }),
}));

export default {
  goalMilestones,
  milestoneTriggerLedger,
  milestoneMissedAudit,
  goalProgressSnapshots,
};
