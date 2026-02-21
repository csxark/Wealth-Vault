import { eq, and, desc, sql } from 'drizzle-orm';
import db from '../config/db.js';
import { investmentRiskProfiles, users } from '../db/schema.js';
import { logAuditEventAsync, AuditActions, ResourceTypes } from './auditService.js';

/**
 * Risk Profile Service
 * Handles user risk profile management and analysis
 */

/**
 * Calculate risk score based on user's questionnaire answers
 * @param {Object} answers - Risk assessment answers
 * @returns {Object} - Calculated risk score and tolerance
 */
export const calculateRiskScore = (answers) => {
  let score = 0;
  const factors = [];

  // Age factor (younger = higher risk tolerance)
  // Handle both numeric age and string values from questionnaire
  let ageValue = answers.age;
  if (typeof ageValue === 'string') {
    // Convert string values from questionnaire to numeric
    const ageMap = {
      'under_30': 25,
      '30_40': 35,
      '40_55': 47,
      '55_plus': 60
    };
    ageValue = ageMap[ageValue] || parseInt(ageValue) || null;
  }
  
  if (ageValue !== null && ageValue !== undefined) {
    if (ageValue < 30) {
      score += 30;
      factors.push({ factor: 'age', contribution: 30, reason: 'Young investor with long time horizon' });
    } else if (ageValue < 40) {
      score += 25;
      factors.push({ factor: 'age', contribution: 25, reason: 'Moderate age with good time horizon' });
    } else if (ageValue < 55) {
      score += 15;
      factors.push({ factor: 'age', contribution: 15, reason: 'Middle-aged investor' });
    } else {
      score += 5;
      factors.push({ factor: 'age', contribution: 5, reason: 'Approaching retirement' });
    }
  }

  // Investment experience factor
  const experienceScores = {
    beginner: 5,
    intermediate: 15,
    advanced: 25
  };
  score += experienceScores[answers.investmentExperience] || 10;
  factors.push({ 
    factor: 'experience', 
    contribution: experienceScores[answers.investmentExperience] || 10,
    reason: `${answers.investmentExperience || 'unknown'} investment experience`
  });

  // Income stability factor
  if (answers.incomeStability === 'very_stable') {
    score += 20;
    factors.push({ factor: 'income', contribution: 20, reason: 'Very stable income' });
  } else if (answers.incomeStability === 'stable') {
    score += 15;
    factors.push({ factor: 'income', contribution: 15, reason: 'Stable income' });
  } else if (answers.incomeStability === 'variable') {
    score += 5;
    factors.push({ factor: 'income', contribution: 5, reason: 'Variable income' });
  }

  // Emergency fund factor
  if (answers.emergencyFundMonths >= 6) {
    score += 15;
    factors.push({ factor: 'emergency', contribution: 15, reason: 'Strong emergency fund (6+ months)' });
  } else if (answers.emergencyFundMonths >= 3) {
    score += 10;
    factors.push({ factor: 'emergency', contribution: 10, reason: 'Adequate emergency fund (3-6 months)' });
  } else {
    score += 3;
    factors.push({ factor: 'emergency', contribution: 3, reason: 'Limited emergency fund' });
  }

  // Debt level factor
  const debtToIncomeRatio = answers.debtAmount / answers.annualIncome;
  if (debtToIncomeRatio < 0.1) {
    score += 15;
    factors.push({ factor: 'debt', contribution: 15, reason: 'Low debt level' });
  } else if (debtToIncomeRatio < 0.3) {
    score += 10;
    factors.push({ factor: 'debt', contribution: 10, reason: 'Moderate debt level' });
  } else {
    score += 3;
    factors.push({ factor: 'debt', contribution: 3, reason: 'High debt level' });
  }

  // Investment horizon factor
  const horizonScores = {
    short: 5,
    medium: 15,
    long: 25
  };
  score += horizonScores[answers.investmentHorizon] || 10;
  factors.push({ 
    factor: 'horizon', 
    contribution: horizonScores[answers.investmentHorizon] || 10,
    reason: `${answers.investmentHorizon || 'medium'} investment horizon`
  };

  // Loss tolerance factor
  if (answers.canAffordLosses) {
    score += 15;
    factors.push({ factor: 'loss_tolerance', contribution: 15, reason: 'Can afford to lose some investment' });
  } else {
    score += 3;
    factors.push({ factor: 'loss_tolerance', contribution: 3, reason: 'Cannot afford significant losses' });
  }

  // Net worth factor (as a multiplier)
  if (answers.netWorth > 500000) {
    score += 10;
    factors.push({ factor: 'net_worth', contribution: 10, reason: 'High net worth' });
  } else if (answers.netWorth > 100000) {
    score += 7;
    factors.push({ factor: 'net_worth', contribution: 7, reason: 'Medium net worth' });
  }

  // Normalize score to 0-100
  const normalizedScore = Math.min(Math.max(score, 0), 100);

  // Determine risk tolerance category
  let riskTolerance;
  if (normalizedScore >= 70) {
    riskTolerance = 'aggressive';
  } else if (normalizedScore >= 40) {
    riskTolerance = 'moderate';
  } else {
    riskTolerance = 'conservative';
  }

  return {
    score: normalizedScore,
    riskTolerance,
    factors,
    recommendation: getRiskRecommendation(riskTolerance, normalizedScore)
  };
};

/**
 * Get risk recommendation based on tolerance
 */
const getRiskRecommendation = (riskTolerance, score) => {
  const recommendations = {
    conservative: {
      allocation: {
        stocks: 25,
        bonds: 50,
        cash: 15,
        alternatives: 10
      },
      description: 'Focus on capital preservation with lower risk investments',
      suitableFor: 'Short-term goals, near-retirement investors, low risk tolerance'
    },
    moderate: {
      allocation: {
        stocks: 50,
        bonds: 35,
        cash: 10,
        alternatives: 5
      },
      description: 'Balance between growth and stability',
      suitableFor: 'Medium-term goals, investors with moderate risk tolerance'
    },
    aggressive: {
      allocation: {
        stocks: 75,
        bonds: 15,
        cash: 5,
        alternatives: 5
      },
      description: 'Focus on long-term growth with higher risk tolerance',
      suitableFor: 'Long-term goals, young investors, high risk tolerance'
    }
  };

  return recommendations[riskTolerance] || recommendations.moderate;
};

/**
 * Create or update a risk profile
 * @param {string} userId - User ID
 * @param {Object} profileData - Risk profile data
 * @returns {Promise<Object>} - Created/updated risk profile
 */
export const createOrUpdateRiskProfile = async (userId, profileData) => {
  try {
    // Check if profile exists
    const existingProfile = await getRiskProfile(userId);

    // Calculate risk score
    const riskAnalysis = calculateRiskScore(profileData);

    const profileValues = {
      userId,
      riskScore: riskAnalysis.score,
      riskTolerance: riskAnalysis.riskTolerance,
      investmentHorizon: profileData.investmentHorizon || 'medium',
      investmentExperience: profileData.investmentExperience || 'intermediate',
      annualIncome: profileData.annualIncome?.toString() || '0',
      netWorth: profileData.netWorth?.toString() || '0',
      liquidAssets: profileData.liquidAssets?.toString() || '0',
      emergencyFundMonths: profileData.emergencyFundMonths || 3,
      primaryGoal: profileData.primaryGoal || 'growth',
      retirementAge: profileData.retirementAge,
      targetRetirementAmount: profileData.targetRetirementAmount?.toString(),
      monthlyInvestmentCapacity: profileData.monthlyInvestmentCapacity?.toString() || '0',
      hasDebt: profileData.hasDebt || false,
      debtAmount: profileData.debtAmount?.toString() || '0',
      hasDependents: profileData.hasDependents || false,
      dependentCount: profileData.dependentCount || 0,
      hasOtherIncome: profileData.hasOtherIncome || false,
      otherIncomeMonthly: profileData.otherIncomeMonthly?.toString() || '0',
      understandsMarketVolatility: profileData.understandsMarketVolatility || false,
      canAffordLosses: profileData.canAffordLosses || false,
      maxLossTolerance: profileData.maxLossTolerance?.toString() || '0',
      assessmentDate: new Date(),
      lastUpdated: new Date(),
      isActive: true,
      metadata: {
        factors: riskAnalysis.factors,
        recommendation: riskAnalysis.recommendation
      }
    };

    let profile;
    if (existingProfile) {
      // Update existing profile
      [profile] = await db
        .update(investmentRiskProfiles)
        .set({
          ...profileValues,
          updatedAt: new Date()
        })
        .where(eq(investmentRiskProfiles.userId, userId))
        .returning();
    } else {
      // Create new profile
      [profile] = await db
        .insert(investmentRiskProfiles)
        .values({
          ...profileValues,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
    }

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: existingProfile ? AuditActions.UPDATE : AuditActions.CREATE,
      resourceType: ResourceTypes.RISK_PROFILE,
      resourceId: profile.id,
      metadata: {
        riskScore: profile.riskScore,
        riskTolerance: profile.riskTolerance
      },
      status: 'success'
    });

    return {
      ...profile,
      riskAnalysis
    };
  } catch (error) {
    console.error('Error creating/updating risk profile:', error);
    throw error;
  }
};

/**
 * Get risk profile for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} - Risk profile or null
 */
export const getRiskProfile = async (userId) => {
  try {
    const [profile] = await db
      .select()
      .from(investmentRiskProfiles)
      .where(
        and(
          eq(investmentRiskProfiles.userId, userId),
          eq(investmentRiskProfiles.isActive, true)
        )
      )
      .orderBy(desc(investmentRiskProfiles.assessmentDate))
      .limit(1);

    return profile || null;
  } catch (error) {
    console.error('Error fetching risk profile:', error);
    throw error;
  }
};

/**
 * Get risk profile with analysis
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Risk profile with analysis
 */
export const getRiskProfileWithAnalysis = async (userId) => {
  try {
    const profile = await getRiskProfile(userId);
    
    if (!profile) {
      return {
        hasProfile: false,
        message: 'No risk profile found. Please complete the risk assessment.'
      };
    }

    // Get user info for additional context
    const [user] = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        ageGroup: users.ageGroup,
        monthlyIncome: users.monthlyIncome
      })
      .from(users)
      .where(eq(users.id, userId));

    return {
      hasProfile: true,
      profile,
      userContext: user,
      analysis: {
        score: profile.riskScore,
        tolerance: profile.riskTolerance,
        recommendation: profile.metadata?.recommendation || getRiskRecommendation(profile.riskTolerance, profile.riskScore),
        factors: profile.metadata?.factors || []
      }
    };
  } catch (error) {
    console.error('Error getting risk profile with analysis:', error);
    throw error;
  }
};

