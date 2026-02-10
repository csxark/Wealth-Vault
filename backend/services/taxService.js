/**
 * Tax Service
 * Core engine for tax calculations, bracket determination, and liability estimation
 */

import { db } from '../config/db.js';
import { expenses, taxCategories, userTaxProfiles } from '../db/schema.js';
import { eq, and, gte, lte, sql, between } from 'drizzle-orm';

// 2026 US Federal Tax Brackets (Standard Deduction amounts)
const TAX_BRACKETS_2026 = {
  single: {
    brackets: [
      { min: 0, max: 11600, rate: 0.10 },
      { min: 11601, max: 47150, rate: 0.12 },
      { min: 47151, max: 100525, rate: 0.22 },
      { min: 100526, max: 191950, rate: 0.24 },
      { min: 191951, max: 243725, rate: 0.32 },
      { min: 243726, max: 609350, rate: 0.35 },
      { min: 609351, max: Infinity, rate: 0.37 }
    ],
    standardDeduction: 14600
  },
  married_jointly: {
    brackets: [
      { min: 0, max: 23200, rate: 0.10 },
      { min: 23201, max: 94300, rate: 0.12 },
      { min: 94301, max: 201050, rate: 0.22 },
      { min: 201051, max: 383900, rate: 0.24 },
      { min: 383901, max: 487450, rate: 0.32 },
      { min: 487451, max: 731200, rate: 0.35 },
      { min: 731201, max: Infinity, rate: 0.37 }
    ],
    standardDeduction: 29200
  },
  married_separately: {
    brackets: [
      { min: 0, max: 11600, rate: 0.10 },
      { min: 11601, max: 47150, rate: 0.12 },
      { min: 47151, max: 100525, rate: 0.22 },
      { min: 100526, max: 191950, rate: 0.24 },
      { min: 191951, max: 243725, rate: 0.32 },
      { min: 243726, max: 365600, rate: 0.35 },
      { min: 365601, max: Infinity, rate: 0.37 }
    ],
    standardDeduction: 14600
  },
  head_of_household: {
    brackets: [
      { min: 0, max: 16550, rate: 0.10 },
      { min: 16551, max: 63100, rate: 0.12 },
      { min: 63101, max: 100500, rate: 0.22 },
      { min: 100501, max: 191950, rate: 0.24 },
      { min: 191951, max: 243700, rate: 0.32 },
      { min: 243701, max: 609350, rate: 0.35 },
      { min: 609351, max: Infinity, rate: 0.37 }
    ],
    standardDeduction: 21900
  }
};

/**
 * Calculate federal tax liability based on income and filing status
 * @param {number} taxableIncome - Income after deductions
 * @param {string} filingStatus - Filing status
 * @returns {Object} Tax calculation breakdown
 */
export function calculateFederalTax(taxableIncome, filingStatus = 'single') {
  const brackets = TAX_BRACKETS_2026[filingStatus]?.brackets;
  
  if (!brackets) {
    throw new Error(`Invalid filing status: ${filingStatus}`);
  }

  let totalTax = 0;
  let effectiveRate = 0;
  let marginalRate = 0;
  const bracketBreakdown = [];

  for (const bracket of brackets) {
    if (taxableIncome <= bracket.min) {
      break; // Income doesn't reach this bracket
    }

    const incomeInBracket = Math.min(taxableIncome, bracket.max) - bracket.min + 1;
    const taxInBracket = incomeInBracket * bracket.rate;
    
    totalTax += taxInBracket;
    marginalRate = bracket.rate;

    bracketBreakdown.push({
      bracket: `${bracket.rate * 100}%`,
      min: bracket.min,
      max: bracket.max === Infinity ? 'and above' : bracket.max,
      incomeInBracket: incomeInBracket,
      taxInBracket: taxInBracket
    });
  }

  if (taxableIncome > 0) {
    effectiveRate = totalTax / taxableIncome;
  }

  return {
    taxableIncome,
    totalTax: Math.round(totalTax * 100) / 100,
    effectiveRate: Math.round(effectiveRate * 10000) / 100, // Percentage
    marginalRate: Math.round(marginalRate * 100), // Percentage
    bracketBreakdown,
    filingStatus
  };
}

