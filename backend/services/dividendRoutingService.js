import db from '../config/db.js';
import { debts } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import defaultPredictorAI from './defaultPredictorAI.js';
import debtEngine from './debtEngine.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Dividend Routing Service (#441)
 * Intercepts passive income and redirects it to high-interest debt 
 * when the user is at high risk of default.
 */
class DividendRoutingService {
    async processAndRouteDividend(userId, dividendData) {
        logInfo(`[Dividend Router] Intercepting payout for user ${userId}: $${dividendData.amount}`);

        try {
            // 1. Check Default Risk
            const prediction = await defaultPredictorAI.getLatestScore(userId);
            const pd = prediction ? parseFloat(prediction.probabilityOfDefault) : 0;

            if (pd > 0.65) {
                logInfo(`[Dividend Router] HIGH RISK DETECTED (${(pd * 100).toFixed(2)}%). Rerouting to debt.`);

                // 2. Identify Target Debt (Highest APR)
                const userDebts = await db.query.debts.findMany({
                    where: and(eq(debts.userId, userId), eq(debts.isActive, true)),
                    orderBy: [desc(debts.apr)]
                });

                if (userDebts.length > 0) {
                    const targetDebt = userDebts[0];
                    const amountToRoute = parseFloat(dividendData.amount);

                    // 3. Record Debt Payment
                    await debtEngine.recordPayment(userId, targetDebt.id, amountToRoute);

                    logInfo(`[Dividend Router] Successfully routed $${amountToRoute} to ${targetDebt.name}`);

                    return {
                        routed: true,
                        targetDebt: targetDebt.name,
                        amount: amountToRoute,
                        status: 'rerouted_to_debt'
                    };
                }
            }

            // Normal flow if risk is low or no debt
            return {
                routed: false,
                amount: parseFloat(dividendData.amount),
                status: 'paid_to_wallet'
            };
        } catch (error) {
            logError(`[Dividend Router] Failed to route dividend for user ${userId}:`, error);
            throw error;
        }
    }
}

export default new DividendRoutingService();
