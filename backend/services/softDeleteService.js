import db from "../config/db.js";
import { reversalTransactions, integrityAudit } from "../db/schema-soft-delete.js";
import { eq, and, isNull, sql, desc, gt } from "drizzle-orm";
import logger from "../utils/logger.js";

/**
 * SoftDeleteService
 * Manages soft-deletes and reversals to prevent financial data leakage
 * Issue #572: Records reversals instead of mutating originals
 */
export class SoftDeleteService {
  /**
   * Soft-delete a transaction (mark as deleted, don't remove)
   */
  async softDeleteTransaction({
    tenantId,
    transactionId,
    deletedBy,
    reason,
  }) {
    try {
      // Check if already deleted
      const existing = await db
        .select()
        .from(db.table("transactions"))
        .where(
          and(
            eq(db.table("transactions").id, transactionId),
            isNull(db.table("transactions").deletedAt)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        throw new Error("Transaction not found or already deleted");
      }

      const transaction = existing[0];

      // Perform soft delete
      await db
        .update(db.table("transactions"))
        .set({
          deletedAt: new Date(),
          deletedBy,
          deletionReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(db.table("transactions").id, transactionId));

      // Log integrity audit for audit trail
      await db.insert(integrityAudit).values({
        tenantId,
        auditType: "soft_delete_leak",
        entityType: "transaction",
        entityId: transactionId,
        categoryId: transaction.categoryId,
        discrepancyAmount: transaction.amount,
        rootCause: `Soft-delete: ${reason || "no reason provided"}`,
        severity:
          Math.abs(transaction.amount) > 1000
            ? "high"
            : Math.abs(transaction.amount) > 100
              ? "medium"
              : "low",
      });

      logger.info("Transaction soft-deleted", {
        tenantId,
        transactionId,
        amount: transaction.amount,
        deletedBy,
        reason,
      });

      return {
        success: true,
        transactionId,
        amount: transaction.amount,
        deletedAt: new Date(),
      };
    } catch (error) {
      logger.error("Error soft-deleting transaction", {
        tenantId,
        transactionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Record a reversal instead of mutating the original transaction
   * Reversals are recorded as separate entries for audit trail
   */
  async recordReversal({
    tenantId,
    originalTransactionId,
    reversalType = "full_reversal",
    reversalAmount,
    description,
    initiatedBy,
  }) {
    try {
      // Verify original transaction exists
      const original = await db
        .select()
        .from(db.table("transactions"))
        .where(eq(db.table("transactions").id, originalTransactionId))
        .limit(1);

      if (original.length === 0) {
        throw new Error("Original transaction not found");
      }

      const tx = original[0];

      // Validate reversal amount
      if (reversalAmount > Math.abs(tx.amount)) {
        throw new Error(
          `Reversal amount (${reversalAmount}) exceeds original amount (${Math.abs(tx.amount)})`
        );
      }

      // Record the reversal
      const reversal = await db
        .insert(reversalTransactions)
        .values({
          tenantId,
          originalTransactionId,
          reversalType,
          reversalAmount,
          reversalDescription: description,
          reversalInitiatedBy: initiatedBy,
          reversalAt: new Date(),
          ledgerRecorded: false,
        })
        .returning();

      logger.info("Reversal recorded", {
        tenantId,
        originalTransactionId,
        reversalId: reversal[0].id,
        reversalAmount,
        reversalType,
      });

      return {
        success: true,
        reversalId: reversal[0].id,
        originalAmount: tx.amount,
        reversalAmount,
        effectiveAmount: tx.amount - reversalAmount,
      };
    } catch (error) {
      logger.error("Error recording reversal", {
        tenantId,
        originalTransactionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get effective amount for a transaction (original - reversals)
   */
  async getEffectiveAmount({
    transactionId,
  }) {
    try {
      const result = await db.execute(
        sql`SELECT get_effective_amount(${transactionId}) AS effective_amount`
      );

      return result.rows[0]?.effectiveAmount || 0;
    } catch (error) {
      logger.error("Error getting effective amount", {
        transactionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get all soft-deleted transactions for a tenant
   */
  async getSoftDeletedItems({
    tenantId,
    categoryId,
    limit = 50,
    offset = 0,
  }) {
    try {
      let query = db
        .select()
        .from(db.table("transactions"))
        .where(
          and(
            eq(db.table("transactions").tenantId, tenantId),
            isNotNull(db.table("transactions").deletedAt)
          )
        );

      if (categoryId) {
        query = query.where(
          eq(db.table("transactions").categoryId, categoryId)
        );
      }

      const deleted = await query
        .orderBy(desc(db.table("transactions").deletedAt))
        .limit(limit)
        .offset(offset);

      return deleted;
    } catch (error) {
      logger.error("Error getting soft-deleted items", {
        tenantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get pending reversals (not yet recorded in ledger)
   */
  async getPendingReversals({
    tenantId,
    limit = 100,
  }) {
    try {
      const pending = await db
        .select()
        .from(reversalTransactions)
        .where(
          and(
            eq(reversalTransactions.tenantId, tenantId),
            eq(reversalTransactions.ledgerRecorded, false)
          )
        )
        .orderBy(reversalTransactions.reversalAt)
        .limit(limit);

      return pending;
    } catch (error) {
      logger.error("Error getting pending reversals", {
        tenantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Mark reversals as recorded in ledger
   */
  async markReversalsRecorded({
    reversalIds,
  }) {
    try {
      const updated = await db
        .update(reversalTransactions)
        .set({
          ledgerRecorded: true,
          ledgerRecordedAt: new Date(),
        })
        .where((query) => {
          return query.where(
            reversalTransactions.id.inArray(reversalIds)
          );
        })
        .returning();

      logger.info("Reversals marked as recorded", {
        count: updated.length,
        reversalIds,
      });

      return updated;
    } catch (error) {
      logger.error("Error marking reversals recorded", {
        reversalIds,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get integrity audit items
   */
  async getIntegrityIssues({
    tenantId,
    severity,
    status = "detected",
    limit = 50,
  }) {
    try {
      let query = db
        .select()
        .from(integrityAudit)
        .where(
          and(
            eq(integrityAudit.tenantId, tenantId),
            eq(integrityAudit.status, status)
          )
        );

      if (severity) {
        query = query.where(eq(integrityAudit.severity, severity));
      }

      const issues = await query
        .orderBy(desc(integrityAudit.detectedAt))
        .limit(limit);

      return issues;
    } catch (error) {
      logger.error("Error getting integrity issues", {
        tenantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Mark integrity issue as resolved
   */
  async resolveIntegrityIssue({
    tenantId,
    issueId,
    rootCause,
  }) {
    try {
      const resolved = await db
        .update(integrityAudit)
        .set({
          status: "resolved",
          resolvedAt: new Date(),
          rootCause,
        })
        .where(
          and(
            eq(integrityAudit.id, issueId),
            eq(integrityAudit.tenantId, tenantId)
          )
        )
        .returning();

      logger.info("Integrity issue resolved", {
        tenantId,
        issueId,
        rootCause,
      });

      return resolved[0];
    } catch (error) {
      logger.error("Error resolving integrity issue", {
        tenantId,
        issueId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get metrics for soft deletes and reversals
   */
  async getMetrics({
    tenantId,
    days = 7,
  }) {
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // Count soft-deleted items
      const softDeletedCount = await db
        .select({
          count: sql`COUNT(*)`.as("count"),
          totalAmount: sql`SUM(amount)`.as("total_amount"),
        })
        .from(db.table("transactions"))
        .where(
          and(
            eq(db.table("transactions").tenantId, tenantId),
            isNotNull(db.table("transactions").deletedAt),
            gt(db.table("transactions").deletedAt, cutoff)
          )
        );

      // Count pending reversals
      const pendingReversals = await db
        .select({
          count: sql`COUNT(*)`.as("count"),
          totalAmount: sql`SUM(reversal_amount)`.as("total_amount"),
        })
        .from(reversalTransactions)
        .where(
          and(
            eq(reversalTransactions.tenantId, tenantId),
            eq(reversalTransactions.ledgerRecorded, false)
          )
        );

      // Count integrity issues by type
      const integrityIssues = await db
        .select({
          auditType: integrityAudit.auditType,
          count: sql`COUNT(*)`.as("count"),
          unresolved: sql`COUNT(CASE WHEN status = 'detected' THEN 1 END)`.as(
            "unresolved"
          ),
        })
        .from(integrityAudit)
        .where(
          and(
            eq(integrityAudit.tenantId, tenantId),
            gt(integrityAudit.detectedAt, cutoff)
          )
        )
        .groupBy(integrityAudit.auditType);

      return {
        softDeletedItems: softDeletedCount[0],
        pendingReversals: pendingReversals[0],
        integrityIssues: integrityIssues.reduce((acc, v) => {
          acc[v.auditType] = {
            total: v.count,
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

  /**
   * Support for scoped query helpers to consistently exclude soft-deleted items
   */
  getActiveScopeFilter(table) {
    // Returns a filter clause for the table to exclude soft-deleted records
    return isNull(table.deletedAt);
  }
}

export default new SoftDeleteService();
