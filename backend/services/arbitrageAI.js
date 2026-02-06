import db from '../config/db.js';
import { arbitrageOpportunities, fxRates } from '../db/schema.js';
import geminiService from './geminiservice.js';
import { desc, eq } from 'drizzle-orm';

class ArbitrageAI {
    /**
     * analyzeMarket: Scans for arbitrage opportunities
     */
    async analyzeMarket() {
        console.log('[Arbitrage AI] Analyzing market conditions...');

        // 1. Get recent rates
        const rates = await db.select().from(fxRates).orderBy(desc(fxRates.lastUpdated)).limit(20);

        if (rates.length === 0) return;

        const rateContext = rates.map(r => `${r.pair}: ${r.rate} (Volatility: ${r.volatility})`).join('\n');

        // 2. Ask Gemini
        const prompt = `
        Analyze the following FX market data for triangular arbitrage or favorable conversion windows:
        
        ${rateContext}

        Identify 1-2 potential opportunities.
        For each, provide:
        - Pair (e.g. USD/EUR)
        - Action (Buy/Sell)
        - Confidence Score (0-100)
        - Expected Profit %
        - Reasoning

        Format response as JSON array of objects: [{ "pair": "...", "action": "...", "confidence": 85, "profit": 0.5, "reason": "..." }]
        Only return the JSON.
        `;

        try {
            const rawResponse = await geminiService.generateInsights(prompt);
            // Basic cleanup of markdown if Gemini adds it
            const jsonStr = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            const opportunities = JSON.parse(jsonStr);

            if (Array.isArray(opportunities)) {
                await this.storeOpportunities(opportunities);
            }
        } catch (error) {
            console.error('[Arbitrage AI] Analysis failed:', error.message);
        }
    }

    async storeOpportunities(opps) {
        const timestamp = new Date();
        const validUntil = new Date(timestamp.getTime() + 15 * 60000); // Valid for 15 mins

        for (const opp of opps) {
            if (opp.confidence < 70) continue; // Filter low confidence

            await db.insert(arbitrageOpportunities).values({
                pair: opp.pair,
                type: opp.action === 'Buy' ? 'buy_signal' : 'sell_signal',
                confidence: opp.confidence.toString(),
                expectedProfit: opp.profit.toString(),
                currentRate: '0', // Ideally fetch current real-time rate here
                status: 'active',
                validUntil,
                createdAt: timestamp
            });
            console.log(`[Arbitrage AI] New signal: ${opp.action} ${opp.pair} (${opp.profit}% potential)`);
        }
    }

    async getActiveOpportunities() {
        // Implement query logic
        return await db.query.arbitrageOpportunities.findMany({
            where: (opps, { gt, eq }) => and(
                gt(opps.validUntil, new Date()),
                eq(opps.status, 'active')
            ),
            orderBy: (opps, { desc }) => [desc(opps.confidence)]
        });
    }
}

export default new ArbitrageAI();
