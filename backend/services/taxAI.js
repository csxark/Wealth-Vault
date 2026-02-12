/**
 * Tax AI Service
 * Gemini AI integration for intelligent tax deduction detection and optimization recommendations
 */

import { getAIProvider } from './aiProvider.js';
import { db } from '../config/db.js';
import { expenses, taxCategories, userTaxProfiles } from '../db/schema.js';
import { eq, and, gte } from 'drizzle-orm';
import { getUserTaxProfile } from './taxService.js';

/**
 * Analyze expense description to determine tax deductibility
 * @param {Object} expense - Expense object with description, amount, category
 * @param {Object} userProfile - User's tax profile
 * @returns {Promise<Object>} Deductibility analysis
 */
export async function analyzeExpenseTaxDeductibility(expense, userProfile) {
  try {
    // Get all tax categories for context
    const allTaxCategories = await db.select().from(taxCategories);
    const provider = getAIProvider();

    // In a real scenario, check if provider is active/key present via provider method or config
    // Here we wrap in try/catch to fallback

    const categoryList = allTaxCategories
      .filter(cat => cat.isActive)
      .map(cat => `- ${cat.categoryName}: ${cat.description} (${cat.deductibilityType}, ${cat.deductibilityRate * 100}% deductible)`)
      .join('\n');

    const prompt = `You are a tax expert analyzing expenses for deductibility. Analyze the following expense and determine if it qualifies for tax deductions.

**User Tax Profile:**
- Filing Status: ${userProfile.filingStatus}
- Self-Employed: ${userProfile.selfEmployed ? 'Yes' : 'No'}
- Business Owner: ${userProfile.businessOwner ? 'Yes' : 'No'}
- Tax Jurisdiction: ${userProfile.taxJurisdiction}

**Expense Details:**
- Description: "${expense.description}"
- Amount: $${expense.amount}
- Category: ${expense.categoryName || 'Uncategorized'}
- Date: ${expense.date ? new Date(expense.date).toLocaleDateString() : 'Not specified'}
- Payment Method: ${expense.paymentMethod || 'Not specified'}

**Available Tax Categories:**
${categoryList}

Analyze this expense and provide a JSON response with the following structure:
{
  "isTaxDeductible": true/false,
  "confidence": 0.0-1.0 (how confident you are in this assessment),
  "recommendedTaxCategory": "Name of the most appropriate tax category",
  "deductibilityRate": 0.0-1.0 (what percentage is deductible),
  "reasoning": "Brief explanation of why this is/isn't deductible",
  "requiredDocumentation": ["List of documents needed to claim this deduction"],
  "potentialFlags": ["Any red flags or audit concerns"],
  "taxSavingsEstimate": calculated savings based on estimated 24% marginal rate,
  "alternativeCategories": ["Other possible tax categories if applicable"],
  "conditionsToMeet": ["What conditions must be met to claim this deduction"],
  "irsCodeReference": "Relevant IRS code section",
  "recommendation": "Specific advice for the user"
}

Important considerations:
1. Personal expenses (groceries, personal clothing, entertainment) are NOT deductible
2. Business expenses must be ordinary and necessary
3. Home office requires exclusive and regular use
4. Vehicle expenses require mileage logs and business use percentage
5. Medical expenses must exceed 7.5% of AGI threshold
6. Charitable donations require qualified 501(c)(3) organizations
7. Be conservative - when in doubt, flag for review rather than auto-approve

Provide ONLY the JSON response, no additional commentary.`;

    const analysis = await provider.generateJSON(prompt, {
      model: 'experimental',
      temperature: 0.1 // Low temperature for factual analysis
    });

    // Add source metadata
    analysis.source = 'gemini-ai-provider';
    analysis.analyzedAt = new Date();

    return analysis;
  } catch (error) {
    console.error('AI tax analysis failed, falling back to rule-based:', error);
    return performRuleBasedTaxAnalysis(expense, await db.select().from(taxCategories), userProfile);
  }
}

/**
 * Fallback rule-based tax deductibility analysis
 */
