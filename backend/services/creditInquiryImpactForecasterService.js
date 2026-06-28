const db = require('../database/db');

// Helper utilities
const toNumber = (val) => {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
};

const roundMoney = (amount) => Math.round(toNumber(amount) * 100) / 100;

const roundPercent = (percent) => {
  const p = Math.max(0, Math.min(100, toNumber(percent)));
  return Math.round(p * 100) / 100;
};

const clamp = (val, min, max) => Math.max(min, Math.min(max, toNumber(val)));

/**
 * Credit Inquiry Impact Forecaster
 * Analyzes credit inquiry impact on credit score and borrowing rates:
 * - Models credit score drop per inquiry (5-10 points, varies by tier)
 * - Forecasts score recovery timeline (6-12 months stabilize, 24 months disappear)
 * - Calculates rate-shopping breakeven (inquiry cost vs interest savings)
 * - Predicts offer eligibility changes (score drop affects APR tier)
 * - Identifies safe inquiry windows (batch inquiries, avoid peak damage)
 * - Simulates portfolio score impact (multiple accounts)
 * - Recommends optimal inquiry count before diminishing returns
 */
class CreditInquiryImpactForecasterService {
  /**
   * Determine credit score tier
   */
  getScoreTier(creditScore) {
    const score = toNumber(creditScore);
    if (score >= 750) return 'exceptional'; // 750+
    if (score >= 700) return 'very-good'; // 700-749
    if (score >= 650) return 'good'; // 650-699
    if (score >= 600) return 'fair'; // 600-649
    return 'poor'; // <600
  }

  /**
   * Calculate credit score drop per inquiry based on tier
   */
  calculateScoreDrop(currentScore, inquiryCount = 1) {
    const tier = this.getScoreTier(currentScore);
    
    // Score drop per inquiry varies by tier
    // Exceptional tier: least impact (5 pts) - already has great credit
    // Poor tier: most impact (10 pts) - inquiry signals risk
    const dropPerInquiry = {
      'exceptional': 3,  // 3 points per inquiry
      'very-good': 4,    // 4 points per inquiry
      'good': 6,         // 6 points per inquiry
      'fair': 8,         // 8 points per inquiry
      'poor': 10         // 10 points per inquiry
    };

    const dropAmount = dropPerInquiry[tier] || 5;
    const totalDrop = dropAmount * inquiryCount;

    return {
      scoreDropPerInquiry: dropAmount,
      totalScoreDrop: totalDrop,
      projectedScore: Math.max(300, currentScore - totalDrop),
      scoreTier: tier
    };
  }

  /**
   * Forecast score recovery timeline (inquiries fade over time)
   */
  forecastScoreRecovery(currentScore, inquiryCount = 1) {
    const { totalScoreDrop, projectedScore } = this.calculateScoreDrop(currentScore, inquiryCount);

    // Recovery timeline based on inquiry impact
    // Soft rule: Hard inquiries fade gradually
    // - 3 months: 30% recovery (inquiry impact down to 70%)
    // - 6 months: 60% recovery (stabilize after 6 months)
    // - 12 months: 80% recovery (mostly gone, slight residual)
    // - 24 months: 100% recovery (completely removed from report)

    const recoveryTimeline = [];
    const recoveryRates = [
      { month: 3, recoveryPercent: 0.30 },
      { month: 6, recoveryPercent: 0.60 },
      { month: 12, recoveryPercent: 0.80 },
      { month: 24, recoveryPercent: 1.00 }
    ];

    for (const { month, recoveryPercent } of recoveryRates) {
      const recoveredPoints = Math.round(totalScoreDrop * recoveryPercent);
      const recoveredScore = Math.min(currentScore, projectedScore + recoveredPoints);

      recoveryTimeline.push({
        month,
        year: Math.ceil(month / 12),
        recoveryPercent: roundPercent(recoveryPercent * 100),
        recoveredPoints,
        estimatedScore: Math.round(recoveredScore),
        milestone: month === 6 ? 'Stabilized' : month === 24 ? 'Complete' : null
      });
    }

    return {
      startingScore: currentScore,
      projectedScore: Math.round(projectedScore),
      totalScoreDrop,
      recoveryTimeline
    };
  }

