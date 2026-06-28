import db from '../config/db.js';
import { debts, refinanceRoiMetrics } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { calculateAmortization, calculateNPV, calculateBreakEven } from '../utils/financialMath.js';
import { logInfo } from '../utils/logger.js';

/**
 * Debt Refinance Service (L3)
 * Logic for calculating refinance benefits and NPV of consolidation.
 */
class RefinanceService {
    /**
     * Analyze a refinance opportunity for a specific debt
     */
    async analyzeRefinance(userId, debtId, proposedRate, closingCosts) {
        const [debt] = await db.select().from(debts).where(and(eq(debts.id, debtId), eq(debts.userId, userId)));
        if (!debt) throw new Error("Debt record not found");

        const currentBalance = parseFloat(debt.currentBalance);
        const currentAPR = parseFloat(debt.apr);
        const remainingMonths = debt.termMonths || 360; // Default to 30 years if unknown

        // 1. Calculate current monthly payment
        const currentPayment = calculateAmortization(currentBalance, currentAPR, remainingMonths);

        // 2. Calculate proposed monthly payment
        const proposedPayment = calculateAmortization(currentBalance, proposedRate, remainingMonths);

        const monthlySaving = currentPayment - proposedPayment;

        // 3. Calculate Break-Even Months
        const breakEven = calculateBreakEven(monthlySaving, closingCosts);

        // 4. Calculate Net Present Value (NPV)
        // Cash flows: -ClosingCosts, then +MonthlySaving for remainingMonths
        const cashFlows = [-(parseFloat(closingCosts))];
        for (let i = 0; i < remainingMonths; i++) {
            cashFlows.push(monthlySaving);
        }

        // Use current APR as discount rate for risk-neutral comparison
        const npv = calculateNPV(currentAPR / 12, cashFlows);
        const roiPercent = (npv / closingCosts) * 100;

        // Save metric
        const [metric] = await db.insert(refinanceRoiMetrics).values({
            userId,
            currentDebtId: debtId,
            proposedRate: proposedRate.toFixed(4),
            closingCosts: closingCosts.toString(),
            breakEvenMonths: breakEven === Infinity ? 999 : breakEven,
            netPresentValue: npv.toFixed(2),
            roiPercent: roiPercent.toFixed(2),
            isAutoRecommended: roiPercent > 15 // Recommend if ROI > 15%
        }).returning();

        return metric;
    }

    /**
     * Get the best refinance proposals for a user
     */
    async getBestProposals(userId) {
        return await db.query.refinanceRoiMetrics.findMany({
            where: eq(refinanceRoiMetrics.userId, userId),
            orderBy: (metrics, { desc }) => [desc(metrics.netPresentValue)],
            limit: 5,
            with: {
                debt: true
            }
        });
    }
}

export default new RefinanceService();