/**
 * Compare current allocation with recommended allocation
 * @param {string} userId - User ID
 * @param {Object} currentAllocation - Current portfolio allocation
 * @returns {Promise<Object>} - Comparison and recommendations
 */
export const compareWithRecommendedAllocation = async (userId, currentAllocation) => {
  try {
    const profile = await getRiskProfile(userId);
    
    if (!profile) {
      throw new Error('No risk profile found. Please complete the risk assessment first.');
    }

    const recommended = profile.metadata?.recommendation || getRiskRecommendation(profile.riskTolerance, profile.riskScore);
    
    const comparisons = [];
    const allocationTypes = ['stocks', 'bonds', 'cash', 'alternatives'];
    
    for (const type of allocationTypes) {
      const current = currentAllocation[type] || 0;
      const recommended_value = recommended.allocation[type] || 0;
      const difference = current - recommended_value;
      
      comparisons.push({
        assetClass: type,
        current,
        recommended: recommended_value,
        difference,
        status: Math.abs(difference) < 5 ? 'balanced' : difference > 0 ? 'overweight' : 'underweight'
      });
    }

    const rebalancingNeeded = comparisons.some(c => Math.abs(c.difference) > 10);

    return {
      currentAllocation,
      recommendedAllocation: recommended.allocation,
      comparisons,
      rebalancingNeeded,
      riskTolerance: profile.riskTolerance,
      overallRecommendation: getRebalancingRecommendation(comparisons, profile.riskTolerance)
    };
  } catch (error) {
    console.error('Error comparing allocations:', error);
    throw error;
  }
};