  /**
   * Get APR range for credit score tier
   */
  getAPRRangeForTier(creditScore) {
    const tier = this.getScoreTier(creditScore);
    
    const aprRanges = {
      'exceptional': { min: 3.0, max: 5.5, average: 4.25 }, // 750+
      'very-good': { min: 5.5, max: 7.5, average: 6.5 },     // 700-749
      'good': { min: 7.5, max: 10.5, average: 9.0 },         // 650-699
      'fair': { min: 10.5, max: 14.0, average: 12.25 },      // 600-649
      'poor': { min: 14.0, max: 21.0, average: 17.5 }        // <600
    };

    return aprRanges[tier] || { min: 10, max: 21, average: 15.5 };
  }

  /**
   * Predict APR tier after inquiries (do score drop push into worse tier?)
   */
  predictAPRAfterInquiry(currentScore, inquiryCount = 1, currentAPR = 0) {
    const { projectedScore, totalScoreDrop } = this.calculateScoreDrop(currentScore, inquiryCount);
    const currentTier = this.getScoreTier(currentScore);
    const projectedTier = this.getScoreTier(projectedScore);
    const currentAPRRange = this.getAPRRangeForTier(currentScore);
    const projectedAPRRange = this.getAPRRangeForTier(projectedScore);

    // Assume applicant would get average APR for their tier
    const currentAPRExpected = currentAPR || currentAPRRange.average;
    const projectedAPRExpected = projectedAPRRange.average;
    const aprIncrease = roundPercent(projectedAPRExpected - currentAPRExpected);

    return {
      currentScore: currentScore,
      currentTier: currentTier,
      currentAPRRange: currentAPRRange,
      currentAPRExpected: roundPercent(currentAPRExpected),
      projectedScore: Math.round(projectedScore),
      projectedTier: projectedTier,
      projectedAPRRange: projectedAPRRange,
      projectedAPRExpected: roundPercent(projectedAPRExpected),
      aprIncrease,
      tierDropped: currentTier !== projectedTier,
      tierDroppedFrom: currentTier,
      tierDroppedTo: projectedTier
    };
  }

