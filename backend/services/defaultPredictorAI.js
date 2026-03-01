import db from '../config/db.js';
import { defaultPredictionScores, macroEconomicIndicators, debts } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { calculateLogisticDefaultProbability } from '../utils/financialMath.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Default Predictor AI Service (#441)
 * Calculates the 90-day probability of default for a user based on 
 * liquidity, cash flow velocity, and macro indicators.
 */
class DefaultPredictorAI {
    async calculateDefaultRisk(userId) {
        logInfo(`[Default Predictor] Running risk analysis for user ${userId}`);

        try {
            // 1. Fetch User Data
            const userDebts = await db.select().from(debts).where(eq(debts.userId, userId));

            const totalMonthlyDebtService = userDebts.reduce((sum, d) => sum + parseFloat(d.minimumPayment || 0), 0);

            // 2. Fetch Macro Indicators
            const [latestMacro] = await db.select().from(macroEconomicIndicators)
                .orderBy(desc(macroEconomicIndicators.periodDate))
                .limit(1);

            const macroRiskFactor = latestMacro ? parseFloat(latestMacro.value) / 5 : 0.5;

            // 3. Simulated Liquidity and Cash Flow (Simulated for L3 logic context)
            const incomeVelocity = 2.1;
            const liquidityRatio = 0.8;

            // 4. Calculate Probability
            const pd = calculateLogisticDefaultProbability(incomeVelocity, liquidityRatio, macroRiskFactor);

            let riskLevel = 'low';
            if (pd > 0.75) riskLevel = 'critical';
            else if (pd > 0.50) riskLevel = 'high';
            else if (pd > 0.25) riskLevel = 'medium';

            // 5. Store the prediction
            const [prediction] = await db.insert(defaultPredictionScores).values({
                userId,
                probabilityOfDefault: pd.toFixed(4),
                riskLevel,
                factors: {
                    incomeVelocity,
                    liquidityRatio,
                    macroRiskFactor,
                    baseRate: latestMacro?.value || '4.50'
                }
            }).returning();

            logInfo(`[Default Predictor] User ${userId} risk: ${riskLevel} (PD: ${(pd * 100).toFixed(2)}%)`);

            return prediction;
        } catch (error) {
            logError(`[Default Predictor] Failed for user ${userId}:`, error);
            throw error;
        }
    }

    async getLatestScore(userId) {
        return await db.query.defaultPredictionScores.findFirst({
            where: eq(defaultPredictionScores.userId, userId),
            orderBy: [desc(defaultPredictionScores.predictionDate)]
        });
    }
}

export default new DefaultPredictorAI();