/**
 * Calculate standard deduction for filing status
 */
export function getStandardDeduction(filingStatus, dependents = 0) {
  const baseDeduction = TAX_BRACKETS_2026[filingStatus]?.standardDeduction || TAX_BRACKETS_2026.single.standardDeduction;
  
  // Additional deduction per dependent (for head of household)
  const dependentDeduction = filingStatus === 'head_of_household' ? dependents * 1500 : 0;
  
  return baseDeduction + dependentDeduction;
}

/**
 * Get or create user's tax profile
 */
export async function getUserTaxProfile(userId) {
  try {
    let profile = await db.query.userTaxProfiles.findFirst({
      where: eq(userTaxProfiles.userId, userId)
    });

    if (!profile) {
      // Create default profile
      const [created] = await db.insert(userTaxProfiles).values({
        userId,
        filingStatus: 'single',
        taxJurisdiction: 'US_FEDERAL',
        standardDeduction: getStandardDeduction('single', 0)
      }).returning();
      
      profile = created;
    }

    return profile;
  } catch (error) {
    console.error('Error fetching tax profile:', error);
    throw error;
  }
}

/**
 * Update user's tax profile
 */
export async function updateTaxProfile(userId, updates) {
  try {
    // Recalculate standard deduction if filing status or dependents changed
    if (updates.filingStatus || updates.dependents !== undefined) {
      const filingStatus = updates.filingStatus || (await getUserTaxProfile(userId)).filingStatus;
      const dependents = updates.dependents !== undefined ? updates.dependents : (await getUserTaxProfile(userId)).dependents;
      updates.standardDeduction = getStandardDeduction(filingStatus, dependents);
    }

    // Recalculate tax bracket if annual income changed
    if (updates.annualIncome) {
      const profile = await getUserTaxProfile(userId);
      const filingStatus = updates.filingStatus || profile.filingStatus;
      const taxableIncome = updates.annualIncome - (updates.standardDeduction || profile.standardDeduction);
      const taxCalc = calculateFederalTax(Math.max(0, taxableIncome), filingStatus);
      updates.estimatedTaxBracket = `${taxCalc.marginalRate}%`;
    }

    const [updated] = await db
      .update(userTaxProfiles)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(userTaxProfiles.userId, userId))
      .returning();

    return updated;
  } catch (error) {
    console.error('Error updating tax profile:', error);
    throw error;
  }
}

/**
 * Calculate year-to-date tax summary
 */
