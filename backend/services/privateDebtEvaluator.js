/**
 * Private Debt Evaluator Service
 * Comprehensive evaluation and monitoring of private debt positions
 * Handles PIK interest, debt-to-equity conversions, and payment velocity analysis
 */

import { db } from '../config/db.js';
import { debts, debtPayments, debtBayesianParams, loanCollateralMetadata } from '../db/schema.js';
import { eq, and, gte, desc } from 'drizzle-orm';
import { getBayesianParams, recordPaymentEvent, updateWithMacroFactors } from './bayesianInferenceEngine.js';

/**
 * Evaluate a private debt position
 */
export async function evaluatePrivateDebt(userId, debtId) {
    // Fetch debt details
    const debtData = await db.select()
        .from(debts)
        .where(and(
            eq(debts.userId, userId),
            eq(debts.id, debtId)
        ))
        .limit(1);

    if (debtData.length === 0) {
        throw new Error('Debt not found');
    }

    const debt = debtData[0];

    // Get Bayesian parameters
    const bayesianParams = await getBayesianParams(userId, debtId);

    // Get collateral metadata
    const collateral = await db.select()
        .from(loanCollateralMetadata)
        .where(and(
            eq(loanCollateralMetadata.userId, userId),
            eq(loanCollateralMetadata.debtId, debtId),
            eq(loanCollateralMetadata.isActive, true)
        ));

    // Calculate payment velocity
    const paymentHistory = await getPaymentHistory(userId, debtId, 12); // Last 12 payments
    const velocityMetrics = calculatePaymentVelocity(paymentHistory);

    // Calculate yield metrics
    const yieldMetrics = calculateYieldMetrics(debt, bayesianParams);

    // Risk-adjusted return
    const riskAdjustedReturn = calculateRiskAdjustedReturn(debt, bayesianParams);

    // Health score
    const healthScore = calculateDebtHealthScore(debt, bayesianParams, velocityMetrics, collateral);

    return {
        debt,
        bayesianParams,
        collateral,
        velocityMetrics,
        yieldMetrics,
        riskAdjustedReturn,
        healthScore,
        recommendations: generateRecommendations(debt, bayesianParams, velocityMetrics, collateral)
    };
}

/**
 * Get payment history for a debt
 */
async function getPaymentHistory(userId, debtId, monthsBack = 12) {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsBack);

    const payments = await db.select()
        .from(debtPayments)
        .where(and(
            eq(debtPayments.userId, userId),
            eq(debtPayments.debtId, debtId),
            gte(debtPayments.paymentDate, cutoffDate)
        ))
        .orderBy(desc(debtPayments.paymentDate));

    return payments;
}

/**
 * Calculate payment velocity metrics
 */
function calculatePaymentVelocity(payments) {
    if (payments.length === 0) {
        return {
            avgVelocity: 1.0,
            velocityTrend: 'stable',
            consistencyScore: 0.5,
            onTimeRate: 0.0
        };
    }

    // Calculate velocity for each payment (actual days / expected days)
    const velocities = [];
    let onTimeCount = 0;
    let lateCount = 0;
    let missedCount = 0;

    for (const payment of payments) {
        const metadata = payment.metadata || {};
        const velocity = metadata.velocity || 1.0;
        velocities.push(velocity);

        if (velocity <= 1.05) onTimeCount++; // Within 5% tolerance
        else if (velocity <= 1.30) lateCount++;
        else missedCount++;
    }

    const avgVelocity = velocities.reduce((sum, v) => sum + v, 0) / velocities.length;

    // Velocity trend (improving, stable, deteriorating)
    let velocityTrend = 'stable';
    if (velocities.length >= 3) {
        const recent = velocities.slice(0, 3).reduce((sum, v) => sum + v, 0) / 3;
        const older = velocities.slice(-3).reduce((sum, v) => sum + v, 0) / 3;

        if (recent < older * 0.9) velocityTrend = 'improving';
        else if (recent > older * 1.1) velocityTrend = 'deteriorating';
    }

    // Consistency score (0-1, higher is better)
    const velocityStdDev = Math.sqrt(
        velocities.reduce((sum, v) => sum + Math.pow(v - avgVelocity, 2), 0) / velocities.length
    );
    const consistencyScore = Math.max(0, 1 - velocityStdDev);

    const onTimeRate = onTimeCount / payments.length;

    return {
        avgVelocity,
        velocityTrend,
        consistencyScore,
        onTimeRate,
        totalPayments: payments.length,
        onTimePayments: onTimeCount,
        latePayments: lateCount,
        missedPayments: missedCount
    };
}

