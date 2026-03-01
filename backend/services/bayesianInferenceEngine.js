/**
 * Bayesian Inference Engine for Private Debt Default Prediction
 * Uses Bayesian inference with Beta-Binomial conjugate priors to dynamically
 * update subjective probability of default based on payment history and macro factors
 */

import { db } from '../config/db.js';
import { debtBayesianParams, debts, macroEconomicIndicators } from '../db/schema.js';
import { eq, and,desc } from 'drizzle-orm';
import {
    bayesianUpdate,
    betaMean,
    betaCredibleInterval,
    betaVariance
} from '../utils/probabilisticMath.js';

/**
 * Initialize Bayesian parameters for a new debt
 */
export async function initializeBayesianParams(userId, debtId, options = {}) {
    const {
        priorAlpha = 1.0, // Uninformative prior (Beta(1, 99) ~ 1% base default rate)
        priorBeta = 99.0,
        borrowerCreditSpread = 200, // 200 basis points spread
        borrowerLeverageRatio = 3.0, // 3x leverage
        borrowerInterestCoverageRatio = 5.0 // 5x interest coverage
    } = options;

    // Check if params already exist
    const existing = await db.select()
        .from(debtBayesianParams)
        .where(and(
            eq(debtBayesianParams.userId, userId),
            eq(debtBayesianParams.debtId, debtId)
        ))
        .limit(1);

    if (existing.length > 0) {
        return existing[0];
    }

    // Calculate initial subjective probability of default
    const initialProbability = betaMean(priorAlpha, priorBeta);
    const credibleInterval = betaCredibleInterval(priorAlpha, priorBeta, 0.95);

    // Determine risk tier based on credit metrics
    const riskTier = determineRiskTier(borrowerCreditSpread, borrowerLeverageRatio, borrowerInterestCoverageRatio);

    const params = await db.insert(debtBayesianParams).values({
        userId,
        debtId,
        priorAlpha,
        priorBeta,
        posteriorAlpha: priorAlpha,
        posteriorBeta: priorBeta,
        subjectiveProbabilityOfDefault: initialProbability.toFixed(6),
        credibleInterval95Low: credibleInterval.lower.toFixed(6),
        credibleInterval95High: credibleInterval.upper.toFixed(6),
        onTimePayments: 0,
        latePayments: 0,
        missedPayments: 0,
        avgPaymentVelocity: '1.00',
        borrowerCreditSpread: borrowerCreditSpread.toFixed(4),
        borrowerLeverageRatio: borrowerLeverageRatio.toFixed(4),
        borrowerInterestCoverageRatio: borrowerInterestCoverageRatio.toFixed(4),
        baseRateSensitivity: '0.10', // 10% increase in default probability per 1% rate increase
        gdpGrowthSensitivity: '-0.05', // 5% decrease in default probability per 1% GDP growth
        riskTier,
        confidenceScore: '0.50', // Low confidence initially
        lastUpdated: new Date()
    }).returning();

    return params[0];
}

/**
 * Record payment event and update Bayesian posterior
 */
