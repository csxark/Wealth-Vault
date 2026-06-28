import { pgTable, bigserial, uuid, varchar, decimal, timestamp, boolean, index, check } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Soft-Delete Financial Safety Schema (Issue #572)
 * Prevents soft-deleted records from affecting totals through effective amount views
 */

// 1. Reversal transactions table
export const reversalTransactions = pgTable(
  "reversal_transactions",
  {
    id: bigserial("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    originalTransactionId: bigserial("original_transaction_id")
      .notNull()
      .references(() => ({ name: "transactions", column: "id" }), {
        onDelete: "restrict",
      }),
    reversalType: varchar("reversal_type", { length: 50 }).notNull(), // 'full_reversal', 'partial_reversal', 'correction'
    reversalAmount: decimal("reversal_amount", { precision: 19, scale: 4 }).notNull(),
    reversalDescription: varchar("reversal_description", { length: 500 }),
    reversalInitiatedBy: uuid("reversal_initiated_by"),
    reversalAt: timestamp("reversal_at", { withTimezone: true }).defaultNow(),
    ledgerRecorded: boolean("ledger_recorded").default(false),
    ledgerRecordedAt: timestamp("ledger_recorded_at", { withTimezone: true }),
  },
  (table) => ({
    idxOriginal: index("idx_reversal_original")
      .on(table.originalTransactionId),
    idxTenant: index("idx_reversal_tenant")
      .on(table.tenantId),
    idxRecorded: index("idx_reversal_recorded")
      .on(table.ledgerRecorded, table.reversalAt),
    chkValidAmount: check("valid_reversal_amount", 
      sql`${table.reversalAmount} > 0`
    ),
  })
);

// 2. Integrity audit table
export const integrityAudit = pgTable(
  "integrity_audit",
  {
    id: bigserial("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    auditType: varchar("audit_type", { length: 100 }).notNull(), // 'soft_delete_leak', 'reversal_not_recorded', 'amount_mismatch'
    entityType: varchar("entity_type", { length: 100 }),
    entityId: bigserial("entity_id"),
    categoryId: uuid("category_id"),
    reportTotal: decimal("report_total", { precision: 19, scale: 4 }),
    ledgerTotal: decimal("ledger_total", { precision: 19, scale: 4 }),
    discrepancyAmount: decimal("discrepancy_amount", { precision: 19, scale: 4 }),
    discrepancyPercent: decimal("discrepancy_percent", { precision: 5, scale: 2 }),
    affectedRecords: bigserial("affected_records"),
    severity: varchar("severity", { length: 50 }).default("medium"), // 'low', 'medium', 'high', 'critical'
    rootCause: varchar("root_cause"),
    status: varchar("status", { length: 50 }).default("detected"), // 'detected', 'investigating', 'resolved'
    detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => ({
    idxTenant: index("idx_integrity_audit_tenant")
      .on(table.tenantId),
    idxType: index("idx_integrity_audit_type")
      .on(table.auditType, table.status),
    idxSeverity: index("idx_integrity_audit_severity")
      .on(table.severity, table.detectedAt),
    chkValidDiscrepancy: check("valid_discrepancy", 
      sql`${table.discrepancyAmount} IS NULL OR ${table.discrepancyAmount} >= 0`
    ),
  })
);

// Relations
export const reversalTransactionsRelations = relations(reversalTransactions, ({ one }) => ({
  originalTransaction: one(({ name: "transactions", column: "id" }), {
    fields: [reversalTransactions.originalTransactionId],
    references: [({ name: "transactions", column: "id" })],
  }),
}));

export default {
  reversalTransactions,
  integrityAudit,
};
