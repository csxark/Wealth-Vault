import { getAIProvider } from './aiProvider.js';
import db from '../config/db.js';
import { riskProfiles, currencyWallets, fixedAssets } from '../db/schema.js';
import { eq } from 'drizzle-orm';

class Rebalancer {
    /**
     * Generate rebalancing suggestions based on current portfolio vs target risk profile
     */
    async suggestRebalance(userId) {
        const profile = await db.query.riskProfiles.findFirst({ where: eq(riskProfiles.userId, userId) });
        if (!profile) return { message: "No risk profile set for user." };

        const wallets = await db.query.currencyWallets.findMany({ where: eq(currencyWallets.userId, userId) });
        const assets = await db.query.fixedAssets.findMany({ where: eq(fixedAssets.userId, userId) });

        // Build current allocation context
        const currentData = {
            cash: wallets.map(w => ({ currency: w.currency, balance: w.balance })),
            fixedAssets: assets.map(a => ({ name: a.name, category: a.category, val: a.currentValue })),
            targetMix: profile.preferredAssetMix,
            riskTolerance: profile.riskTolerance
        };

        const prompt = `
            You are a senior portfolio strategist at Wealth-Vault.
            Current Portfolio State:
            ${JSON.stringify(currentData, null, 2)}

            User Risk Profile: ${profile.riskTolerance}
            Target Asset Mix: ${JSON.stringify(profile.preferredAssetMix)}

            Analyze if the current allocation deviates more than 5% from target.
            Provide specific trade recommendations (e.g. "Sell 5k of Crypto to buy Bonds/Cash") to stay within the user's risk profile.
            
            Return ONLY a JSON response:
            {
                "deviations": {"crypto": "high", "cash": "low"},
                "recommendations": ["message 1", "message 2"],
                "riskLevel": "high",
                "isRebalanceNeeded": true
            }
        `;

        try {
            const provider = getAIProvider();
            const advice = await provider.generateJSON(prompt, {
                model: 'experimental'
            });
            return advice;
        } catch (error) {
            console.error("Rebalancing AI Error:", error);
            return { error: "Could not generate AI rebalancing advice" };
        }
    }
}

export default new Rebalancer();
