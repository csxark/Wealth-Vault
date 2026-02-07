import geminiService from './geminiservice.js';
import db from '../config/db.js';
import { fxRates, arbitrageOpportunities } from '../db/schema.js';
import { eq } from 'drizzle-orm';

class ArbitrageAI {
    /**
     * Scan global rates and user wallets for arbitrage opportunities
     */
    async scanForOpportunities(userId) {
        const rates = await db.query.fxRates.findMany();

        // Create a matrix of rates for Gemini to analyze
        const rateMatrix = rates.map(r => `${r.pair}: ${r.rate} (Change: ${r.change24h}%, Vol: ${r.volatility}%)`).join('\n');

        const prompt = `
      You are a high-frequency FX arbitrage bot for the Wealth-Vault platform. 
      Analyze the current market FX rates provided below:

      ${rateMatrix}

      Identify 2-3 specific arbitrage opportunities (buy/sell signals) or "juggling" strategies that could yield a profit due to current volatility or rate mismatches between pairs.
      
      Format your response ONLY as a JSON array of objects with this structure (no markdown blocks):
      [
        {
          "pair": "USD/EUR",
          "type": "buy_signal",
          "confidence": 85,
          "expectedProfit": 1.2,
          "recommendation": "Buy USD now, hold for 2 hours for expected spike against EUR"
        }
      ]
    `;

        try {
            const response = await geminiService.generateInsights(prompt);

            // Basic cleaning in case AI includes markdowns
            const cleanJson = response.replace(/```json|```/g, '').trim();
            const opportunities = JSON.parse(cleanJson);

            const savedOps = [];

            // Save to database
            for (const op of opportunities) {
                const [saved] = await db.insert(arbitrageOpportunities).values({
                    pair: op.pair,
                    type: op.type,
                    confidence: op.confidence.toString(),
                    expectedProfit: op.expectedProfit.toString(),
                    status: 'active',
                    validUntil: new Date(Date.now() + 3600000) // Valid for 1 hour
                }).returning();
                savedOps.push(saved);
            }

            return savedOps;
        } catch (error) {
            console.error('Arbitrage AI Error:', error);
            return [];
        }
    }

    /**
     * Get all active opportunities
     */
    async getActiveOpportunities() {
        return await db.query.arbitrageOpportunities.findMany({
            where: eq(arbitrageOpportunities.status, 'active')
        });
    }
}

export default new ArbitrageAI();