  /**
   * Calculate rate-shopping breakeven: inquiry cost vs interest savings
   */
  calculateRateShoppingBreakeven(currentScore, inquiryCount, debtBalance, currentAPR, timelineYears = 5) {
    const aprPrediction = this.predictAPRAfterInquiry(currentScore, inquiryCount, currentAPR);
    
    // Assume someone in better rate tier gets 1-3% better APR from rate shopping
    // This is optimistic; actual savings depend on shopping effort
    const optimisticAPRImprovement = 2.0; // 2% better APR from rate shopping
    const newAPRIfSuccessful = Math.max(0, currentAPR - optimisticAPRImprovement);

    // Calculate interest paid over timeline at current APR
    let balanceCurrent = debtBalance;
    let totalInterestCurrent = 0;
    const monthlyRate = currentAPR / 100 / 12;
    const monthsTimeline = timelineYears * 12;
    const monthlyPayment = (balanceCurrent * monthlyRate * Math.pow(1 + monthlyRate, monthsTimeline)) /
                          (Math.pow(1 + monthlyRate, monthsTimeline) - 1);

    for (let month = 1; month <= monthsTimeline; month++) {
      const interest = balanceCurrent * monthlyRate;
      totalInterestCurrent += interest;
      balanceCurrent = Math.max(0, balanceCurrent + interest - monthlyPayment);
    }

    // Calculate interest paid if rate shopping successful
    let balanceNew = debtBalance;
    let totalInterestNew = 0;
    const monthlyRateNew = newAPRIfSuccessful / 100 / 12;
    const monthlyPaymentNew = (balanceNew * monthlyRateNew * Math.pow(1 + monthlyRateNew, monthsTimeline)) /
                              (Math.pow(1 + monthlyRateNew, monthsTimeline) - 1);

    for (let month = 1; month <= monthsTimeline; month++) {
      const interest = balanceNew * monthlyRateNew;
      totalInterestNew += interest;
      balanceNew = Math.max(0, balanceNew + interest - monthlyPaymentNew);
    }

    const interestSavings = roundMoney(totalInterestCurrent - totalInterestNew);
    
    // Inquiry "cost" = higher APR due to score drop
    let balanceWithDroppedScore = debtBalance;
    let totalInterestWithDroppedScore = 0;
    const monthlyRateDropped = aprPrediction.projectedAPRExpected / 100 / 12;
    const monthlyPaymentDropped = (balanceWithDroppedScore * monthlyRateDropped * Math.pow(1 + monthlyRateDropped, monthsTimeline)) /
                                 (Math.pow(1 + monthlyRateDropped, monthsTimeline) - 1);

    for (let month = 1; month <= monthsTimeline; month++) {
      const interest = balanceWithDroppedScore * monthlyRateDropped;
      totalInterestWithDroppedScore += interest;
      balanceWithDroppedScore = Math.max(0, balanceWithDroppedScore + interest - monthlyPaymentDropped);
    }

    const inquiryCost = roundMoney(totalInterestWithDroppedScore - totalInterestCurrent);

    // Breakeven calculation
    const netBenefit = roundMoney(interestSavings - inquiryCost);
    const breakevenInquiries = inquiryCost > 0 ? Math.ceil(inquiryCost / interestSavings) : 0;

    return {
      debtBalance,
      currentAPR: roundPercent(currentAPR),
      timelineYears,
      interestAtCurrentAPR: roundMoney(totalInterestCurrent),
      optimisticAPRImprovement,
      newAPRIfSuccessful: roundPercent(newAPRIfSuccessful),
      interestSavingsFromRateShopping: roundMoney(interestSavings),
      aprAfterScoreDrop: roundPercent(aprPrediction.projectedAPRExpected),
      interestWithDroppedScore: roundMoney(totalInterestWithDroppedScore),
      inquiryCost: inquiryCost,
      netBenefit: netBenefit,
      worthIt: netBenefit > 0,
      recommendation: netBenefit > 100
        ? `Rate shopping saves $${netBenefit} after inquiry cost - GO FOR IT`
        : netBenefit > 0
        ? `Marginal benefit of $${netBenefit} - shop only if high confidence in rate improvement`
        : `Inquiry cost ($${Math.abs(inquiryCost)}) exceeds savings potential - SKIP`
    };
  }

  /**
   * Recommend safe inquiry windows
   */
  recommendInquiryWindows(currentScore, inquiryCount = 1) {
    const { totalScoreDrop } = this.calculateScoreDrop(currentScore, inquiryCount);
    
    const recommendations = [];

    // Window 1: Batch inquiries (all together)
    if (inquiryCount > 1) {
      recommendations.push({
        window: 'Batch All Inquiries',
        duration: '30 days',
        impact: `${inquiryCount} hard inquiries = ${totalScoreDrop} point drop`,
        rationale: 'Credit bureaus treat multiple inquiries for same loan type (e.g., auto) within 45 days as 1 inquiry',
        benefit: 'Minimize cumulative damage by shopping within 30-45 day window',
        recoveryTimeline: '6 months to stabilize, 12 months mostly recovered'
      });
    }

    // Window 2: Wait for recovery
    recommendations.push({
      window: 'After Complete Recovery',
      duration: '24 months',
      impact: '0 point drop (inquiry aged off report)',
      rationale: 'Hard inquiries disappear from credit report after 24 months',
      benefit: 'No score impact if you can wait 2 years',
      recoveryTimeline: 'Not applicable - previous inquiry gone'
    });

    // Window 3: During low-pressure period
    recommendations.push({
      window: 'During Financial Stability',
      duration: 'Ongoing',
      impact: `${totalScoreDrop} point drop`,
      rationale: 'If you are not applying for new credit soon anyway',
      benefit: 'Score damage occurs when already not shopping (minimal opportunity cost)',
      recoveryTimeline: 'Recovers while you pay down current debts'
    });

    return recommendations;
  }

