import db from '../config/db.js';
import { optionsPositions, strategyLegs, investments, vaults } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { calculateBlackScholes } from '../utils/blackScholesMath.js';
import impliedVolTracker from './impliedVolTracker.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Options Strategy Engine (#509)
 * Automates "Zero-Cost Options Collars" and "Covered Call" strategies.
 * Used to extract yield or hedge risk without selling the underlying asset.
 */
class OptionsStrategyEngine {
    /**
     * Solves for the "Zero-Cost Collar" strike prices.
     * Pairs an OTM Put (Downside protection) with an OTM Call sell (Capped upside)
     * such that the net premium is zero.
     * @param {string} userId 
     * @param {string} investmentId 
     * @param {number} underlyingPrice - Current spot price.
     * @param {number} downsideHedgeLimit - How much protection (e.g. 0.90 for 10% OTM put).
     * @param {number} tenorDays - Expiration timeline (e.g. 30).
     */
    async constructZeroCostCollar(userId, investmentId, underlyingPrice, downsideHedgeLimit = 0.90, tenorDays = 30) {
        logInfo(`[Strategy Engine] Constructing Zero-Cost Collar for investment ${investmentId} at $${underlyingPrice}`);

        // 1. Get Market Vol / Surface Data
        const iv = await impliedVolTracker.getLatestVol(investmentId, tenorDays);
        const r = 0.05; // Standard risk-free rate for demo
        const T = tenorDays / 365;

        // 2. Solidify the Put (The protective leg)
        const putStrike = underlyingPrice * downsideHedgeLimit;
        const putModel = calculateBlackScholes('put', underlyingPrice, putStrike, T, r, iv);
        const putPremium = putModel.price;

        // 3. Solve for the Call Strike (The income leg)
        // Find the call strike where callPremium = putPremium (Net zero)
        // Newton-style solver or simple iterative search for strike K
        let callStrike = underlyingPrice * 1.05; // Initial guess (5% OTM)
        let callStrikeFound = false;

        for (let i = 0; i < 50; i++) {
            const callModel = calculateBlackScholes('call', underlyingPrice, callStrike, T, r, iv);
            const diff = putPremium - callModel.price;

            if (Math.abs(diff) < 0.01) {
                callStrikeFound = true;
                break;
            }

            // High premium -> increase strike to reduce premium
            // Low premium -> decrease strike to increase premium
            callStrike = callStrike + (diff * 10);
        }

        const finalCallModel = calculateBlackScholes('call', underlyingPrice, callStrike, T, r, iv);

        return {
            underlyingPrice,
            tenorDays,
            put: { strike: putStrike, premiumCost: putPremium, delta: putModel.delta },
            call: { strike: callStrike, premiumIncome: finalCallModel.price, delta: finalCallModel.delta },
            netPremium: (putPremium - finalCallModel.price).toFixed(4),
            isZeroCost: true
        };
    }

    /**
     * Executes the strategy locally in the DB.
     */
    async executeCollar(userId, investmentId, vaultId, collarParams) {
        logInfo(`[Strategy Engine] Executing Collar on vault ${vaultId} for user ${userId}`);

        return await db.transaction(async (tx) => {
            // 1. Create Strategy Header
            const [strategy] = await tx.insert(strategyLegs).values({
                userId,
                strategyName: 'Zero-Cost Collar Strategy',
                strategyType: 'collar',
                underlyingInvestmentId: investmentId,
                netPremium: collarParams.netPremium,
                targetDelta: collarParams.put.delta.toString()
            }).returning();

            const expiration = new Date();
            expiration.setDate(expiration.getDate() + collarParams.tenorDays);

            // 2. Insert Long Put Leg
            await tx.insert(optionsPositions).values({
                userId,
                investmentId,
                vaultId,
                type: 'put',
                strikePrice: collarParams.put.strike.toString(),
                expirationDate: expiration,
                contractsCount: '1.0', // Demo: 1 contract per strategy
                premiumPerUnit: collarParams.put.premiumCost.toString(),
                strategyId: strategy.id,
                isCovered: true
            });

            // 3. Insert Short Call Leg
            await tx.insert(optionsPositions).values({
                userId,
                investmentId,
                vaultId,
                type: 'call',
                strikePrice: collarParams.call.strike.toString(),
                expirationDate: expiration,
                contractsCount: '-1.0', // Selling the call
                premiumPerUnit: collarParams.call.premiumIncome.toString(),
                strategyId: strategy.id,
                isCovered: true
            });

            return strategy;
        });
    }
}

export default new OptionsStrategyEngine();
