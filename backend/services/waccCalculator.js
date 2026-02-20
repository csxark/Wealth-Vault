import db from '../config/db.js';
import { debts, investments, capitalCostSnapshots } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * WACC Calculator Service (L3)
 * Real-time calculation of the user's personal/business WACC based on all active loans and equity.
 */
class WACCCalculator {
    /**
     * Calculate WACC for a given user
     */
    async calculateUserWACC(userId) {
        try {
            // 1. Get all active debts
            const userDebts = await db.query.debts.findMany({
                where: and(eq(debts.userId, userId), eq(debts.status, 'active'))
            });

            // 2. Get all active investments (Equity)
            const userInvestments = await db.query.investments.findMany({
                where: and(eq(investments.userId, userId), eq(investments.isActive, true))
            });

            // 3. Calculate Total Debt and Average Cost of Debt
            let totalDebt = 0;
            let weightedInterestSum = 0;

            userDebts.forEach(debt => {
                const balance = parseFloat(debt.currentBalance);
                const rate = parseFloat(debt.interestRate) / 100;
                totalDebt += balance;
                weightedInterestSum += balance * rate;
            });

            const costOfDebt = totalDebt > 0 ? (weightedInterestSum / totalDebt) : 0;

            // 4. Calculate Total Equity and Estimated Cost of Equity
            // For personal finance, Cost of Equity can be estimated as the Opportunity Cost 
            // of the market (e.g., S&P 500 average return ~8-10%)
            let totalEquity = 0;
            userInvestments.forEach(inv => {
                totalEquity += parseFloat(inv.marketValue || inv.totalCost);
            });

            const costOfEquity = 0.09; // Mock: 9% expected market return

            // 5. Calculate WACC
            const totalCapital = totalDebt + totalEquity;
            let wacc = 0;

            if (totalCapital > 0) {
                const weightDebt = totalDebt / totalCapital;
                const weightEquity = totalEquity / totalCapital;

                // WACC = (Wd * Kd) + (We * Ke)
                // Note: In personal finance, interest isn't always tax-deductible like corporate WACC
                wacc = (weightDebt * costOfDebt) + (weightEquity * costOfEquity);
            }

            logInfo(`[WACC Calculator] User ${userId} - Debt: $${totalDebt.toFixed(2)}, Equity: $${totalEquity.toFixed(2)}, WACC: ${(wacc * 100).toFixed(2)}%`);

            // 6. Save Snapshot
            await db.insert(capitalCostSnapshots).values({
                userId,
                wacc: wacc.toString(),
                costOfDebt: costOfDebt.toString(),
                costOfEquity: costOfEquity.toString(),
                totalDebt: totalDebt.toString(),
                totalEquity: totalEquity.toString(),
            });

            return {
                wacc,
                costOfDebt,
                costOfEquity,
                totalDebt,
                totalEquity,
                totalCapital
            };
        } catch (error) {
            logError('[WACC Calculator] Failed to calculate WACC:', error);
            throw error;
        }
    }

    /**
     * Get WACC history for trend analysis
     */
    async getWACCHistory(userId, limit = 10) {
        return await db.query.capitalCostSnapshots.findMany({
            where: eq(capitalCostSnapshots.userId, userId),
            orderBy: sql`${capitalCostSnapshots.snapshotDate} DESC`,
            limit
        });
    }
}

export default new WACCCalculator();
