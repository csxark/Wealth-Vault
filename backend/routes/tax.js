/**
 * Tax Routes
 * API endpoints for tax profiles, summaries, optimization, and filing status
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getUserTaxProfile,
  updateTaxProfile,
  calculateYTDTaxSummary,
  calculateTaxSavingsOpportunities,
  initializeDefaultTaxCategories
} from '../services/taxService.js';
import {
  analyzeExpenseTaxDeductibility,
  batchAnalyzeExpenses,
  generateTaxOptimizationRecommendations
} from '../services/taxAI.js';
import { db } from '../config/db.js';
import { taxCategories, expenses, userTaxProfiles } from '../db/schema.js';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

const router = express.Router();

/**
 * GET /api/tax/profile
 * Get user's tax profile
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const profile = await getUserTaxProfile(userId);

    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    console.error('Error fetching tax profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tax profile'
    });
  }
});

/**
 * PUT /api/tax/profile
 * Update user's tax profile
 */
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const updates = req.body;

    // Validate filing status
    const validFilingStatuses = ['single', 'married_jointly', 'married_separately', 'head_of_household'];
    if (updates.filingStatus && !validFilingStatuses.includes(updates.filingStatus)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid filing status'
      });
    }

    const updated = await updateTaxProfile(userId, updates);

    res.json({
      success: true,
      message: 'Tax profile updated successfully',
      data: updated
    });
  } catch (error) {
    console.error('Error updating tax profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update tax profile'
    });
  }
});

/**
 * GET /api/tax/summary
 * Get year-to-date tax summary
 */
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { year } = req.query;
    const taxYear = year ? parseInt(year) : new Date().getFullYear();

    const summary = await calculateYTDTaxSummary(userId, taxYear);

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error calculating tax summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate tax summary'
    });
  }
});

/**
 * GET /api/tax/opportunities
 * Get tax savings opportunities
 */
router.get('/opportunities', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { year } = req.query;
    const taxYear = year ? parseInt(year) : new Date().getFullYear();

    const opportunities = await calculateTaxSavingsOpportunities(userId, taxYear);

    res.json({
      success: true,
      data: opportunities
    });
  } catch (error) {
    console.error('Error calculating tax opportunities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate tax opportunities'
    });
  }
});

/**
 * GET /api/tax/categories
 * Get all tax categories
 */
router.get('/categories', authenticateToken, async (req, res) => {
  try {
    const categories = await db
      .select()
      .from(taxCategories)
      .where(eq(taxCategories.isActive, true))
      .orderBy(taxCategories.categoryName);

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error fetching tax categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tax categories'
    });
  }
});

/**
 * POST /api/tax/categories/initialize
 * Initialize default tax categories (admin/first-time setup)
 */
router.post('/categories/initialize', authenticateToken, async (req, res) => {
  try {
    const count = await initializeDefaultTaxCategories();

    res.json({
      success: true,
      message: `Initialized ${count} tax categories`,
      count
    });
  } catch (error) {
    console.error('Error initializing tax categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize tax categories'
    });
  }
});

/**
 * POST /api/tax/analyze-expense
 * Analyze single expense for tax deductibility
 */
router.post('/analyze-expense', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { expenseId } = req.body;

    if (!expenseId) {
      return res.status(400).json({
        success: false,
        error: 'Expense ID is required'
      });
    }

    // Fetch expense
    const expense = await db.query.expenses.findFirst({
      where: and(
        eq(expenses.id, expenseId),
        eq(expenses.userId, userId)
      )
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        error: 'Expense not found'
      });
    }

    // Get user profile
    const userProfile = await getUserTaxProfile(userId);

    // Analyze expense
    const analysis = await analyzeExpenseTaxDeductibility(expense, userProfile);

    // Update expense if deductible with high confidence
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
            taxYear: new Date(expense.date).getFullYear(),
            updatedAt: new Date()
          })
          .where(eq(expenses.id, expenseId));
      }
    }

    res.json({
      success: true,
      data: {
        expense: {
          id: expense.id,
          description: expense.description,
          amount: expense.amount,
          date: expense.date
        },
        analysis
      }
    });
  } catch (error) {
    console.error('Error analyzing expense:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze expense'
    });
  }
});

/**
 * POST /api/tax/analyze-expenses-batch
 * Analyze multiple expenses in batch
 */
