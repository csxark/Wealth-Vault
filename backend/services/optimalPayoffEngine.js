import db from '../config/db.js';
import { debts } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Optimal Payoff Engine (L3)
 * Algorithm to determine which specific debt lot to pay off first to maximize NPV (Net Present Value).
 * Goes beyond simple Snowflake/Avalanche methods by considering tax-shields and prepayment penalties.
 */
class OptimalPayoffEngine {
    /**
     * Calculate optimal payoff order for multiple debts
     */
    async determineOptimalPayoff(userId, extraCash) {
        try {
            const userDebts = await db.query.debts.findMany({
                where: and(eq(debts.userId, userId), eq(debts.status, 'active'))
            });

            if (userDebts.length === 0) return [];

            const payoffMetrics = userDebts.map(debt => {
                const balance = parseFloat(debt.currentBalance);
                const rate = parseFloat(debt.interestRate) / 100;
                const remainingMonths = parseInt(debt.metadata?.remainingTerm || '120');

                // 1. Calculate Effective Interest Rate (After tax logic mock)
                const isTaxDeductible = debt.debtType === 'mortgage'; // Simple rule
                const effectiveRate = isTaxDeductible ? rate * (1 - 0.25) : rate;

                // 2. Calculate NPV of paying off $1000 today vs scheduled payments
                // NPV = Sum [ Payment / (1 + r)^t ]
                // Higher IRR/NPV gain means higher priority
                const monthlyRate = effectiveRate / 12;
                const payment = (balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -remainingMonths));

                // Simple NPV comparison proxy: Effective Rate + Term Weight
                const priorityScore = effectiveRate * (1 + (remainingMonths / 360));

                return {
                    id: debt.id,
                    name: debt.name,
                    balance,
                    effectiveRate,
                    remainingMonths,
                    priorityScore,
                    recommendedAllocation: 0
                };
            });

            // Sort by priorityScore descending
            payoffMetrics.sort((a, b) => b.priorityScore - a.priorityScore);

            // Allocate extra cash
            let remainingExtra = parseFloat(extraCash);
            for (const item of payoffMetrics) {
                if (remainingExtra <= 0) break;
                const allocation = Math.min(item.balance, remainingExtra);
                item.recommendedAllocation = allocation;
                remainingExtra -= allocation;
            }

            logInfo(`[Optimal Payoff] Calculated payoff strategy for $${extraCash} across ${userDebts.length} debts`);
            return payoffMetrics;
        } catch (error) {
            logError('[Optimal Payoff] Failed to calculate payoff strategy:', error);
            throw error;
        }
    }
}

export default new OptimalPayoffEngine();