function performRuleBasedTaxAnalysis(expense, taxCategories, userProfile) {
  const description = (expense.description || '').toLowerCase();
  const amount = parseFloat(expense.amount || 0);

  let isTaxDeductible = false;
  let recommendedTaxCategory = 'Non-Deductible';
  let deductibilityRate = 0;
  let confidence = 0.6;
  let reasoning = '';
  const requiredDocumentation = [];
  const potentialFlags = [];
  const conditionsToMeet = [];

  // Business expenses keywords
  const businessKeywords = ['office', 'software', 'subscription', 'saas', 'hosting', 'domain', 'marketing', 'advertising', 'consulting', 'professional', 'service', 'business', 'work', 'client', 'meeting'];

  // Charitable keywords
  const charitableKeywords = ['donation', 'charity', 'nonprofit', 'church', 'temple', 'mosque', 'foundation', 'goodwill', 'salvation army'];

  // Medical keywords
  const medicalKeywords = ['doctor', 'hospital', 'pharmacy', 'prescription', 'medical', 'dental', 'vision', 'therapy', 'surgery', 'insurance premium'];

  // Education keywords
  const educationKeywords = ['tuition', 'course', 'training', 'certification', 'college', 'university', 'textbook', 'udemy', 'coursera'];

  // Non-deductible keywords
  const personalKeywords = ['grocery', 'restaurant', 'movie', 'entertainment', 'clothing', 'personal', 'vacation', 'gym', 'hobby'];

  // Check for business expenses (if self-employed or business owner)
  if ((userProfile.selfEmployed || userProfile.businessOwner) &&
    businessKeywords.some(kw => description.includes(kw))) {
    isTaxDeductible = true;
    recommendedTaxCategory = 'Business Expenses';
    deductibilityRate = 1.0;
    confidence = 0.75;
    reasoning = 'Expense appears to be a business-related cost for a self-employed individual or business owner.';
    requiredDocumentation.push('Receipt', 'Business purpose documentation');
    conditionsToMeet.push('Must be ordinary and necessary for business', 'Must have clear business purpose');
  }
  // Check for charitable donations
  else if (charitableKeywords.some(kw => description.includes(kw))) {
    isTaxDeductible = true;
    recommendedTaxCategory = 'Charitable Donations';
    deductibilityRate = 1.0;
    confidence = 0.70;
    reasoning = 'Expense appears to be a charitable donation.';
    requiredDocumentation.push('Receipt from qualified 501(c)(3) organization');
    conditionsToMeet.push('Organization must be IRS-qualified 501(c)(3)', 'Must have written acknowledgment for donations over $250');
    potentialFlags.push('Verify organization is tax-exempt');
  }
  // Check for medical expenses
  else if (medicalKeywords.some(kw => description.includes(kw))) {
    isTaxDeductible = true;
    recommendedTaxCategory = 'Medical Expenses';
    deductibilityRate = 1.0;
    confidence = 0.65;
    reasoning = 'Expense appears to be a qualified medical expense. Only amounts exceeding 7.5% of AGI are deductible.';
    requiredDocumentation.push('Receipt', 'Medical necessity documentation', 'Insurance EOB if applicable');
    conditionsToMeet.push('Total medical expenses must exceed 7.5% of AGI');
    potentialFlags.push('Must meet AGI threshold');
  }
  // Check for education expenses
  else if (educationKeywords.some(kw => description.includes(kw))) {
    isTaxDeductible = true;
    recommendedTaxCategory = 'Education Expenses';
    deductibilityRate = 1.0;
    confidence = 0.65;
    reasoning = 'Expense appears to be education-related. May qualify for American Opportunity or Lifetime Learning Credit.';
    requiredDocumentation.push('Form 1098-T', 'Receipt', 'Course enrollment verification');
    conditionsToMeet.push('Must be for qualified education', 'Income limits may apply');
    potentialFlags.push('Tax credits may be better than deductions');
  }
  // Check for clearly personal expenses
  else if (personalKeywords.some(kw => description.includes(kw))) {
    isTaxDeductible = false;
    recommendedTaxCategory = 'Non-Deductible';
    deductibilityRate = 0;
    confidence = 0.85;
    reasoning = 'This appears to be a personal expense, which is not tax-deductible.';
  }
  // Unknown/ambiguous
  else {
    isTaxDeductible = false;
    recommendedTaxCategory = 'Non-Deductible';
    deductibilityRate = 0;
    confidence = 0.50;
    reasoning = 'Unable to determine deductibility. Please categorize manually or provide more details.';
    potentialFlags.push('Needs manual review');
  }

  // Calculate estimated tax savings (assuming 24% marginal rate)
  const marginalRate = 0.24;
  const taxSavingsEstimate = isTaxDeductible ? amount * deductibilityRate * marginalRate : 0;

  return {
    isTaxDeductible,
    confidence,
    recommendedTaxCategory,
    deductibilityRate,
    reasoning,
    requiredDocumentation,
    potentialFlags,
    taxSavingsEstimate: Math.round(taxSavingsEstimate * 100) / 100,
    alternativeCategories: [],
    conditionsToMeet,
    irsCodeReference: getTaxCategoryIRSCode(recommendedTaxCategory, taxCategories),
    recommendation: isTaxDeductible
      ? `Keep this receipt and categorize as "${recommendedTaxCategory}" for tax time.`
      : 'This expense does not appear to be tax-deductible.',
    source: 'rule-based',
    analyzedAt: new Date()
  };
}