router.post('/analyze-expenses-batch', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { expenseIds, year } = req.body;

    let idsToAnalyze = expenseIds;

    // If no IDs provided, analyze all expenses for the year
    if (!idsToAnalyze || idsToAnalyze.length === 0) {
      const targetYear = year || new Date().getFullYear();
      const startOfYear = new Date(targetYear, 0, 1);
      const endOfYear = new Date(targetYear, 11, 31, 23, 59, 59);

      const yearExpenses = await db
        .select({ id: expenses.id })
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, userId),
            gte(expenses.date, startOfYear),
            lte(expenses.date, endOfYear),
            eq(expenses.isTaxDeductible, false) // Only analyze untagged expenses
          )
        );

      idsToAnalyze = yearExpenses.map(exp => exp.id);
    }

    if (idsToAnalyze.length === 0) {
      return res.json({
        success: true,
        message: 'No expenses to analyze',
        data: {
          totalAnalyzed: 0,
          deductibleCount: 0,
          results: []
        }
      });
    }

    const results = await batchAnalyzeExpenses(userId, idsToAnalyze);

    res.json({
      success: true,
      message: `Analyzed ${results.totalAnalyzed} expenses`,
      data: results
    });
  } catch (error) {
    console.error('Error in batch expense analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze expenses'
    });
  }
});

/**
 * GET /api/tax/recommendations
 * Get AI-powered tax optimization recommendations
 */
router.get('/recommendations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { year } = req.query;
    const taxYear = year ? parseInt(year) : new Date().getFullYear();

    const recommendations = await generateTaxOptimizationRecommendations(userId, taxYear);

    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate recommendations'
    });
  }
});

/**
 * GET /api/tax/deductible-expenses
 * Get all tax-deductible expenses for a year
 */
router.get('/deductible-expenses', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { year, category } = req.query;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();

    const startOfYear = new Date(targetYear, 0, 1);
    const endOfYear = new Date(targetYear, 11, 31, 23, 59, 59);

    let query = db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.isTaxDeductible, true),
          gte(expenses.date, startOfYear),
          lte(expenses.date, endOfYear)
        )
      );

    const deductibleExpenses = await query;

    // Group by tax category
    const byCategory = {};
    let totalDeductions = 0;

    for (const expense of deductibleExpenses) {
      const amount = parseFloat(expense.amount);
      totalDeductions += amount;

      if (expense.taxCategoryId) {
        const taxCat = await db.query.taxCategories.findFirst({
          where: eq(taxCategories.id, expense.taxCategoryId)
        });

        const categoryName = taxCat?.categoryName || 'Uncategorized';
        
        if (!byCategory[categoryName]) {
          byCategory[categoryName] = {
            category: categoryName,
            expenses: [],
            total: 0,
            count: 0
          };
        }

        byCategory[categoryName].expenses.push(expense);
        byCategory[categoryName].total += amount;
        byCategory[categoryName].count++;
      }
    }

    res.json({
      success: true,
      data: {
        year: targetYear,
        totalDeductions,
        expenseCount: deductibleExpenses.length,
        byCategory,
        expenses: deductibleExpenses
      }
    });
  } catch (error) {
    console.error('Error fetching deductible expenses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch deductible expenses'
    });
  }
});

/**
 * GET /api/tax/filing-status
 * Get next filing deadline and status
 */