export async function recordPaymentEvent(userId, debtId, paymentEvent) {
    const {
        paymentType, // 'on_time', 'late', 'missed'
        daysLate = 0,
        expectedDate,
        actualDate
    } = paymentEvent;

    // Get current parameters
    const params = await db.select()
        .from(debtBayesianParams)
        .where(and(
            eq(debtBayesianParams.userId, userId),
            eq(debtBayesianParams.debtId, debtId)
        ))
        .limit(1);

    if (params.length === 0) {
        throw new Error('Bayesian parameters not initialized for this debt');
    }

    const current = params[0];

    // Update payment counts
    let onTimePayments = current.onTimePayments;
    let latePayments = current.latePayments;
    let missedPayments = current.missedPayments;

    let successes = onTimePayments;
    let failures = latePayments + missedPayments;

    if (paymentType === 'on_time') {
        onTimePayments++;
        successes++;
    } else if (paymentType === 'late') {
        latePayments++;
        failures++;
    } else if (paymentType === 'missed') {
        missedPayments++;
        failures += 2; // Weight missed payments more heavily
    }

    // Bayesian update: posterior = prior + evidence
    const { posteriorAlpha, posteriorBeta } = bayesianUpdate(
        parseFloat(current.posteriorAlpha),
        parseFloat(current.posteriorBeta),
        paymentType === 'on_time' ? 1 : 0,
        paymentType === 'late' ? 1 : (paymentType === 'missed' ? 2 : 0)
    );

    // Calculate updated probability
    const updatedProbability = betaMean(posteriorAlpha, posteriorBeta);
    const credibleInterval = betaCredibleInterval(posteriorAlpha, posteriorBeta, 0.95);

    // Calculate payment velocity (actual days / expected days)
    let paymentVelocity = 1.0;
    if (expectedDate && actualDate) {
        const expectedDays = 30; // Assume monthly
        const actualDays = Math.max(1, daysLate + expectedDays);
        paymentVelocity = actualDays / expectedDays;
    }

    // Update average payment velocity
    const totalPayments = onTimePayments + latePayments + missedPayments;
    const currentAvg = parseFloat(current.avgPaymentVelocity);
    const newAvg = ((currentAvg * (totalPayments - 1)) + paymentVelocity) / totalPayments;

    // Increase confidence score with more data points
    const confidenceScore = Math.min(0.95, 0.5 + (totalPayments * 0.02));

    // Update parameters
    const updated = await db.update(debtBayesianParams)
        .set({
            posteriorAlpha: posteriorAlpha.toFixed(4),
            posteriorBeta: posteriorBeta.toFixed(4),
            subjectiveProbabilityOfDefault: updatedProbability.toFixed(6),
            credibleInterval95Low: credibleInterval.lower.toFixed(6),
            credibleInterval95High: credibleInterval.upper.toFixed(6),
            onTimePayments,
            latePayments,
            missedPayments,
            avgPaymentVelocity: newAvg.toFixed(2),
            confidenceScore: confidenceScore.toFixed(2),
            lastPaymentDate: actualDate || new Date(),
            lastUpdated: new Date()
        })
        .where(eq(debtBayesianParams.id, current.id))
        .returning();

    return updated[0];
}

/**
 * Update probability of default based on macro-economic factors
 */
export async function updateWithMacroFactors(userId, debtId) {
    // Get current parameters
    const params = await db.select()
        .from(debtBayesianParams)
        .where(and(
            eq(debtBayesianParams.userId, userId),
            eq(debtBayesianParams.debtId, debtId)
        ))
        .limit(1);

    if (params.length === 0) {
        throw new Error('Bayesian parameters not initialized');
    }

    const current = params[0];

    // Fetch latest macro indicators
    const [fedRate, gdpGrowth, creditSpread] = await Promise.all([
        getMacroIndicator('fed_funds_rate'),
        getMacroIndicator('gdp_growth_rate'),
        getMacroIndicator('credit_spread_investment_grade')
    ]);

    // Base probability from Bayesian posterior
    const baseProbability = parseFloat(current.subjectiveProbabilityOfDefault);

    // Apply macro adjustments
    const baseRateSensitivity = parseFloat(current.baseRateSensitivity) || 0.10;
    const gdpSensitivity = parseFloat(current.gdpGrowthSensitivity) || -0.05;

    // Assume baseline: Fed rate 2.5%, GDP growth 2.5%
    const baselineFedRate = 2.5;
    const baselineGDPGrowth = 2.5;

    const fedRateDelta = (fedRate - baselineFedRate) / 100;
    const gdpGrowthDelta = (gdpGrowth - baselineGDPGrowth) / 100;

    // Adjust probability multiplicatively
    const fedAdjustment = fedRateDelta * baseRateSensitivity;
    const gdpAdjustment = gdpGrowthDelta * gdpSensitivity;

    const adjustedProbability = Math.max(0, Math.min(1, 
        baseProbability * (1 + fedAdjustment + gdpAdjustment)
    ));

    // Update risk tier if needed
    const borrowerCreditSpread = parseFloat(current.borrowerCreditSpread) || 200;
    const borrowerLeverageRatio = parseFloat(current.borrowerLeverageRatio) || 3.0;
    const borrowerInterestCoverageRatio = parseFloat(current.borrowerInterestCoverageRatio) || 5.0;
    const riskTier = determineRiskTier(borrowerCreditSpread, borrowerLeverageRatio, borrowerInterestCoverageRatio, adjustedProbability);

    // Update in database
    const updated = await db.update(debtBayesianParams)
        .set({
            subjectiveProbabilityOfDefault: adjustedProbability.toFixed(6),
            riskTier,
            lastUpdated: new Date(),
            metadata: {
                macroAdjustments: {
                    fedRate,
                    gdpGrowth,
                    creditSpread,
                    fedAdjustment,
                    gdpAdjustment,
                    appliedAt: new Date()
                }
            }
        })
        .where(eq(debtBayesianParams.id, current.id))
        .returning();

    return updated[0];
}

/**
 * Get current macro-economic indicator value
 */