  /**
   * Simulate portfolio score impact (multiple inquiries across accounts)
   */
  simulatePortfolioImpact(currentScore, inquiryScenarios = []) {
    // inquiryScenarios format: [
    //   { accountType: 'mortgage', count: 3 },
    //   { accountType: 'auto', count: 2 },
    //   { accountType: 'creditcard', count: 5 }
    // ]

    const scenarios = [];

    for (const scenario of inquiryScenarios) {
      const { accountType, count } = scenario;
      
      // Same-type inquiries within 45 days may count as 1 (for mortgage/auto)
      // Credit cards typically each count as separate
      let effectiveCount = count;
      if (['mortgage', 'auto'].includes(accountType)) {
        effectiveCount = 1; // Bundled as 1 inquiry
      }

      const impact = this.calculateScoreDrop(currentScore, effectiveCount);
      const recovery = this.forecastScoreRecovery(currentScore, effectiveCount);

      scenarios.push({
        accountType,
        inquiriesSubmitted: count,
        effectiveInquiries: effectiveCount,
        scoreDrop: impact.totalScoreDrop,
        projectedScore: impact.projectedScore,
        recoveryTimeline: recovery.recoveryTimeline
      });
    }

    // Calculate cumulative impact
    const totalInquiries = inquiryScenarios.reduce((sum, s) => sum + (s.count || 0), 0);
    const totalEffectiveInquiries = scenarios.reduce((sum, s) => sum + s.effectiveInquiries, 0);
    const maxScoreDrop = Math.max(...scenarios.map(s => s.scoreDrop));
    const cumulativeScore = currentScore - maxScoreDrop; // Worst case is worst drop

    return {
      currentScore,
      scenarios,
      totalInquiriesSubmitted: totalInquiries,
      totalEffectiveInquiries,
      maxScoreDrop,
      estimatedScoreAfterAllInquiries: Math.max(300, cumulativeScore),
      recommendation: totalEffectiveInquiries > 3 
        ? 'High frequency inquiry shopping - score will drop significantly. Batch if possible.'
        : totalEffectiveInquiries > 1
        ? 'Moderate inquiry volume - spread 30+ days apart or batch within 45 days'
        : 'Single or minimal inquiries - proceed normally'
    };
  }

  /**
   * Identify optimal # of inquiries before diminishing returns
   */
  identifyOptimalInquiryCount(currentScore, debtBalance, currentAPR) {
    const results = [];

    // Test 0-5 inquiries
    for (let count = 0; count <= 5; count++) {
      const scoreDrop = this.calculateScoreDrop(currentScore, count);
      const aprImpact = this.predictAPRAfterInquiry(currentScore, count, currentAPR);
      const breakeven = this.calculateRateShoppingBreakeven(currentScore, count, debtBalance, currentAPR);

      // Diminishing returns: each additional inquiry has less marginal benefit
      const marginalbenefit = count === 0 ? 0 : breakeven.netBenefit;
      
      results.push({
        inquiryCount: count,
        scoreDrop: scoreDrop.totalScoreDrop,
        projectedScore: Math.round(scoreDrop.projectedScore),
        aprImpact: roundPercent(aprImpact.aprIncrease),
        netBenefit: breakeven.netBenefit,
        worthIt: breakeven.worthIt,
        recommendation: count === 0 
          ? 'Skip rate shopping'
          : breakeven.worthIt
          ? `Worth it - net benefit $${breakeven.netBenefit}`
          : `Not worth it - net cost $${Math.abs(breakeven.netBenefit)}`
      });
    }

    // Find sweet spot
    const optimalInquiries = results.filter(r => r.worthIt);
    const sweetSpot = optimalInquiries.length > 0 
      ? optimalInquiries[optimalInquiries.length - 1] // Last positive benefit
      : results[0]; // If all negative, skip rate shopping

    return {
      resultsByInquiryCount: results,
      sweetSpot: {
        inquiryCount: sweetSpot.inquiryCount,
        maxNetBenefit: sweetSpot.netBenefit,
        scoreDrop: sweetSpot.scoreDrop,
        projectedScore: sweetSpot.projectedScore,
        rationale: sweetSpot.inquiryCount === 0 
          ? 'Rate shopping not worth the score damage'
          : `Shop with up to ${sweetSpot.inquiryCount} lenders - beyond that diminishing returns`
      }
    };
  }

