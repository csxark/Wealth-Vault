import db from '../config/db.js';
import { debts, investments, capitalCostSnapshots, debtArbitrageLogs, users } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { calculateNPV } from '../utils/financialMath.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Arbitrage Engine (L3)
 * High-fidelity calculation logic for debt-liquidation vs. investment reallocation.
 */
class ArbitrageEngine {
    /**
     * Calculate WACC (Weighted Average Cost of Capital) for a user
     */
    async calculateWACC(userId) {
        try {
            // 1. Get all active debts
            const userDebts = await db.select().from(debts).where(and(eq(debts.userId, userId), eq(debts.isActive, true)));

            // 2. Get all investments
            const userInvestments = await db.select().from(investments).where(and(eq(investments.userId, userId), eq(investments.isActive, true)));

            let totalDebtValue = 0;
            let weightedDebtCost = 0;
            userDebts.forEach(d => {
                const balance = parseFloat(d.currentBalance || 0);
                const apr = parseFloat(d.apr || 0);
                totalDebtValue += balance;
                weightedDebtCost += (balance * apr);
            });

            const costOfDebt = totalDebtValue > 0 ? (weightedDebtCost / totalDebtValue) : 0;

            let totalEquityValue = 0;
            let weightedEquityReturn = 0;
            userInvestments.forEach(i => {
                const marketValue = parseFloat(i.marketValue || 0);
                // Assume 7% if unknown, or derive from metadata if available
                const expectedReturn = i.metadata?.expectedReturn ? parseFloat(i.metadata.expectedReturn) : 7.0;
                totalEquityValue += marketValue;
                weightedEquityReturn += (marketValue * expectedReturn);
            });

            const costOfEquity = totalEquityValue > 0 ? (weightedEquityReturn / totalEquityValue) : 7.0;

            const totalCapital = totalDebtValue + totalEquityValue;
            if (totalCapital === 0) return { wacc: 0, costOfDebt: 0, costOfEquity: 0, totalDebt: 0, totalEquity: 0 };

            const wacc = ((totalDebtValue / totalCapital) * costOfDebt) + ((totalEquityValue / totalCapital) * costOfEquity);

            // Log snapshot
            await db.insert(capitalCostSnapshots).values({
                userId,
                wacc: wacc.toFixed(4),
                costOfDebt: costOfDebt.toFixed(4),
                costOfEquity: costOfEquity.toFixed(4),
                totalDebt: totalDebtValue.toString(),
                totalEquity: totalEquityValue.toString()
            });

            return { wacc, costOfDebt, costOfEquity, totalDebtValue, totalEquityValue };
        } catch (error) {
            logError(`[Arbitrage Engine] WACC Calculation failed for user ${userId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Determine if excess capital should be "invested" or used for "debt-liquidation"
     */
    async generateArbitrageSignals(userId) {
        const { costOfDebt, costOfEquity } = await this.calculateWACC(userId);
        const signals = [];

        // Strategy 1: Debt Payoff vs Investment
        // If Debt APR > Expected Investment Return, Paying off debt is a guaranteed ROI.
        const userDebts = await db.select().from(debts).where(and(eq(debts.userId, userId), eq(debts.isActive, true)));
        const userInvestments = await db.select().from(investments).where(and(eq(investments.userId, userId), eq(investments.isActive, true)));

        for (const debt of userDebts) {
            const apr = parseFloat(debt.apr);

            // Find investments with lower expected returns than this debt's cost
            for (const inv of userInvestments) {
                const expReturn = inv.metadata?.expectedReturn ? parseFloat(inv.metadata.expectedReturn) : 7.0;

                if (apr > expReturn + 2.0) { // 2% safety margin
                    signals.push({
                        userId,
                        debtId: debt.id,
                        investmentId: inv.id,
                        actionType: 'LIQUIDATE_TO_PAYOFF',
                        arbitrageAlpha: (apr - expReturn).toFixed(4),
                        amountInvolved: Math.min(parseFloat(debt.currentBalance), parseFloat(inv.marketValue)).toString(),
                        estimatedAnnualSavings: (Math.min(parseFloat(debt.currentBalance), parseFloat(inv.marketValue)) * (apr - expReturn) / 100).toFixed(2),
                        status: 'proposed'
                    });
                }
            }
        }

        // Bulk insert proposals
        if (signals.length > 0) {
            await db.insert(debtArbitrageLogs).values(signals);
        }

        return signals;
    }
}

export default new ArbitrageEngine();