async function getMacroIndicator(indicatorName) {
    const indicators = await db.select()
        .from(macroEconomicIndicators)
        .where(eq(macroEconomicIndicators.indicatorName, indicatorName))
        .orderBy(desc(macroEconomicIndicators.periodDate))
        .limit(1);

    if (indicators.length === 0) {
        // Return baseline if not found
        const baselines = {
            'fed_funds_rate': 2.5,
            'gdp_growth_rate': 2.5,
            'credit_spread_investment_grade': 150,
            'inflation_rate': 2.0
        };
        return baselines[indicatorName] || 0;
    }

    return parseFloat(indicators[0].value);
}

/**
 * Determine risk tier based on credit metrics
 */
function determineRiskTier(creditSpread, leverageRatio, interestCoverageRatio, probabilityOfDefault = null) {
    // If probability provided, use it as primary classifier
    if (probabilityOfDefault !== null) {
        if (probabilityOfDefault < 0.01) return 'investment_grade';
        if (probabilityOfDefault < 0.05) return 'high_yield';
        if (probabilityOfDefault < 0.20) return 'distressed';
        return 'default';
    }

    // Otherwise use credit metrics
    // Investment grade: spread < 250bps, leverage < 3x, coverage > 4x
    if (creditSpread < 250 && leverageRatio < 3.0 && interestCoverageRatio > 4.0) {
        return 'investment_grade';
    }

    // High yield: spread < 500bps, leverage < 5x, coverage > 2x
    if (creditSpread < 500 && leverageRatio < 5.0 && interestCoverageRatio > 2.0) {
        return 'high_yield';
    }

    // Distressed: spread < 1000bps, coverage > 1x
    if (creditSpread < 1000 && interestCoverageRatio > 1.0) {
        return 'distressed';
    }

    return 'default';
}

/**
 * Get Bayesian parameters for a debt
 */
export async function getBayesianParams(userId, debtId) {
    const params = await db.select()
        .from(debtBayesianParams)
        .where(and(
            eq(debtBayesianParams.userId, userId),
            eq(debtBayesianParams.debtId, debtId)
        ))
        .limit(1);

    return params.length > 0 ? params[0] : null;
}

/**
 * Get all debts with their Bayesian parameters for a user
 */
export async function getAllDebtsWithBayesianParams(userId) {
    const results = await db.select()
        .from(debts)
        .leftJoin(debtBayesianParams, eq(debts.id, debtBayesianParams.debtId))
        .where(eq(debts.userId, userId));

    return results.map(row => ({
        debt: row.debts,
        bayesianParams: row.debt_bayesian_params
    }));
}

/**
 * Simulate future default scenarios using Monte Carlo
 */
export async function simulateDefaultScenarios(userId, debtId, horizonMonths = 12, iterations = 1000) {
    const params = await getBayesianParams(userId, debtId);
    if (!params) {
        throw new Error('Bayesian parameters not found');
    }

    const baseProbability = parseFloat(params.subjectiveProbabilityOfDefault);
    const posteriorAlpha = parseFloat(params.posteriorAlpha);
    const posteriorBeta = parseFloat(params.posteriorBeta);

    const scenarios = [];

    for (let i = 0; i < iterations; i++) {
        // Sample from Beta distribution for this scenario's default probability
        const sampledProbability = sampleBeta(posteriorAlpha, posteriorBeta);

        // Simulate month-by-month
        let defaultOccurred = false;
        let monthOfDefault = null;

        for (let month = 1; month <= horizonMonths; month++) {
            if (Math.random() < sampledProbability / 12) { // Monthly default probability
                defaultOccurred = true;
                monthOfDefault = month;
                break;
            }
        }

        scenarios.push({
            iteration: i,
            defaultOccurred,
            monthOfDefault,
            sampledProbability
        });
    }

    const defaultCount = scenarios.filter(s => s.defaultOccurred).length;
    const defaultProbabilityOverHorizon = defaultCount / iterations;

    return {
        horizonMonths,
        iterations,
        defaultProbabilityOverHorizon,
        scenarios: scenarios.slice(0, 100) // Return first 100 for inspection
    };
}

/**
 * Sample from Beta distribution (approximate using acceptance-rejection)
 */
function sampleBeta(alpha, beta) {
    // For simplicity, use mean as approximation
    // In production, implement proper Beta sampling or use library
    return alpha / (alpha + beta);
}

export default {
    initializeBayesianParams,
    recordPaymentEvent,
    updateWithMacroFactors,
    getBayesianParams,
    getAllDebtsWithBayesianParams,
    simulateDefaultScenarios
};