router.get('/filing-status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const profile = await getUserTaxProfile(userId);

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    
    // Tax filing deadline is typically April 15
    const filingDeadline = new Date(currentYear, 3, 15); // April 15
    
    // Adjust if April 15 falls on weekend
    if (filingDeadline.getDay() === 0) { // Sunday
      filingDeadline.setDate(filingDeadline.getDate() + 1);
    } else if (filingDeadline.getDay() === 6) { // Saturday
      filingDeadline.setDate(filingDeadline.getDate() + 2);
    }

    const daysUntilDeadline = Math.ceil((filingDeadline - currentDate) / (1000 * 60 * 60 * 24));
    
    // Quarterly deadlines (if quarterly taxpayer)
    const quarterlyDeadlines = [
      new Date(currentYear, 3, 15), // Q1: April 15
      new Date(currentYear, 5, 15), // Q2: June 15
      new Date(currentYear, 8, 15), // Q3: September 15
      new Date(currentYear, 0, 15, currentYear + 1) // Q4: January 15 of next year
    ];

    const nextQuarterlyDeadline = quarterlyDeadlines.find(d => d > currentDate);

    res.json({
      success: true,
      data: {
        filingStatus: profile.filingStatus,
        quarterlyTaxPayer: profile.quarterlyTaxPayer,
        annualFilingDeadline: filingDeadline,
        daysUntilAnnualDeadline: daysUntilDeadline,
        nextQuarterlyDeadline: profile.quarterlyTaxPayer ? nextQuarterlyDeadline : null,
        lastFilingDate: profile.lastFilingDate,
        estimatedTaxBracket: profile.estimatedTaxBracket,
        ytdTaxPaid: profile.ytdTaxPaid,
        ytdTaxableIncome: profile.ytdTaxableIncome,
        ytdDeductions: profile.ytdDeductions
      }
    });
  } catch (error) {
    console.error('Error fetching filing status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch filing status'
    });
  }
});

/**
 * GET /api/tax/dashboard
 * Get comprehensive tax dashboard data
 */
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const currentYear = new Date().getFullYear();

    // Parallel fetch all data
    const [profile, summary, opportunities, recommendations] = await Promise.all([
      getUserTaxProfile(userId),
      calculateYTDTaxSummary(userId, currentYear),
      calculateTaxSavingsOpportunities(userId, currentYear),
      generateTaxOptimizationRecommendations(userId, currentYear).catch(() => null) // Optional
    ]);

    // Calculate progress metrics
    const yearProgress = (new Date().getMonth() + 1) / 12 * 100;
    const deductionProgress = (summary.deductions.used / summary.grossIncome) * 100;

    res.json({
      success: true,
      data: {
        profile: {
          filingStatus: profile.filingStatus,
          taxBracket: profile.estimatedTaxBracket,
          quarterlyTaxPayer: profile.quarterlyTaxPayer
        },
        summary: {
          grossIncome: summary.grossIncome,
          totalDeductions: summary.deductions.used,
          taxableIncome: summary.taxableIncome,
          estimatedTax: summary.taxLiability,
          effectiveRate: summary.effectiveRate,
          taxPaid: summary.taxPaid,
          remainingDue: summary.remainingDue
        },
        opportunities: {
          count: opportunities.opportunities.length,
          topThree: opportunities.opportunities.slice(0, 3),
          totalPotentialSavings: opportunities.totalPotentialSavings
        },
        progress: {
          yearProgress: Math.round(yearProgress),
          deductionProgress: Math.round(deductionProgress),
          deductibleExpenseCount: summary.deductibleExpenseCount,
          totalExpenseCount: summary.totalExpenseCount
        },
        recentRecommendations: recommendations?.immediateActions || [],
        nextDeadline: profile.quarterlyTaxPayer 
          ? 'Next quarterly payment due'
          : 'Annual filing: April 15'
      }
    });
  } catch (error) {
    console.error('Error fetching tax dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tax dashboard'
    });
  }
});

/**
 * PATCH /api/tax/expense/:id/tax-category
 * Manually update expense tax category
 */
router.patch('/expense/:id/tax-category', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const expenseId = req.params.id;
    const { taxCategoryId, isTaxDeductible, taxNotes } = req.body;

    // Verify expense belongs to user
    const expense = await db.query.expenses.findFirst({
      where: and(
        eq(expenses.id, expenseId),
        eq(expenses.userId, userId)
      )
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        error: 'Expense not found'
      });
    }

    // Update expense
    const [updated] = await db
      .update(expenses)
      .set({
        isTaxDeductible: isTaxDeductible !== undefined ? isTaxDeductible : expense.isTaxDeductible,
        taxCategoryId: taxCategoryId || expense.taxCategoryId,
        taxNotes: taxNotes || expense.taxNotes,
        taxYear: new Date(expense.date).getFullYear(),
        taxDeductibilityConfidence: 1.0, // User manually set
        updatedAt: new Date()
      })
      .where(eq(expenses.id, expenseId))
      .returning();

    res.json({
      success: true,
      message: 'Expense tax category updated',
      data: updated
    });
  } catch (error) {
    console.error('Error updating expense tax category:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update expense tax category'
    });
  }
});

export default router;