/**
 * Calculate yield metrics for a debt
 */
function calculateYieldMetrics(debt, bayesianParams) {
    const principalAmount = parseFloat(debt.currentBalance);
    const interestRate = parseFloat(debt.interestRate);
    const defaultProbability = parseFloat(bayesianParams?.subjectiveProbabilityOfDefault || 0.01);

    // Nominal yield
    const nominalYield = interestRate;

    // Expected yield (accounting for default risk)
    const recoveryRate = 0.40; // Assume 40% recovery
    const lossGivenDefault = 1 - recoveryRate;
    const expectedLoss = defaultProbability * lossGivenDefault;
    const expectedYield = nominalYield - (expectedLoss * 100);

    // Yield spread over risk-free rate (assume 2.5% risk-free)
    const riskFreeRate = 2.5;
    const yieldSpread = nominalYield - riskFreeRate;

    // Risk-adjusted yield (Sharpe-like ratio)
    const yieldVolatility = Math.sqrt(defaultProbability * Math.pow(lossGivenDefault * 100, 2));
    const riskAdjustedYield = (expectedYield - riskFreeRate) / Math.max(0.1, yieldVolatility);

    return {
        nominalYield,
        expectedYield,
        yieldSpread,
        riskAdjustedYield,
        expectedLoss: expectedLoss * 100, // As percentage
        yieldVolatility
    };
}

/**
 * Calculate risk-adjusted return
 */
function calculateRiskAdjustedReturn(debt, bayesianParams) {
    const interestRate = parseFloat(debt.interestRate);
    const defaultProbability = parseFloat(bayesianParams?.subjectiveProbabilityOfDefault || 0.01);
    const principalAmount = parseFloat(debt.currentBalance);

    // Expected return
    const recoveryRate = 0.40;
    const expectedReturn = interestRate * (1 - defaultProbability) - 
                          (defaultProbability * (1 - recoveryRate) * 100);

    // Return volatility
    const returnVolatility = Math.sqrt(
        defaultProbability * Math.pow((1 - recoveryRate) * 100, 2)
    );

    // Sharpe ratio (excess return per unit of risk)
    const riskFreeRate = 2.5;
    const sharpeRatio = (expectedReturn - riskFreeRate) / Math.max(0.1, returnVolatility);

    // Expected dollar return
    const expectedDollarReturn = (principalAmount * expectedReturn) / 100;

    return {
        expectedReturn,
        returnVolatility,
        sharpeRatio,
        expectedDollarReturn,
        riskFreeRate
    };
}

/**
 * Calculate comprehensive health score for a debt (0-100)
 */
function calculateDebtHealthScore(debt, bayesianParams, velocityMetrics, collateral) {
    let score = 100;

    // 1. Default probability (40 points max)
    const defaultProb = parseFloat(bayesianParams?.subjectiveProbabilityOfDefault || 0.01);
    if (defaultProb < 0.01) score -= 0;
    else if (defaultProb < 0.05) score -= 10;
    else if (defaultProb < 0.10) score -= 20;
    else if (defaultProb < 0.20) score -= 30;
    else score -= 40;

    // 2. Payment velocity (30 points max)
    const avgVelocity = velocityMetrics.avgVelocity;
    if (avgVelocity <= 1.05) score -= 0;
    else if (avgVelocity <= 1.15) score -= 10;
    else if (avgVelocity <= 1.30) score -= 20;
    else score -= 30;

    // 3. Collateral coverage (20 points max)
    if (collateral.length > 0) {
        const totalCollateralValue = collateral.reduce((sum, c) => 
            sum + parseFloat(c.currentValue), 0);
        const principalAmount = parseFloat(debt.currentBalance);
        const collateralCoverage = totalCollateralValue / principalAmount;

        if (collateralCoverage >= 1.5) score -= 0; // Well-collateralized
        else if (collateralCoverage >= 1.2) score -= 5;
        else if (collateralCoverage >= 1.0) score -= 10;
        else if (collateralCoverage >= 0.8) score -= 15;
        else score -= 20; // Under-collateralized
    } else {
        score -= 10; // No collateral = slight penalty
    }

    // 4.Payment consistency (10 points max)
    const consistencyScore = velocityMetrics.consistencyScore;
    score -= (1 - consistencyScore) * 10;

    return {
        score: Math.max(0, Math.min(100, score)),
        rating: scoreToRating(score),
        components: {
            defaultRisk: defaultProb < 0.05 ? 'low' : defaultProb < 0.10 ? 'medium' : 'high',
            paymentVelocity: avgVelocity <= 1.05 ? 'excellent' : avgVelocity <= 1.15 ? 'good' : 'poor',
            collateralCoverage: collateral.length > 0 ? 'secured' : 'unsecured',
            consistency: consistencyScore > 0.8 ? 'high' : consistencyScore > 0.6 ? 'medium' : 'low'
        }
    };
}