/**
 * Get rebalancing recommendation based on allocation comparison
 */
const getRebalancingRecommendation = (comparisons, riskTolerance) => {
  const overweight = comparisons.filter(c => c.status === 'overweight');
  const underweight = comparisons.filter(c => c.status === 'underweight');

  if (overweight.length === 0 && underweight.length === 0) {
    return {
      action: 'maintain',
      message: 'Your portfolio is well-aligned with your risk profile. Keep up the good work!'
    };
  }

  const actions = [];
  
  if (overweight.length > 0) {
    actions.push(`Consider reducing: ${overweight.map(o => `${o.assetClass} (${o.difference > 0 ? '+' : ''}${o.difference}%)`).join(', ')}`);
  }
  
  if (underweight.length > 0) {
    actions.push(`Consider increasing: ${underweight.map(u => `${u.assetClass} (${u.difference > 0 ? '+' : ''}${u.difference}%)`).join(', ')}`);
  }

  return {
    action: 'rebalance',
    message: actions.join('. '),
    priority: comparisons.some(c => Math.abs(c.difference) > 15) ? 'high' : 'medium'
  };
};

/**
 * Get risk assessment questions
 * @returns {Array} - List of questions for risk assessment
 */
export const getRiskAssessmentQuestions = () => {
  return [
    {
      id: 'age',
      question: 'What is your age?',
      type: 'select',
      options: [
        { value: 'under_30', label: 'Under 30' },
        { value: '30_40', label: '30-39' },
        { value: '40_55', label: '40-55' },
        { value: '55_plus', label: '55 or older' }
      ]
    },
    {
      id: 'investmentExperience',
      question: 'How would you describe your investment experience?',
      type: 'select',
      options: [
        { value: 'beginner', label: 'Beginner - New to investing' },
        { value: 'intermediate', label: 'Intermediate - Some experience' },
        { value: 'advanced', label: 'Advanced - Extensive experience' }
      ]
    },
    {
      id: 'investmentHorizon',
      question: 'When do you plan to withdraw this investment?',
      type: 'select',
      options: [
        { value: 'short', label: 'Less than 3 years' },
        { value: 'medium', label: '3-10 years' },
        { value: 'long', label: '10+ years' }
      ]
    },
    {
      id: 'incomeStability',
      question: 'How would you describe your income stability?',
      type: 'select',
      options: [
        { value: 'very_stable', label: 'Very stable (permanent job, steady income)' },
        { value: 'stable', label: 'Stable (stable job with some variability)' },
        { value: 'variable', label: 'Variable (freelance, commission-based, etc.)' }
      ]
    },
    {
      id: 'emergencyFundMonths',
      question: 'How many months of living expenses do you have in emergency savings?',
      type: 'select',
      options: [
        { value: 0, label: 'Less than 1 month' },
        { value: 1, label: '1-2 months' },
        { value: 3, label: '3-6 months' },
        { value: 6, label: '6+ months' }
      ]
    },
    {
      id: 'annualIncome',
      question: 'What is your annual income?',
      type: 'number',
      placeholder: 'Enter your annual income'
    },
    {
      id: 'netWorth',
      question: 'What is your estimated net worth?',
      type: 'number',
      placeholder: 'Enter your net worth (assets - liabilities)'
    },
    {
      id: 'debtAmount',
      question: 'What is your total debt?',
      type: 'number',
      placeholder: 'Enter total debt amount'
    },
    {
      id: 'canAffordLosses',
      question: 'Can you afford to lose some or all of this investment?',
      type: 'boolean',
      yesLabel: 'Yes, I can afford losses',
      noLabel: 'No, I cannot afford losses'
    },
    {
      id: 'understandsMarketVolatility',
      question: 'Do you understand that investments can go up and down in value?',
      type: 'boolean',
      yesLabel: 'Yes, I understand',
      noLabel: 'No, I do not understand'
    },
    {
      id: 'primaryGoal',
      question: 'What is your primary investment goal?',
      type: 'select',
      options: [
        { value: 'growth', label: 'Long-term growth' },
        { value: 'income', label: 'Generate income' },
        { value: 'preservation', label: 'Preserve capital' },
        { value: 'balanced', label: 'Balanced growth and income' }
      ]
    },
    {
      id: 'hasDependents',
      question: 'Do you have dependents (children, elderly parents, etc.)?',
      type: 'boolean',
      yesLabel: 'Yes, I have dependents',
      noLabel: 'No, I do not have dependents'
    },
    {
      id: 'retirementAge',
      question: 'At what age do you plan to retire?',
      type: 'number',
      placeholder: 'Enter target retirement age'
    }
  ];
};

export default {
  createOrUpdateRiskProfile,
  getRiskProfile,
  getRiskProfileWithAnalysis,
  compareWithRecommendedAllocation,
  calculateRiskScore,
  getRiskAssessmentQuestions
};