export async function calculateYTDTaxSummary(userId, year = new Date().getFullYear()) {
  try {
    const profile = await getUserTaxProfile(userId);
    
    // Get all expenses for the year
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59);

    const yearExpenses = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          gte(expenses.date, startOfYear),
          lte(expenses.date, endOfYear)
        )
      );

    // Calculate total deductible expenses
    const deductibleExpenses = yearExpenses.filter(exp => exp.isTaxDeductible);
    const totalDeductions = deductibleExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);

    // Fetch tax category details for deductible expenses
    const deductionsByCategory = {};
    
    for (const expense of deductibleExpenses) {
      if (expense.taxCategoryId) {
        const taxCat = await db.query.taxCategories.findFirst({
          where: eq(taxCategories.id, expense.taxCategoryId)
        });
        
        if (taxCat) {
          const categoryName = taxCat.categoryName;
          deductionsByCategory[categoryName] = (deductionsByCategory[categoryName] || 0) + parseFloat(expense.amount);
        }
      }
    }

    // Calculate estimated taxable income
    const grossIncome = parseFloat(profile.annualIncome || 0);
    const standardDeduction = parseFloat(profile.standardDeduction || 0);
    const itemizedDeductions = totalDeductions;
    
    // Use greater of standard or itemized deduction
    const totalDeductionAmount = Math.max(standardDeduction, itemizedDeductions);
    const taxableIncome = Math.max(0, grossIncome - totalDeductionAmount);

    // Calculate tax liability
    const taxCalculation = calculateFederalTax(taxableIncome, profile.filingStatus);

    // Calculate quarterly estimates if quarterly taxpayer
    const quarterlyEstimate = profile.quarterlyTaxPayer ? taxCalculation.totalTax / 4 : 0;

    // Tax already paid this year
    const taxPaid = parseFloat(profile.ytdTaxPaid || 0);
    const remainingTaxDue = Math.max(0, taxCalculation.totalTax - taxPaid);

    return {
      year,
      grossIncome,
      deductions: {
        standard: standardDeduction,
        itemized: itemizedDeductions,
        used: totalDeductionAmount,
        usingItemized: itemizedDeductions > standardDeduction,
        byCategory: deductionsByCategory
      },
      taxableIncome,
      taxLiability: taxCalculation.totalTax,
      effectiveRate: taxCalculation.effectiveRate,
      marginalRate: taxCalculation.marginalRate,
      taxPaid: taxPaid,
      remainingDue: remainingTaxDue,
      quarterlyEstimate: quarterlyEstimate,
      deductibleExpenseCount: deductibleExpenses.length,
      totalExpenseCount: yearExpenses.length,
      deductibilityRate: yearExpenses.length > 0 ? (deductibleExpenses.length / yearExpenses.length) * 100 : 0,
      bracketBreakdown: taxCalculation.bracketBreakdown
    };
  } catch (error) {
    console.error('Error calculating YTD tax summary:', error);
    throw error;
  }
}

/**
 * Calculate potential tax savings opportunities
 */
export async function calculateTaxSavingsOpportunities(userId, year = new Date().getFullYear()) {
  try {
    const summary = await calculateYTDTaxSummary(userId, year);
    const profile = await getUserTaxProfile(userId);
    
    const opportunities = [];

    // Check if itemizing would save money
    if (summary.deductions.itemized < summary.deductions.standard) {
      const shortfall = summary.deductions.standard - summary.deductions.itemized;
      opportunities.push({
        type: 'itemized_deductions',
        priority: 'medium',
        title: 'Increase Itemized Deductions',
        description: `You're using the standard deduction ($${summary.deductions.standard.toFixed(2)}). If you can find $${shortfall.toFixed(2)} more in deductible expenses, itemizing could save you money.`,
        potentialSavings: Math.round(shortfall * (summary.marginalRate / 100)),
        actionable: true
      });
    }

    // Check for self-employment deductions
    if (profile.selfEmployed && summary.deductions.byCategory['Business Expenses']) {
      const businessExpenses = summary.deductions.byCategory['Business Expenses'];
      opportunities.push({
        type: 'self_employment',
        priority: 'high',
        title: 'Self-Employment Tax Deductions',
        description: `You've claimed ${businessExpenses.toFixed(2)} in business expenses. You may also be eligible for home office, vehicle, and health insurance deductions.`,
        potentialSavings: 'Varies',
        actionable: true
      });
    }

    // Check retirement contributions
    if (summary.grossIncome > 50000 && !summary.deductions.byCategory['Retirement Contributions']) {
      opportunities.push({
        type: 'retirement',
        priority: 'high',
        title: 'Maximize Retirement Contributions',
        description: '401(k) and IRA contributions are tax-deductible. Contributing the maximum could significantly reduce your tax burden.',
        potentialSavings: Math.round(20500 * (summary.marginalRate / 100)), // 2026 401k limit
        actionable: true
      });
    }

    // Check charitable donations
    const charitableDonations = summary.deductions.byCategory['Charitable Donations'] || 0;
    if (charitableDonations < summary.grossIncome * 0.02) {
      opportunities.push({
        type: 'charitable',
        priority: 'low',
        title: 'Charitable Donation Deductions',
        description: 'Donations to qualified charities are tax-deductible. Even small donations add up.',
        potentialSavings: 'Varies',
        actionable: true
      });
    }

    // Check medical expenses (threshold is 7.5% of AGI)
    const medicalThreshold = summary.grossIncome * 0.075;
    const medicalExpenses = summary.deductions.byCategory['Medical Expenses'] || 0;
    if (medicalExpenses > medicalThreshold) {
      const deductibleMedical = medicalExpenses - medicalThreshold;
      opportunities.push({
        type: 'medical',
        priority: 'high',
        title: 'Medical Expense Deductions',
        description: `Your medical expenses exceed the 7.5% AGI threshold. You can deduct $${deductibleMedical.toFixed(2)}.`,
        potentialSavings: Math.round(deductibleMedical * (summary.marginalRate / 100)),
        actionable: true
      });
    }

    // Check education expenses
    if (summary.deductions.byCategory['Education'] && summary.grossIncome < 90000) {
      opportunities.push({
        type: 'education',
        priority: 'medium',
        title: 'Education Tax Credits',
        description: 'You may qualify for American Opportunity or Lifetime Learning credits. These are more valuable than deductions.',
        potentialSavings: 'Up to $2,500',
        actionable: true
      });
    }

    // Sort by priority
    const priorityOrder = { high: 1, medium: 2, low: 3 };
    opportunities.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return {
      opportunities,
      totalPotentialSavings: opportunities.reduce((sum, opp) => {
        return sum + (typeof opp.potentialSavings === 'number' ? opp.potentialSavings : 0);
      }, 0)
    };
  } catch (error) {
    console.error('Error calculating tax savings opportunities:', error);
    throw error;
  }
}