  /**
   * Main orchestrator: Forecast credit inquiry impact
   */
  forecast(currentScore, queryParams = {}) {
    const score = clamp(toNumber(currentScore), 300, 850);

    if (score < 300 || score > 850) {
      return { error: 'Credit score must be between 300 and 850' };
    }

    // Optional parameters
    const inquiryCount = clamp(toNumber(queryParams.inquiryCount), 0, 10);
    const debtBalance = roundMoney(queryParams.debtBalance || 0);
    const currentAPR = roundPercent(queryParams.currentAPR || 0);
    const inquiryType = queryParams.inquiryType || 'auto'; // auto, mortgage, creditcard
    const portFolioScenarios = queryParams.portfolioScenarios || [];

    // Score drop from inquiries
    const scoreDrop = this.calculateScoreDrop(score, inquiryCount);

    // Recovery forecast
    const recovery = this.forecastScoreRecovery(score, inquiryCount);

    // APR impact
    const aprImpact = this.predictAPRAfterInquiry(score, inquiryCount, currentAPR);

    // Rate-shopping breakeven
    const breakeven = debtBalance > 0 && currentAPR > 0
      ? this.calculateRateShoppingBreakeven(score, inquiryCount, debtBalance, currentAPR)
      : null;

    // Safe inquiry windows
    const safeWindows = this.recommendInquiryWindows(score, inquiryCount);

    // Portfolio impact (if scenarios provided)
    const portfolioImpact = portFolioScenarios.length > 0
      ? this.simulatePortfolioImpact(score, portFolioScenarios)
      : null;

    // Optimal inquiry count
    const optimalCount = debtBalance > 0 && currentAPR > 0
      ? this.identifyOptimalInquiryCount(score, debtBalance, currentAPR)
      : null;

    return {
      currentScore: score,
      currentTier: this.getScoreTier(score),
      inquiryScenario: {
        inquiryCount,
        inquiryType
      },
      scoreDrop: {
        scoreDropPerInquiry: scoreDrop.scoreDropPerInquiry,
        totalScoreDrop: scoreDrop.totalScoreDrop,
        projectedScore: scoreDrop.projectedScore,
        scoreAfterInquiry: scoreDrop.projectedScore
      },
      recoveryForecast: recovery,
      aprImpact,
      rateShoppingBreakeven: breakeven,
      safeInquiryWindows: safeWindows,
      portfolioImpact,
      optimalInquiryCount: optimalCount,
      summary: {
        totalScoreDrop: scoreDrop.totalScoreDrop,
        scoreStabilizationMonth: 6,
        scoreRecoveryMonth: 24,
        aprIncreaseFromInquiry: roundPercent(aprImpact.aprIncrease),
        rateShoppingWorthIt: breakeven?.worthIt || false,
        recommendation: inquiryCount === 0
          ? 'No inquiries - proceed with current rate'
          : breakeven?.worthIt
          ? `${inquiryCount} inquiries worthwhile - potential savings $${breakeven.netBenefit}`
          : `${inquiryCount} inquiries not recommended - inquiry damage exceeds savings`
      }
    };
  }
}

module.exports = new CreditInquiryImpactForecasterService();
