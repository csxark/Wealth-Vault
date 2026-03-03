import db from '../config/db.js';
import {
    successionPlans,
    investments,
    bankAccounts,
    realEstate,
    passionAssets,
    estateBrackets
} from '../db/schema.js';
import { eq } from 'drizzle-orm';
import EstateTaxCalculator from './estateTaxCalculator.js';
import MonteCarloEngine from './monteCarloEngine.js';
import StochasticMath from '../utils/stochasticMath.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * EstateTaxStressTester (#784)
 * Level 4 implementation of an AI-powered stress tester for estate tax and liquidity.
 * Scans the digital asset ledger, computes tax liabilities across jurisdictions,
 * and runs crisis simulations to ensure heirs aren't forced into illiquid fire-sales.
 */
class EstateTaxStressTester {
    /**
     * Comprehensive analysis of estate tax liability and liquidity buffers.
     */
    async performFullStressTest(userId) {
        logInfo(`[EstateTaxStressTester] Starting full stress test for user ${userId}`);

        try {
            // 1. Gather Asset Data
            const assets = await this._gatherUserAssets(userId);
            const totalWealth = this._calculateTotalWealth(assets);

            // 2. Tax Liability Engine (Jurisdiction-Aware AI mapping)
            const taxAnalysis = await this._analyzeTaxLiability(userId, totalWealth);

            // 3. Liquidity Buffer Analysis
            const liquidityAnalysis = this._analyzeLiquidity(assets, taxAnalysis.expectedTaxBurdenAtDeath);

            // 4. Crisis Simulation (Monte Carlo at Trigger Date)
            const simulationResults = await this._runCrisisSimulation(userId, totalWealth, taxAnalysis.jurisdictionThreshold);

            return {
                timestamp: new Date().toISOString(),
                totalWealthAtRisk: totalWealth,
                taxAnalysis,
                liquidityAnalysis,
                simulationResults,
                recommendations: this._generateRecommendations(taxAnalysis, liquidityAnalysis, simulationResults)
            };
        } catch (error) {
            logError(`[EstateTaxStressTester] Stress test failed for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Internal: Gather all assets across disparate tables
     */
    async _gatherUserAssets(userId) {
        return {
            investments: await db.select().from(investments).where(eq(investments.userId, userId)),
            bankAccounts: await db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId)),
            realEstate: await db.select().from(realEstate).where(eq(realEstate.userId, userId)),
            passionAssets: await db.select().from(passionAssets).where(eq(passionAssets.userId, userId))
        };
    }

    /**
     * Internal: Aggregate wealth for tax base
     */
    _calculateTotalWealth(assets) {
        let total = 0;
        total += assets.investments.reduce((sum, a) => sum + parseFloat(a.balance || 0), 0);
        total += assets.bankAccounts.reduce((sum, a) => sum + parseFloat(a.balance || 0), 0);
        total += assets.realEstate.reduce((sum, a) => sum + parseFloat(a.estimatedValue || 0), 0);
        total += assets.passionAssets.reduce((sum, a) => sum + parseFloat(a.currentEstimatedValue || 0), 0);
        return total;
    }

    /**
     * Internal: Tax Liability Engine
     */
    async _analyzeTaxLiability(userId, totalWealth) {
        // Mocking AI mapping to jurisdictions. In production, this would use a LLM
        // to categorize assets (e.g., QPF vs Non-QPF) and apply local tax treaties.

        // Fetch percentiles for the current moment (year 0) to use existing calculator
        const mockPercentiles = {
            percentile50: [totalWealth]
        };

        const basicTaxInfo = await EstateTaxCalculator.calculateBreachProbability(userId, mockPercentiles, 0);

        return {
            ...basicTaxInfo,
            effectiveTaxRate: totalWealth > 0 ? (basicTaxInfo.expectedTaxBurdenAtDeath / totalWealth) * 100 : 0,
            jurisdictions: [
                { name: "US Federal", likelihood: 1.0, estimatedBurden: basicTaxInfo.expectedTaxBurdenAtDeath },
                { name: "Global Digital Assets (Estimated)", likelihood: 0.3, estimatedBurden: totalWealth * 0.05 }
            ]
        };
    }

    /**
     * Internal: Liquidity Buffer Analysis
     */
    _analyzeLiquidity(assets, taxLiability) {
        let immediateLiquidity = 0; // Cash/Stablecoins
        let marketLiquidity = 0; // Public Equities
        let illiquidAssets = 0; // Real Estate, Passion Assets

        assets.bankAccounts.forEach(a => immediateLiquidity += parseFloat(a.balance || 0));
        assets.investments.forEach(a => {
            if (a.assetType === 'stablecoin' || a.assetType === 'cash') {
                immediateLiquidity += parseFloat(a.balance || 0);
            } else {
                marketLiquidity += parseFloat(a.balance || 0);
            }
        });
        assets.realEstate.forEach(a => illiquidAssets += parseFloat(a.estimatedValue || 0));
        assets.passionAssets.forEach(a => illiquidAssets += parseFloat(a.currentEstimatedValue || 0));

        const totalLiquid = immediateLiquidity + marketLiquidity;
        const coverageRatio = taxLiability > 0 ? totalLiquid / taxLiability : Infinity;

        return {
            immediateLiquidity,
            marketLiquidity,
            illiquidAssets,
            totalLiquid,
            taxLiability,
            coverageRatio,
            status: coverageRatio < 1.2 ? 'CRITICAL' : (coverageRatio < 2.0 ? 'WARNING' : 'HEALTHY'),
            shortfall: Math.max(0, taxLiability - immediateLiquidity)
        };
    }

    /**
     * Internal: Crisis Simulation (Stress test at the moment of trigger)
     */
    async _runCrisisSimulation(userId, currentWealth, threshold) {
        // Run a shorter, high-intensity sim (5 years) with higher volatility 
        // to simulate market crash coincide with probate/succession events.
        const simulationRuns = 1000;
        const highVolSigma = 0.25; // 25% volatility for "crisis" scenario

        let pathsBreachingThreshold = 0;
        const terminalWealths = [];

        for (let i = 0; i < simulationRuns; i++) {
            // Simple GBM for 1 year "Shock"
            const shockMultiplier = Math.exp((0.07 - 0.5 * Math.pow(highVolSigma, 2)) * 1 + highVolSigma * StochasticMath.boxMullerTransform());
            const shockedWealth = currentWealth * shockMultiplier;

            terminalWealths.push(shockedWealth);
            if (shockedWealth > threshold) pathsBreachingThreshold++;
        }

        const sortedWealths = terminalWealths.sort((a, b) => a - b);

        return {
            scenario: "Immediate Succession Market Shock",
            volatilityAssumed: highVolSigma,
            probabilityOfTaxBreach: (pathsBreachingThreshold / simulationRuns) * 100,
            p10Wealth: sortedWealths[Math.floor(simulationRuns * 0.1)],
            p50Wealth: sortedWealths[Math.floor(simulationRuns * 0.5)],
            p90Wealth: sortedWealths[Math.floor(simulationRuns * 0.9)],
        };
    }

    /**
     * Internal: Generate AI-style recommendations
     */
    _generateRecommendations(tax, liquidity, sim) {
        const recs = [];

        if (liquidity.status === 'CRITICAL') {
            recs.push("IMMEDIATE ACTION: Your liquid assets do not cover projected estate tax. Consider increasing your Cash/Stablecoin buffer.");
        }

        if (liquidity.shortfall > 0) {
            recs.push(`LIQUIDITY ALERT: You have a $${liquidity.shortfall.toLocaleString()} shortfall between immediate cash and tax liability. Heirs may be forced to sell Real Estate or Passion Assets.`);
        }

        if (sim.probabilityOfTaxBreach > 80) {
            recs.push("TAX OPTIMIZATION: High probability of breaching tax thresholds even in market downturns. Consider gifting or setting up a Dynasty Trust.");
        }

        if (recs.length === 0) {
            recs.push("SUCCESSION READY: Your current portfolio has sufficient liquidity to handle projected estate taxes without forced selling.");
        }

        return recs;
    }
}

export default new EstateTaxStressTester();