/**
 * Initialize default tax categories
 */
export async function initializeDefaultTaxCategories() {
  const defaultCategories = [
    {
      categoryName: 'Business Expenses',
      deductibilityType: 'fully_deductible',
      deductibilityRate: 1.0,
      taxJurisdiction: 'US_FEDERAL',
      description: 'Ordinary and necessary business expenses',
      irs_code: 'Section 162',
      exampleExpenses: ['Office supplies', 'Software subscriptions', 'Professional services', 'Marketing'],
      conditionsForDeductibility: { mustBeOrdinaryAndNecessary: true, businessPurpose: true }
    },
    {
      categoryName: 'Home Office',
      deductibilityType: 'partially_deductible',
      deductibilityRate: 0.20, // Varies by space usage
      taxJurisdiction: 'US_FEDERAL',
      description: 'Portion of home used exclusively for business',
      irs_code: 'Section 280A',
      exampleExpenses: ['Rent', 'Utilities', 'Internet', 'Repairs'],
      conditionsForDeductibility: { regularAndExclusiveUse: true, principalPlaceOfBusiness: true }
    },
    {
      categoryName: 'Vehicle Expenses',
      deductibilityType: 'partially_deductible',
      deductibilityRate: 0.67, // IRS standard mileage rate
      taxJurisdiction: 'US_FEDERAL',
      description: 'Business use of vehicle',
      irs_code: 'Section 274',
      exampleExpenses: ['Gas', 'Maintenance', 'Insurance', 'Depreciation'],
      conditionsForDeductibility: { businessUsePercentage: true, mileageLog: true }
    },
    {
      categoryName: 'Charitable Donations',
      deductibilityType: 'fully_deductible',
      deductibilityRate: 1.0,
      taxJurisdiction: 'US_FEDERAL',
      description: 'Donations to qualified 501(c)(3) organizations',
      irs_code: 'Section 170',
      exampleExpenses: ['Cash donations', 'Property donations', 'Volunteer expenses'],
      conditionsForDeductibility: { qualifiedOrganization: true, receipt: true },
      maxDeductionLimit: 60 // 60% of AGI for cash donations
    },
    {
      categoryName: 'Medical Expenses',
      deductibilityType: 'partially_deductible',
      deductibilityRate: 1.0,
      taxJurisdiction: 'US_FEDERAL',
      description: 'Medical expenses exceeding 7.5% of AGI',
      irs_code: 'Section 213',
      exampleExpenses: ['Doctor visits', 'Prescriptions', 'Medical equipment', 'Insurance premiums'],
      conditionsForDeductibility: { exceedsThreshold: '7.5% of AGI' }
    },
    {
      categoryName: 'State and Local Taxes',
      deductibilityType: 'partially_deductible',
      deductibilityRate: 1.0,
      taxJurisdiction: 'US_FEDERAL',
      description: 'State income, property, and sales taxes',
      irs_code: 'Section 164',
      exampleExpenses: ['Property tax', 'State income tax', 'Sales tax'],
      maxDeductionLimit: 10000, // SALT cap
      conditionsForDeductibility: { saltCap: true }
    },
    {
      categoryName: 'Mortgage Interest',
      deductibilityType: 'fully_deductible',
      deductibilityRate: 1.0,
      taxJurisdiction: 'US_FEDERAL',
      description: 'Interest on home mortgage',
      irs_code: 'Section 163',
      exampleExpenses: ['Mortgage interest', 'Home equity loan interest'],
      maxDeductionLimit: 750000, // Mortgage principal limit
      conditionsForDeductibility: { qualifiedResidence: true, securedByHome: true }
    },
    {
      categoryName: 'Education Expenses',
      deductibilityType: 'partially_deductible',
      deductibilityRate: 1.0,
      taxJurisdiction: 'US_FEDERAL',
      description: 'Qualified education expenses',
      irs_code: 'Section 222',
      exampleExpenses: ['Tuition', 'Books', 'Fees', 'Course materials'],
      conditionsForDeductibility: { qualifiedInstitution: true, incomeLimits: true }
    },
    {
      categoryName: 'Retirement Contributions',
      deductibilityType: 'fully_deductible',
      deductibilityRate: 1.0,
      taxJurisdiction: 'US_FEDERAL',
      description: 'Traditional IRA and 401(k) contributions',
      irs_code: 'Sections 219, 401(k)',
      exampleExpenses: ['IRA contributions', '401(k) deferrals', 'SEP-IRA', 'SIMPLE IRA'],
      maxDeductionLimit: 23000, // 2026 401k limit
      conditionsForDeductibility: { contributionLimits: true, earnedIncome: true }
    },
    {
      categoryName: 'Non-Deductible',
      deductibilityType: 'non_deductible',
      deductibilityRate: 0.0,
      taxJurisdiction: 'US_FEDERAL',
      description: 'Personal expenses not eligible for deduction',
      exampleExpenses: ['Groceries', 'Personal clothing', 'Entertainment', 'Commuting'],
      conditionsForDeductibility: { personalExpense: true }
    }
  ];

  try {
    const existingCategories = await db.select().from(taxCategories);
    const existingNames = new Set(existingCategories.map(cat => cat.categoryName));

    const categoriesToInsert = defaultCategories
      .filter(cat => !existingNames.has(cat.categoryName))
      .map(cat => ({
        ...cat,
        applicableExpenseCategories: cat.exampleExpenses // Simplified mapping
      }));

    if (categoriesToInsert.length > 0) {
      await db.insert(taxCategories).values(categoriesToInsert);
      console.log(`Initialized ${categoriesToInsert.length} default tax categories`);
    }

    return categoriesToInsert.length;
  } catch (error) {
    console.error('Error initializing tax categories:', error);
    throw error;
  }
}

export default {
  calculateFederalTax,
  getStandardDeduction,
  getUserTaxProfile,
  updateTaxProfile,
  calculateYTDTaxSummary,
  calculateTaxSavingsOpportunities,
  initializeDefaultTaxCategories
};