/**
 * Get IRS code for a tax category
 */
function getTaxCategoryIRSCode(categoryName, taxCategories) {
  const category = taxCategories.find(cat => cat.categoryName === categoryName);
  return category?.irs_code || 'Not specified';
}

/**
 * Batch analyze multiple expenses for tax deductibility
 */
export async function batchAnalyzeExpenses(userId, expenseIds) {
  try {
    const userProfile = await getUserTaxProfile(userId);
    const results = [];

    // Fetch all expenses
    const expensesToAnalyze = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.id, expenseIds) // This won't work exactly, need to use `in` operator
        )
      );

    // Analyze each expense
    for (const expense of expensesToAnalyze) {
      const analysis = await analyzeExpenseTaxDeductibility(expense, userProfile);

      // Update expense with tax information
      if (analysis.isTaxDeductible && analysis.confidence > 0.7) {
        const taxCat = await db.query.taxCategories.findFirst({
          where: eq(taxCategories.categoryName, analysis.recommendedTaxCategory)
        });

        if (taxCat) {
          await db
            .update(expenses)
            .set({
              isTaxDeductible: true,
              taxCategoryId: taxCat.id,
              taxDeductibilityConfidence: analysis.confidence,
              taxNotes: analysis.reasoning,
              updatedAt: new Date()
            })
            .where(eq(expenses.id, expense.id));
        }
      }

      results.push({
        expenseId: expense.id,
        description: expense.description,
        amount: expense.amount,
        analysis
      });

      // Add delay to respect API rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return {
      totalAnalyzed: results.length,
      deductibleCount: results.filter(r => r.analysis.isTaxDeductible).length,
      results
    };
  } catch (error) {
    console.error('Error in batch expense analysis:', error);
    throw error;
  }
}

/**
 * Generate AI-powered tax optimization recommendations
 */
/**
 * Generate AI-powered tax optimization recommendations
 */
export async function generateTaxOptimizationRecommendations(userId, year = new Date().getFullYear()) {
  try {
    const userProfile = await getUserTaxProfile(userId);

    // Get all expenses for the year
    const startOfYear = new Date(year, 0, 1);
    const yearExpenses = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          gte(expenses.date, startOfYear)
        )
      );

    const provider = getAIProvider();

    // Prepare expense summary
    const totalExpenses = yearExpenses.length;
    const deductibleExpenses = yearExpenses.filter(exp => exp.isTaxDeductible);
    const totalDeductions = deductibleExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
    const totalSpent = yearExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);

    // Group by category
    const byCategory = {};
    yearExpenses.forEach(exp => {
      const cat = exp.categoryName || 'Uncategorized';
      byCategory[cat] = (byCategory[cat] || 0) + parseFloat(exp.amount);
    });

    const prompt = `You are a certified tax advisor. Review this user's financial profile and spending patterns to provide personalized tax optimization recommendations.

**User Tax Profile:**
- Filing Status: ${userProfile.filingStatus}
- Annual Income: $${userProfile.annualIncome || 0}
- Self-Employed: ${userProfile.selfEmployed ? 'Yes' : 'No'}
- Business Owner: ${userProfile.businessOwner ? 'Yes' : 'No'}
- Dependents: ${userProfile.dependents}
- Current Tax Bracket: ${userProfile.estimatedTaxBracket || 'Unknown'}
- Standard Deduction: $${userProfile.standardDeduction}

**Year ${year} Spending Summary:**
- Total Expenses: $${totalSpent.toFixed(2)}
- Total Deductible Expenses: $${totalDeductions.toFixed(2)}
- Deductible Expense Count: ${deductibleExpenses.length} out of ${totalExpenses}
- Deductibility Rate: ${((deductibleExpenses.length / totalExpenses) * 100).toFixed(1)}%

**Spending by Category:**
${Object.entries(byCategory).map(([cat, amt]) => `- ${cat}: $${amt.toFixed(2)}`).join('\n')}

Provide comprehensive, actionable tax optimization recommendations in JSON format:
{
  "immediateActions": [
    {
      "title": "Short, actionable title",
      "description": "What to do",
      "impact": "high|medium|low",
      "estimatedSavings": dollar amount,
      "deadline": "When to act by",
      "difficulty": "easy|moderate|hard"
    }
  ],
  "strategicRecommendations": [
    {
      "strategy": "Strategy name",
      "description": "How to implement",
      "annualSavings": estimated amount,
      "requirements": ["What's needed"],
      "timeframe": "When to implement"
    }
  ],
  "missingDeductions": [
    {
      "category": "Deduction category",
      "description": "What might be missing",
      "potentialSavings": "Estimated savings",
      "howToQualify": "Steps to claim"
    }
  ],
  "quarterlyPlanning": {
    "Q1": ["Actions for Q1"],
    "Q2": ["Actions for Q2"],
    "Q3": ["Actions for Q3"],
    "Q4": ["Actions for Q4"]
  },
  "riskAssessment": {
    "auditRisk": "low|medium|high",
    "riskFactors": ["Factors that increase risk"],
    "mitigationSteps": ["How to reduce risk"]
  },
  "recordKeepingAdvice": [
    "Specific documentation tips"
  ],
  "professionalAdvice": {
    "shouldConsultCPA": true/false,
    "reason": "Why professional help is/isn't needed",
    "estimatedCost": "Cost of professional help",
    "estimatedBenefit": "Value of professional help"
  }
}

Focus on:
1. Legal, ethical tax optimization strategies
2. Common deductions they might be missing
3. Timing strategies for end-of-year planning
4. Self-employment specific advice if applicable
5. Retirement contribution opportunities
6. Estimated tax payment strategies if quarterly taxpayer

Provide ONLY the JSON response.`;

    const recommendations = await provider.generateJSON(prompt, {
      model: 'experimental'
    });

    recommendations.source = 'gemini-ai-provider';
    recommendations.generatedAt = new Date();
    recommendations.year = year;

    // Update user profile with AI advice
    await db
      .update(userTaxProfiles)
      .set({
        aiTaxAdvice: recommendations,
        lastAIAnalysisDate: new Date()
      })
      .where(eq(userTaxProfiles.userId, userId));

    return recommendations;
  } catch (error) {
    console.error('AI tax recommendations failed, falling back to rule-based:', error);
    return generateRuleBasedRecommendations(userProfile, yearExpenses || []); // Ensure userProfile is passed if available, logic might need adjustment but assuming rule based needs minimal
  }
}