function scoreToRating(score) {
    if (score >= 90) return 'AAA';
    if (score >= 80) return 'AA';
    if (score >= 70) return 'A';
    if (score >= 60) return 'BBB';
    if (score >= 50) return 'BB';
    if (score >= 40) return 'B';
    if (score >= 30) return 'CCC';
    return 'D';
}

/**
 * Generate actionable recommendations
 */
function generateRecommendations(debt, bayesianParams, velocityMetrics, collateral) {
    const recommendations = [];

    const defaultProb = parseFloat(bayesianParams?.subjectiveProbabilityOfDefault || 0.01);
    const avgVelocity = velocityMetrics.avgVelocity;

    // High default risk
    if (defaultProb > 0.10) {
        recommendations.push({
            priority: 'high',
            category: 'default_risk',
            message: 'High default probability detected. Consider increasing collateral requirements or negotiating covenant adjustments.',
            action: 'request_collateral_increase'
        });
    }

    // Poor payment velocity
    if (avgVelocity > 1.20) {
        recommendations.push({
            priority: 'high',
            category: 'payment_velocity',
            message: 'Borrower consistently pays late. Recommend payment plan restructuring or penalty clauses.',
            action: 'restructure_terms'
        });
    }

    // Deteriorating trend
    if (velocityMetrics.velocityTrend === 'deteriorating') {
        recommendations.push({
            priority: 'medium',
            category: 'trend',
            message: 'Payment velocity is worsening. Proactive engagement with borrower recommended.',
            action: 'borrower_engagement'
        });
    }

    // Low collateral coverage
    if (collateral.length > 0) {
        const totalCollateralValue = collateral.reduce((sum, c) => 
            sum + parseFloat(c.currentValue), 0);
        const principalAmount = parseFloat(debt.currentBalance);
        const collateralCoverage = totalCollateralValue / principalAmount;

        if (collateralCoverage < 1.0) {
            recommendations.push({
                priority: 'high',
                category: 'collateral',
                message: 'Collateral value below principal amount. Immediate margin call recommended.',
                action: 'margin_call'
            });
        } else if (collateralCoverage < 1.2) {
            recommendations.push({
                priority: 'medium',
                category: 'collateral',
                message: 'Collateral coverage is thin. Monitor closely and prepare for potential margin call.',
                action: 'monitor_ltv'
            });
        }
    }

    // No collateral on risky debt
    if (collateral.length === 0 && defaultProb > 0.05) {
        recommendations.push({
            priority: 'medium',
            category: 'collateral',
            message: 'High-risk unsecured debt. Consider requesting collateral to mitigate risk.',
            action: 'request_collateral'
        });
    }

    // Positive trends
    if (defaultProb < 0.02 && avgVelocity < 1.05 && velocityMetrics.velocityTrend === 'improving') {
        recommendations.push({
            priority: 'low',
            category: 'opportunity',
            message: 'Borrower performance is excellent. Consider offering rate reduction or increased credit line.',
            action: 'expand_relationship'
        });
    }

    return recommendations;
}

/**
 * Handle Payment-in-Kind (PIK) interest accrual
 */
