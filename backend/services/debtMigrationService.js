import db from '../config/db.js';
import { debts, refinanceRoiMetrics, auditLogs } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Debt Migration Service (L3)
 * Service to handle the "Refinance Flow" from one vault/provider to another.
 * Calculates ROI and Break-even points for new debt offers.
 */
class DebtMigrationService {
    /**
     * Analyze a refinance proposal
     */
    async analyzeRefinance(userId, debtId, proposedRate, closingCosts) {
        const debt = await db.query.debts.findFirst({
            where: and(eq(debts.id, debtId), eq(debts.userId, userId))
        });

        if (!debt) throw new Error('Debt not found');

        const currentRate = parseFloat(debt.interestRate) / 100;
        const newRate = proposedRate / 100;
        const balance = parseFloat(debt.currentBalance);
        const costs = parseFloat(closingCosts);

        // Annual savings estimate
        const annualSavings = (currentRate - newRate) * balance;
        const monthlySavings = annualSavings / 12;

        const breakEvenMonths = monthlySavings > 0 ? (costs / monthlySavings) : Infinity;

        // Simple NPV of savings over 5 years (60 months)
        const discountRate = 0.05 / 12; // 5% annual discount
        let npv = -costs;
        for (let t = 1; t <= 60; t++) {
            npv += monthlySavings / Math.pow(1 + discountRate, t);
        }

        const roi = (npv / costs) * 100;

        const [metric] = await db.insert(refinanceRoiMetrics).values({
            userId,
            currentDebtId: debtId,
            proposedRate: proposedRate.toString(),
            closingCosts: costs.toString(),
            breakEvenMonths: Math.ceil(breakEvenMonths),
            netPresentValue: npv.toFixed(2),
            roiPercent: roi.toFixed(2),
            isAutoRecommended: npv > 0 && breakEvenMonths < 36
        }).returning();

        logInfo(`[Debt Migration] Refinance analysis for ${debt.name}: NPV $${npv.toFixed(2)}, Break-even: ${Math.ceil(breakEvenMonths)} months`);
        return metric;
    }

    /**
     * Complete a migration (Simulation)
     */
    async completeMigration(metricId) {
        return await db.transaction(async (tx) => {
            const metric = await tx.query.refinanceRoiMetrics.findFirst({
                where: eq(refinanceRoiMetrics.id, metricId)
            });

            if (!metric) throw new Error('Metric not found');

            const debt = await tx.query.debts.findFirst({
                where: eq(debts.id, metric.currentDebtId)
            });

            // 1. Mark old debt as refinanced/closed
            await tx.update(debts)
                .set({ status: 'closed', metadata: { ...debt.metadata, refinancedTo: metric.proposedRate } })
                .where(eq(debts.id, debt.id));

            // 2. Create new debt entry
            const [newDebt] = await tx.insert(debts).values({
                userId: metric.userId,
                name: `${debt.name} (Refinanced)`,
                debtType: debt.debtType,
                originalAmount: debt.currentBalance,
                currentBalance: debt.currentBalance,
                interestRate: metric.proposedRate,
                status: 'active',
                metadata: { migratedFrom: debt.id, closingCosts: metric.closingCosts }
            }).returning();

            logInfo(`[Debt Migration] Completed migration of ${debt.id} to new debt ${newDebt.id}`);
            return newDebt;
        });
    }
}

export default new DebtMigrationService();