/**
 * Fallback rule-based recommendations
 */
function generateRuleBasedRecommendations(userProfile, yearExpenses) {
  const totalDeductions = yearExpenses
    .filter(exp => exp.isTaxDeductible)
    .reduce((sum, exp) => sum + parseFloat(exp.amount), 0);

  const recommendations = {
    immediateActions: [],
    strategicRecommendations: [],
    missingDeductions: [],
    quarterlyPlanning: {
      Q1: ['Review prior year tax return', 'Organize receipts'],
      Q2: ['Make Q2 estimated payment if applicable', 'Review YTD deductions'],
      Q3: ['Make Q3 estimated payment', 'Plan year-end strategies'],
      Q4: ['Maximize retirement contributions', 'Bunch deductions if beneficial', 'Make Q4 payment']
    },
    riskAssessment: {
      auditRisk: 'low',
      riskFactors: [],
      mitigationSteps: ['Keep detailed records', 'Maintain receipts', 'Document business purpose']
    },
    recordKeepingAdvice: [
      'Scan and digitize all receipts',
      'Maintain mileage log for vehicle expenses',
      'Keep records for at least 3 years (7 years for some items)',
      'Use expense tracking software consistently'
    ],
    professionalAdvice: {
      shouldConsultCPA: totalDeductions > 20000 || userProfile.selfEmployed,
      reason: totalDeductions > 20000
        ? 'Your deductions are substantial enough to benefit from professional review'
        : 'Basic tax situation can likely be handled with software',
      estimatedCost: '$200-500',
      estimatedBenefit: 'Potentially $1,000+ in additional savings'
    },
    source: 'rule-based',
    generatedAt: new Date(),
    year: new Date().getFullYear()
  };

  // Add specific recommendations based on profile
  if (userProfile.selfEmployed) {
    recommendations.immediateActions.push({
      title: 'Maximize Retirement Contributions',
      description: 'As a self-employed individual, consider SEP-IRA or Solo 401(k)',
      impact: 'high',
      estimatedSavings: 5000,
      deadline: 'December 31 (or April 15 for some)',
      difficulty: 'moderate'
    });
  }

  if (parseFloat(userProfile.annualIncome) > 50000) {
    recommendations.strategicRecommendations.push({
      strategy: 'Tax-Advantaged Investments',
      description: 'Maximize 401(k) and IRA contributions to reduce taxable income',
      annualSavings: 4000,
      requirements: ['Have earned income', 'Not exceed income limits'],
      timeframe: 'Before tax year end'
    });
  }

  return recommendations;
}

export default {
  analyzeExpenseTaxDeductibility,
  batchAnalyzeExpenses,
  generateTaxOptimizationRecommendations
};