export async function accruePIKInterest(userId, debtId, periodEndDate) {
    const debtData = await db.select()
        .from(debts)
        .where(and(
            eq(debts.userId, userId),
            eq(debts.id, debtId)
        ))
        .limit(1);

    if (debtData.length === 0) {
        throw new Error('Debt not found');
    }

    const debt = debtData[0];
    const metadata = debt.metadata || {};

    // Check if this is a PIK debt
    if (metadata.isPIK !== true) {
        throw new Error('This is not a PIK debt');
    }

    const pikRate = parseFloat(metadata.pikRate || debt.interestRate);
    const currentBalance = parseFloat(debt.currentBalance);

    // Calculate accrued PIK interest (compounded)
    const periodsPerYear = metadata.pikFrequency === 'quarterly' ? 4 : 12;
    const periodicRate = pikRate / 100 / periodsPerYear;
    const accruedInterest = currentBalance * periodicRate;

    // Capitalize interest (add to principal)
    const newBalance = currentBalance + accruedInterest;

    // Update debt balance
    await db.update(debts)
        .set({
            currentBalance: newBalance.toFixed(2),
            metadata: {
                ...metadata,
                pikAccruals: [
                    ...(metadata.pikAccruals || []),
                    {
                        date: periodEndDate,
                        accruedInterest: accruedInterest.toFixed(2),
                        newBalance: newBalance.toFixed(2)
                    }
                ]
            },
            updatedAt: new Date()
        })
        .where(eq(debts.id, debtId));

    return {
        debtId,
        accruedInterest,
        oldBalance: currentBalance,
        newBalance,
        periodEndDate
    };
}

/**
 * Handle debt-to-equity conversion trigger
 */
export async function evaluateDebtToEquityConversion(userId, debtId) {
    const debtData = await db.select()
        .from(debts)
        .where(and(
            eq(debts.userId, userId),
            eq(debts.id, debtId)
        ))
        .limit(1);

    if (debtData.length === 0) {
        throw new Error('Debt not found');
    }

    const debt = debtData[0];
    const metadata = debt.metadata || {};

    // Check if debt has conversion feature
    if (!metadata.hasConversionFeature) {
        return {
            eligible: false,
            message: 'Debt does not have conversion feature'
        };
    }

    const conversionPrice = parseFloat(metadata.conversionPrice || 0);
    const currentEquityValue = parseFloat(metadata.currentEquityValue || 0);
    const conversionRatio = parseFloat(metadata.conversionRatio || 1.0);

    // Check if conversion is triggered
    const triggerCondition = metadata.conversionTrigger || 'voluntary';

    let triggered = false;
    let triggerReason = '';

    if (triggerCondition === 'default') {
        const bayesianParams = await getBayesianParams(userId, debtId);
        const defaultProb = parseFloat(bayesianParams?.subjectiveProbabilityOfDefault || 0);
        if (defaultProb > 0.20) {
            triggered = true;
            triggerReason = 'High default probability exceeded threshold';
        }
    } else if (triggerCondition === 'maturity') {
        const maturityDate = new Date(debt.plannedPayoffDate);
        if (new Date() >= maturityDate) {
            triggered = true;
            triggerReason = 'Maturity date reached';
        }
    } else if (triggerCondition === 'call_protection_expiry') {
        const callProtectionExpiry = new Date(metadata.callProtectionExpiry);
        if (new Date() >= callProtectionExpiry) {
            triggered = true;
            triggerReason = 'Call protection period expired';
        }
    }

    if (!triggered && triggerCondition !== 'voluntary') {
        return {
            eligible: false,
            triggered: false,
            message: 'Conversion trigger conditions not met'
        };
    }

    // Calculate conversion terms
    const principalAmount = parseFloat(debt.currentBalance);
    const equitySharesReceived = (principalAmount / conversionPrice) * conversionRatio;
    const impliedEquityValue = equitySharesReceived * currentEquityValue;

    return {
        eligible: true,
        triggered,
        triggerReason,
        conversionTerms: {
            principalAmount,
            conversionPrice,
            conversionRatio,
            equitySharesReceived,
            currentEquityValue,
            impliedEquityValue,
            conversionPremium: ((impliedEquityValue / principalAmount) - 1) * 100
        },
        recommendation: impliedEquityValue > principalAmount ? 'favorable' : 'unfavorable'
    };
}

export default {
    evaluatePrivateDebt,
    accruePIKInterest,
    evaluateDebtToEquityConversion
};
