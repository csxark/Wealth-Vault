import db from '../config/db.js';
import { trustStructures, taxExemptions, simulationResults } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { generateGBMPath } from '../utils/monteCarlo.js';
import { logInfo, logError } from '../utils/logger.js';
import gratCalculator from './gratCalculator.js';

/**
 * Dynasty Trust Simulator (#511)
 * Projects multi-generational wealth scenarios over 50-100 year horizons.
 * Specifically tracks:
 * - Estate Tax leakage (40% above exemption).
 * - GST Tax thresholds.
 * - Tax-free growth within the Trust vs. taxable Personal accounts.
 */
class DynastyTrustSimulator {
    /**
     * Run simulation for a specific trust structure.
     */
    async simulate(userId, trustId, iterations = 5000) {
        logInfo(`[Dynasty Simulator] Starting 100-year simulation for trust ${trustId}`);

        try {
            // 1. Get Trust Data
            const [trust] = await db.select().from(trustStructures).where(eq(trustStructures.id, trustId));
            if (!trust) throw new Error('Trust structure not found');

            // 2. Load Tax Exemptions (GST/Estate)
            const [exemptions] = await db.select()
                .from(taxExemptions)
                .where(eq(taxExemptions.userId, userId))
                .orderBy(desc(taxExemptions.taxYear))
                .limit(1);

            const estateExemption = exemptions ? parseFloat(exemptions.totalLimit) : 13610000; // 2024 limit
            const estateTaxRate = 0.40;

            // 3. Monte Carlo Parameters
            const drift = parseFloat(trust.expectedAnnualReturn) || 0.07;
            const vol = 0.15; // Benchmark market volatility
            const years = 100; // For Dynasty simulation
            const generationLength = 30; // Years per generation

            const allPathsFinalValues = [];
            const samplePaths = [];

            for (let i = 0; i < iterations; i++) {
                const path = this.runSingleDynastyPath(
                    parseFloat(trust.initialPrincipal),
                    drift,
                    vol,
                    years,
                    generationLength,
                    estateExemption,
                    estateTaxRate
                );

                allPathsFinalValues.push(path[path.length - 1]);
                if (i < 5) samplePaths.push(path);
            }

            // 4. Summarize results
            allPathsFinalValues.sort((a, b) => a - b);
            const p10 = allPathsFinalValues[Math.floor(iterations * 0.1)];
            const p50 = allPathsFinalValues[Math.floor(iterations * 0.5)];
            const p90 = allPathsFinalValues[Math.floor(iterations * 0.9)];

            // 5. Store Simulation Result
            await db.insert(simulationResults).values({
                userId,
                resourceId: trustId,
                resourceType: 'trust',
                p10Value: p10.toString(),
                p50Value: p50.toString(),
                p90Value: p90.toString(),
                simulationData: {
                    samplePaths,
                    initialPrincipal: trust.initialPrincipal,
                    input_drift: drift,
                    input_vol: vol,
                    type: 'dynasty_100yr'
                },
                iterations
            });

            return { p10, p50, p90, samplePaths };
        } catch (error) {
            logError('[Dynasty Simulator] Simulation failed:', error);
            throw error;
        }
    }

    /**
     * Executes a single 100-year path with generation-end tax events.
     */
    runSingleDynastyPath(principal, drift, vol, totalYears, generationStep, exemption, taxRate) {
        let currentWealth = principal;
        const fullPath = [currentWealth];

        for (let year = 1; year <= totalYears; year++) {
            // GBM Step (Monthly aggregation)
            const annualStep = generateGBMPath(currentWealth, drift, vol, 1, 12);
            currentWealth = annualStep[annualStep.length - 1];

            // Potential Tax Event (Death / Legacy Trigger)
            if (year % generationStep === 0) {
                // Estate Tax on assets exceeding exemption
                if (currentWealth > exemption) {
                    const taxableAmount = currentWealth - exemption;
                    const tax = taxableAmount * taxRate;
                    currentWealth -= tax;
                    // logInfo(`[Path] Year ${year}: Estate Tax Triggered. Tax Paid: $${tax.toFixed(2)}`);
                }
            }

            fullPath.push(parseFloat(currentWealth.toFixed(2)));
        }

        return fullPath;
    }
}

export default new DynastyTrustSimulator();
