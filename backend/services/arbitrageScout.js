import db from '../config/db.js';
import { debts, investments, debtArbitrageLogs } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import waccCalculator from './waccCalculator.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Arbitrage Scout Service (L3)
 * Logic to identify when the Investment Yield < Debt Interest Cost (after tax) 
 * and propose "Liquidate-to-Payoff" or "Loan-to-Invest" actions.
 */
class ArbitrageScout {
    /**
     * Scan for arbitrage opportunities
     */
    async scanForArbitrage(userId) {
        try {
            const waccData = await waccCalculator.calculateUserWACC(userId);
            const userDebts = await db.query.debts.findMany({
                where: and(eq(debts.userId, userId), eq(debts.status, 'active'))
            });
            const userInvestments = await db.query.investments.findMany({
                where: and(eq(investments.userId, userId), eq(investments.isActive, true))
            });

            const opportunities = [];

            // 1. Identify "Negative Spread" - Where Debt Interest > Investment Yield
            // Strategy: LIQUIDATE_TO_PAYOFF
            for (const debt of userDebts) {
                const debtRate = parseFloat(debt.interestRate) / 100;

                for (const inv of userInvestments) {
                    // Logic to estimate yield (mocked: check metadata or historical performance)
                    const invYield = parseFloat(inv.metadata?.expectedYield || '0.07');

                    if (debtRate > invYield + 0.01) { // 1% buffer
                        opportunities.push({
                            type: 'LIQUIDATE_TO_PAYOFF',
                            debtId: debt.id,
                            investmentId: inv.id,
                            symbol: inv.symbol,
                            spread: debtRate - invYield,
                            amount: Math.min(parseFloat(debt.currentBalance), parseFloat(inv.marketValue || '0')),
                            reason: `Debt interest (${(debtRate * 100).toFixed(2)}%) is higher than investment yield (${(invYield * 100).toFixed(2)}%).`
                        });
                    }
                }
            }

            // 2. Identify "Positive Spread" - Where Loan Rate < Investment Yield
            // Strategy: LOAN_TO_INVEST (Leverage opportunity)
            // (e.g. Low interest margin loan to buy high yield assets)

            // 3. Log proposed opportunities
            for (const opp of opportunities) {
                await db.insert(debtArbitrageLogs).values({
                    userId,
                    debtId: opp.debtId,
                    investmentId: opp.investmentId,
                    actionType: opp.type,
                    arbitrageAlpha: opp.spread.toString(),
                    amountInvolved: opp.amount.toString(),
                    estimatedAnnualSavings: (opp.amount * opp.spread).toFixed(2),
                    status: 'proposed',
                    metadata: { reason: opp.reason }
                });
            }

            logInfo(`[Arbitrage Scout] Found ${opportunities.length} opportunities for user ${userId}`);
            return opportunities;
        } catch (error) {
            logError('[Arbitrage Scout] Failed to scan for arbitrage:', error);
            throw error;
        }
    }

    /**
     * Execute a proposed arbitrage action
     */
    async executeArbitrage(logId) {
        return await db.transaction(async (tx) => {
            const [log] = await tx.select().from(debtArbitrageLogs).where(eq(debtArbitrageLogs.id, logId));

            if (!log || log.status !== 'proposed') {
                throw new Error('Invalid or already executed log');
            }

            // In production, this would trigger actual trades/payments
            // For now, we update status and log simulated alpha
            await tx.update(debtArbitrageLogs)
                .set({ status: 'executed', createdAt: new Date() })
                .where(eq(debtArbitrageLogs.id, logId));

            logInfo(`[Arbitrage Scout] Executed arbitrage ${logId} of type ${log.actionType}`);
            return { success: true, log };
        });
    }
}

export default new ArbitrageScout();
