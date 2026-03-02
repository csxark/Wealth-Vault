import db from "../config/db.js";
import { reversalTransactions, integrityAudit } from "../db/schema-soft-delete.js";
import { eq, and, sql, isNull, desc } from "drizzle-orm";
import logger from "../utils/logger.js";

/**
 * IntegrityService
 * Validates financial data consistency: reports vs ledger, soft-delete leakage, etc.
 * Issue #572: Detects and alerts on integrity violations
 */
export class IntegrityService {
  /**
   * Check integrity for a specific category
   * Compare report totals to ledger (effective amounts)
   */
  async checkCategoryIntegrity({
    tenantId,
    categoryId,
  }) {
    try {
      // Run the PostgreSQL integrity check function
      const result = await db.execute(
        sql`SELECT * FROM check_category_integrity(${tenantId}, ${categoryId})`
      );

      const integrity = result.rows[0];

      return {
        isHealthy: !integrity.discrepanciesFound,
        softDeleteLeakAmount: integrity.softDeleteLeakAmount,
        reversalNotRecordedCount: integrity.reversalNotRecordedCount,
        totalAffectedRecords: integrity.totalAffectedRecords,
        severity:
          integrity.softDeleteLeakAmount > 10000 ||
          integrity.reversalNotRecordedCount > 50
            ? "critical"
            : integrity.softDeleteLeakAmount > 1000 ||
                integrity.reversalNotRecordedCount > 10
              ? "high"
              : "medium",
      };
    } catch (error) {
      logger.error("Error checking category integrity", {
        tenantId,
        categoryId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Detect all soft-delete leakage across tenant
   */
  async detectSoftDeleteLeakage({
    tenantId,
  }) {
    try {
      const leaked = await db
        .select({
          categoryId: sql`category_id`.as("category_id"),
          categoryName: sql`(SELECT name FROM categories WHERE id = category_id)`.as(
            "category_name"
          ),
          leakedAmount: sql`SUM(amount)`.as("leaked_amount"),
          leakedCount: sql`COUNT(*)`.as("leaked_count"),
          oldestDeletedAt: sql`MIN(deleted_at)`.as("oldest_deleted_at"),
        })
        .from(db.table("transactions"))
        .where(
          and(
            eq(db.table("transactions").tenantId, tenantId),
            isNull(db.table("transactions").deletedAt) === false
          )
        )
        .groupBy(sql`category_id`)
        .orderBy(sql`leaked_amount DESC`);

      // Create audit records for each leakage
      for (const leak of leaked) {
        const existing = await db
          .select()
          .from(integrityAudit)
          .where(
            and(
              eq(integrityAudit.tenantId, tenantId),
              eq(integrityAudit.auditType, "soft_delete_leak"),
              eq(integrityAudit.categoryId, leak.categoryId),
              eq(integrityAudit.status, "detected")
            )
          )
          .limit(1);

        if (existing.length === 0) {
          await db.insert(integrityAudit).values({
            tenantId,
            auditType: "soft_delete_leak",
            categoryId: leak.categoryId,
            discrepancyAmount: leak.leakedAmount,
            affectedRecords: leak.leakedCount,
            severity:
              leak.leakedAmount > 10000
                ? "critical"
                : leak.leakedAmount > 1000
                  ? "high"
                  : "medium",
            rootCause: `Soft-deleted records still affecting category totals (${leak.leakedCount} items)`,
          });
        }
      }

      logger.info("Soft-delete leakage detected", {
        tenantId,
        affectedCategories: leaked.length,
        totalLeakedAmount: leaked.reduce((sum, l) => sum + l.leakedAmount, 0),
      });

      return {
        leakageFound: leaked.length > 0,
        leaks: leaked,
        summary: {
          affectedCategories: leaked.length,
          totalLeakedAmount: leaked.reduce((sum, l) => sum + l.leakedAmount, 0),
          totalLeakedCount: leaked.reduce(
            (sum, l) => sum + l.leakedCount,
            0
          ),
        },
      };
    } catch (error) {
      logger.error("Error detecting soft-delete leakage", {
        tenantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Detect reversals not recorded in ledger
   */
  async detectUnrecordedReversals({
    tenantId,
  }) {
    try {
      const unrecorded = await db
        .select({
          reversalCount: sql`COUNT(*)`.as("reversal_count"),
          totalAmount: sql`SUM(reversal_amount)`.as("total_amount"),
          oldestReversal: sql`MIN(reversal_at)`.as("oldest_reversal"),
          byType: sql`ARRAY_AGG(DISTINCT reversal_type)`.as("by_type"),
        })
        .from(reversalTransactions)
        .where(
          and(
            eq(reversalTransactions.tenantId, tenantId),
            eq(reversalTransactions.ledgerRecorded, false)
          )
        );

      const unrec = unrecorded[0];

      if (unrec && unrec.reversalCount > 0) {
        // Create audit record if not already exists
        const existing = await db
          .select()
          .from(integrityAudit)
          .where(
            and(
              eq(integrityAudit.tenantId, tenantId),
              eq(integrityAudit.auditType, "reversal_not_recorded"),
              eq(integrityAudit.status, "detected")
            )
          )
          .limit(1);

        if (existing.length === 0) {
          await db.insert(integrityAudit).values({
            tenantId,
            auditType: "reversal_not_recorded",
            discrepancyAmount: unrec.totalAmount,
            affectedRecords: unrec.reversalCount,
            severity:
              unrec.reversalCount > 50
                ? "critical"
                : unrec.reversalCount > 10
                  ? "high"
                  : "medium",
            rootCause: `${unrec.reversalCount} reversals pending ledger recording`,
          });
        }

        logger.warn("Unrecorded reversals detected", {
          tenantId,
          count: unrec.reversalCount,
          totalAmount: unrec.totalAmount,
        });

        return {
          found: true,
          unrecordedReversals: unrec,
        };
      }

      return {
        found: false,
        unrecordedReversals: null,
      };
    } catch (error) {
      logger.error("Error detecting unrecorded reversals", {
        tenantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Run full integrity reconciliation across tenant
   * Compares multiple consistency checks
   */
  async runFullReconciliation({
    tenantId,
  }) {
    try {
      const startTime = Date.now();

      // 1. Check soft-delete leakage
      const leakageResult = await this.detectSoftDeleteLeakage({
        tenantId,
      });

      // 2. Check unrecorded reversals
      const reversalResult = await this.detectUnrecordedReversals({
        tenantId,
      });

      // 3. Check all categories
      const categories = await db
        .select()
        .from(db.table("categories"))
        .where(eq(db.table("categories").tenantId, tenantId));

      const categoryIssues = [];
      for (const category of categories) {
        const integrity = await this.checkCategoryIntegrity({
          tenantId,
          categoryId: category.id,
        });

        if (!integrity.isHealthy) {
          categoryIssues.push({
            categoryId: category.id,
            ...integrity,
          });
        }
      }

      const duration = Date.now() - startTime;

      const summary = {
        isHealthy:
          !leakageResult.leakageFound &&
          !reversalResult.found &&
          categoryIssues.length === 0,
        softDeleteLeakageFound: leakageResult.leakageFound,
        unrecordedReversalsFound: reversalResult.found,
        categoryIssuesFound: categoryIssues.length > 0,
        totalIssues: categoryIssues.length,
        duration: `${duration}ms`,
      };

      logger.info("Full integrity reconciliation completed", {
        tenantId,
        ...summary,
      });

      return {
        summary,
        leakageDetails: leakageResult,
        reversalDetails: reversalResult,
        categoryDetails: categoryIssues,
        reconciliationTime: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Error running full reconciliation", {
        tenantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Generate comprehensive integrity report
   */
  async generateIntegrityReport({
    tenantId,
    days = 7,
  }) {
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // Get all integrity issues
      const allIssues = await db
        .select()
        .from(integrityAudit)
        .where(
          and(
            eq(integrityAudit.tenantId, tenantId),
            gt(integrityAudit.detectedAt, cutoff)
          )
        )
        .orderBy(desc(integrityAudit.severity));

      // Group by severity
      const bySeverity = allIssues.reduce((acc, issue) => {
        if (!acc[issue.severity]) {
          acc[issue.severity] = [];
        }
        acc[issue.severity].push(issue);
        return acc;
      }, {});

      // Group by type
      const byType = allIssues.reduce((acc, issue) => {
        if (!acc[issue.auditType]) {
          acc[issue.auditType] = [];
        }
        acc[issue.auditType].push(issue);
        return acc;
      }, {});

      return {
        reportDate: new Date().toISOString(),
        tenantId,
        timeRange: {
          from: cutoff.toISOString(),
          to: new Date().toISOString(),
          days,
        },
        totalIssues: allIssues.length,
        resolvedIssues: allIssues.filter((i) => i.status === "resolved").length,
        unresolvedIssues: allIssues.filter((i) => i.status === "detected").length,
        bySeverity: Object.entries(bySeverity).reduce((acc, [sev, issues]) => {
          acc[sev] = {
            count: issues.length,
            totalDiscrepancy: issues.reduce(
              (sum, i) => sum + (i.discrepancyAmount || 0),
              0
            ),
          };
          return acc;
        }, {}),
        byType: Object.entries(byType).reduce((acc, [type, issues]) => {
          acc[type] = {
            count: issues.length,
            resolved: issues.filter((i) => i.status === "resolved").length,
            unresolved: issues.filter((i) => i.status === "detected").length,
          };
          return acc;
        }, {}),
        issues: allIssues,
      };
    } catch (error) {
      logger.error("Error generating integrity report", {
        tenantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Monitor integrity continuously
   */
  async scheduleIntegrityCheck({
    tenantId,
    intervalMinutes = 60,
  }) {
    try {
      logger.info("Scheduling integrity check", {
        tenantId,
        intervalMinutes,
      });

      // Run immediately
      await this.runFullReconciliation({ tenantId });

      // Schedule recurring check
      setInterval(async () => {
        try {
          await this.runFullReconciliation({ tenantId });
        } catch (error) {
          logger.error("Scheduled integrity check failed", {
            tenantId,
            error: error.message,
          });
        }
      }, intervalMinutes * 60 * 1000);

      return {
        scheduled: true,
        intervalMinutes,
        nextCheck: new Date(Date.now() + intervalMinutes * 60 * 1000),
      };
    } catch (error) {
      logger.error("Error scheduling integrity check", {
        tenantId,
        error: error.message,
      });
      throw error;
    }
  }
}

export default new IntegrityService();
