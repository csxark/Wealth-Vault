import { eq, and, gte, lte, sql, desc, asc } from "drizzle-orm";
import db from "../config/db.js";
import { users, expenses, categories, goals } from "../db/schema.js";
import crypto from 'crypto';

/**
 * Analytics service for peer comparison data
 * Implements privacy-preserving aggregated analytics
 */

/**
 * Generate a hashed identifier for anonymization
 * @param {string} identifier - User ID or other identifier
 * @returns {string} Hashed identifier
 */
function hashIdentifier(identifier) {
  return crypto.createHash('sha256').update(identifier).digest('hex').substring(0, 16);
}

/**
 * Get peer comparison data for a user
 * @param {string} userId - User ID
 * @param {Object} filters - Optional filters (ageGroup, incomeRange, location)
 * @returns {Promise<Object>} Aggregated peer data
 */
export async function getPeerComparisonData(userId, filters = {}) {
  try {
    // Get user's demographics and consent
    const [user] = await db.select({
      peerComparisonConsent: users.peerComparisonConsent,
      ageGroup: users.ageGroup,
      incomeRange: users.incomeRange,
      location: users.location,
      monthlyIncome: users.monthlyIncome,
      monthlyBudget: users.monthlyBudget,
      emergencyFund: users.emergencyFund
    }).from(users).where(eq(users.id, userId));

    if (!user || !user.peerComparisonConsent) {
      throw new Error('User has not consented to peer comparison');
    }

    // Build peer group filters
    const peerFilters = [];
    if (user.ageGroup) peerFilters.push(eq(users.ageGroup, user.ageGroup));
    if (user.incomeRange) peerFilters.push(eq(users.incomeRange, user.incomeRange));
    if (user.location) peerFilters.push(eq(users.location, user.location));

    // Override with provided filters if specified
    if (filters.ageGroup) peerFilters.push(eq(users.ageGroup, filters.ageGroup));
    if (filters.incomeRange) peerFilters.push(eq(users.incomeRange, filters.incomeRange));
    if (filters.location) peerFilters.push(eq(users.location, filters.location));

    // Add consent filter
    peerFilters.push(eq(users.peerComparisonConsent, true));

    // Get peer group statistics (anonymized)
    const peerStats = await db
      .select({
        count: sql`count(*)`,
        avgIncome: sql`avg(${users.monthlyIncome})`,
        avgBudget: sql`avg(${users.monthlyBudget})`,
        avgEmergencyFund: sql`avg(${users.emergencyFund})`,
        medianIncome: sql`percentile_cont(0.5) within group (order by ${users.monthlyIncome})`,
        medianBudget: sql`percentile_cont(0.5) within group (order by ${users.monthlyBudget})`,
        medianEmergencyFund: sql`percentile_cont(0.5) within group (order by ${users.emergencyFund})`
      })
      .from(users)
      .where(and(...peerFilters));

    // Get user's spending data for comparison
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const [userSpending] = await db
      .select({
        totalSpending: sql`coalesce(sum(${expenses.amount}), 0)`,
        transactionCount: sql`count(${expenses.id})`
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.status, "completed"),
          gte(expenses.date, startOfMonth),
          lte(expenses.date, endOfMonth)
        )
      );

    // Get peer spending data (aggregated and anonymized)
    const peerSpendingData = await db
      .select({
        userId: expenses.userId,
        totalSpending: sql`sum(${expenses.amount})`,
        transactionCount: sql`count(${expenses.id})`
      })
      .from(expenses)
      .innerJoin(users, eq(expenses.userId, users.id))
      .where(
        and(
          ...peerFilters,
          eq(expenses.status, "completed"),
          gte(expenses.date, startOfMonth),
          lte(expenses.date, endOfMonth)
        )
      )
      .groupBy(expenses.userId);

    // Calculate peer spending statistics
    const peerSpendingStats = {
      count: peerSpendingData.length,
      avgSpending: peerSpendingData.length > 0
        ? peerSpendingData.reduce((sum, peer) => sum + Number(peer.totalSpending), 0) / peerSpendingData.length
        : 0,
      medianSpending: peerSpendingData.length > 0
        ? peerSpendingData.sort((a, b) => Number(a.totalSpending) - Number(b.totalSpending))[Math.floor(peerSpendingData.length / 2)].totalSpending
        : 0,
      avgTransactions: peerSpendingData.length > 0
        ? peerSpendingData.reduce((sum, peer) => sum + Number(peer.transactionCount), 0) / peerSpendingData.length
        : 0
    };

    // Get category spending comparison
    const userCategorySpending = await db
      .select({
        categoryId: expenses.categoryId,
        categoryName: categories.name,
        total: sql`sum(${expenses.amount})`
      })
      .from(expenses)
      .leftJoin(categories, eq(expenses.categoryId, categories.id))
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.status, "completed"),
          gte(expenses.date, startOfMonth),
          lte(expenses.date, endOfMonth)
        )
      )
      .groupBy(expenses.categoryId, categories.name)
      .orderBy(desc(sql`sum(${expenses.amount})`))
      .limit(5);

    // Get peer category spending (aggregated)
    const peerCategorySpending = await db
      .select({
        categoryId: expenses.categoryId,
        categoryName: categories.name,
        total: sql`sum(${expenses.amount})`,
        userCount: sql`count(distinct ${expenses.userId})`
      })
      .from(expenses)
      .leftJoin(categories, eq(expenses.categoryId, categories.id))
      .innerJoin(users, eq(expenses.userId, users.id))
      .where(
        and(
          ...peerFilters,
          eq(expenses.status, "completed"),
          gte(expenses.date, startOfMonth),
          lte(expenses.date, endOfMonth)
        )
      )
      .groupBy(expenses.categoryId, categories.name)
      .orderBy(desc(sql`sum(${expenses.amount})`));

    // Calculate savings rate comparison
    const userSavingsRate = user.monthlyIncome > 0
      ? ((user.monthlyIncome - user.monthlyBudget) / user.monthlyIncome) * 100
      : 0;

    const peerSavingsRates = await db
      .select({
        savingsRate: sql`case when ${users.monthlyIncome} > 0 then ((cast(${users.monthlyIncome} as decimal) - cast(${users.monthlyBudget} as decimal)) / cast(${users.monthlyIncome} as decimal)) * 100 else 0 end`
      })
      .from(users)
      .where(and(...peerFilters));

    const peerAvgSavingsRate = peerSavingsRates.length > 0
      ? peerSavingsRates.reduce((sum, peer) => sum + Number(peer.savingsRate), 0) / peerSavingsRates.length
      : 0;

    return {
      success: true,
      data: {
        user: {
          hashedId: hashIdentifier(userId),
          demographics: {
            ageGroup: user.ageGroup,
            incomeRange: user.incomeRange,
            location: user.location
          },
          metrics: {
            monthlyIncome: Number(user.monthlyIncome),
            monthlyBudget: Number(user.monthlyBudget),
            emergencyFund: Number(user.emergencyFund),
            savingsRate: userSavingsRate,
            currentSpending: Number(userSpending.totalSpending),
            transactionCount: Number(userSpending.transactionCount)
          }
        },
        peerGroup: {
          size: Number(peerStats[0].count),
          demographics: {
            ageGroup: user.ageGroup || filters.ageGroup,
            incomeRange: user.incomeRange || filters.incomeRange,
            location: user.location || filters.location
          },
          averages: {
            monthlyIncome: Number(peerStats[0].avgIncome || 0),
            monthlyBudget: Number(peerStats[0].avgBudget || 0),
            emergencyFund: Number(peerStats[0].avgEmergencyFund || 0),
            savingsRate: peerAvgSavingsRate,
            monthlySpending: peerSpendingStats.avgSpending,
            transactionCount: peerSpendingStats.avgTransactions
          },
          medians: {
            monthlyIncome: Number(peerStats[0].medianIncome || 0),
            monthlyBudget: Number(peerStats[0].medianBudget || 0),
            emergencyFund: Number(peerStats[0].medianEmergencyFund || 0),
            monthlySpending: peerSpendingStats.medianSpending
          }
        },
        comparisons: {
          incomePercentile: calculatePercentile(user.monthlyIncome, peerStats[0].medianIncome),
          budgetPercentile: calculatePercentile(user.monthlyBudget, peerStats[0].medianBudget),
          emergencyFundPercentile: calculatePercentile(user.emergencyFund, peerStats[0].medianEmergencyFund),
          spendingPercentile: calculatePercentile(userSpending.totalSpending, peerSpendingStats.medianSpending),
          savingsRatePercentile: calculatePercentile(userSavingsRate, peerAvgSavingsRate)
        },
        categoryBreakdown: {
          user: userCategorySpending.map(cat => ({
            category: cat.categoryName || 'Uncategorized',
            amount: Number(cat.total),
            percentage: userSpending.totalSpending > 0 ? (Number(cat.total) / Number(userSpending.totalSpending)) * 100 : 0
          })),
          peers: peerCategorySpending.slice(0, 5).map(cat => ({
            category: cat.categoryName || 'Uncategorized',
            avgAmount: Number(cat.total) / Number(cat.userCount),
            percentage: peerSpendingStats.avgSpending > 0 ? (Number(cat.total) / Number(cat.userCount) / peerSpendingStats.avgSpending) * 100 : 0
          }))
        },
        insights: generatePeerInsights(user, peerStats[0], userSpending, peerSpendingStats, userSavingsRate, peerAvgSavingsRate),
        lastUpdated: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('Peer comparison data error:', error);
    throw error;
  }
}

/**
 * Update user demographics and consent for peer comparison
 * @param {string} userId - User ID
 * @param {Object} demographics - Demographics data
 * @returns {Promise<Object>} Update result
 */
export async function updateUserDemographics(userId, demographics) {
  try {
    const updateData = {};

    if (demographics.peerComparisonConsent !== undefined) {
      updateData.peerComparisonConsent = demographics.peerComparisonConsent;
    }

    if (demographics.ageGroup !== undefined) {
      updateData.ageGroup = demographics.ageGroup;
    }

    if (demographics.incomeRange !== undefined) {
      updateData.incomeRange = demographics.incomeRange;
    }

    if (demographics.location !== undefined) {
      updateData.location = demographics.location;
    }

    await db.update(users)
      .set(updateData)
      .where(eq(users.id, userId));

    return {
      success: true,
      message: 'User demographics updated successfully'
    };
  } catch (error) {
    console.error('Update demographics error:', error);
    throw error;
  }
}

/**
 * Get available demographic options for forms
 * @returns {Object} Demographic options
 */
export function getDemographicOptions() {
  return {
    ageGroups: [
      { value: '18-24', label: '18-24 years' },
      { value: '25-34', label: '25-34 years' },
      { value: '35-44', label: '35-44 years' },
      { value: '45-54', label: '45-54 years' },
      { value: '55-64', label: '55-64 years' },
      { value: '65+', label: '65+ years' }
    ],
    incomeRanges: [
      { value: '0-25000', label: '$0 - $25,000' },
      { value: '25001-50000', label: '$25,001 - $50,000' },
      { value: '50001-75000', label: '$50,001 - $75,000' },
      { value: '75001-100000', label: '$75,001 - $100,000' },
      { value: '100001+', label: '$100,001+' }
    ],
    locations: [
      { value: 'urban', label: 'Urban' },
      { value: 'suburban', label: 'Suburban' },
      { value: 'rural', label: 'Rural' }
    ]
  };
}

/**
 * Calculate percentile ranking
 * @param {number} userValue - User's value
 * @param {number} peerMedian - Peer group median
 * @returns {string} Percentile description
 */
function calculatePercentile(userValue, peerMedian) {
  if (!peerMedian || peerMedian === 0) return 'N/A';

  const ratio = userValue / peerMedian;
  if (ratio < 0.5) return 'Bottom 25%';
  if (ratio < 0.75) return 'Bottom 50%';
  if (ratio < 1.25) return 'Average';
  if (ratio < 1.5) return 'Top 25%';
  return 'Top 10%';
}

/**
 * Generate insights based on peer comparison
 * @param {Object} user - User data
 * @param {Object} peerStats - Peer statistics
 * @param {Object} userSpending - User spending data
 * @param {Object} peerSpending - Peer spending statistics
 * @param {number} userSavingsRate - User's savings rate
 * @param {number} peerSavingsRate - Peer average savings rate
 * @returns {Array} Insights array
 */
function generatePeerInsights(user, peerStats, userSpending, peerSpending, userSavingsRate, peerSavingsRate) {
  const insights = [];

  // Income comparison
  const incomeDiff = (user.monthlyIncome - peerStats.avgIncome) / peerStats.avgIncome * 100;
  if (Math.abs(incomeDiff) > 20) {
    insights.push({
      type: incomeDiff > 0 ? 'success' : 'info',
      message: incomeDiff > 0
        ? `Your income is ${Math.abs(incomeDiff).toFixed(0)}% higher than your peer group average.`
        : `Your income is ${Math.abs(incomeDiff).toFixed(0)}% lower than your peer group average.`
    });
  }

  // Spending comparison
  const spendingDiff = (userSpending.totalSpending - peerSpending.avgSpending) / peerSpending.avgSpending * 100;
  if (Math.abs(spendingDiff) > 15) {
    insights.push({
      type: spendingDiff < 0 ? 'success' : 'warning',
      message: spendingDiff < 0
        ? `You're spending ${Math.abs(spendingDiff).toFixed(0)}% less than your peers this month.`
        : `You're spending ${Math.abs(spendingDiff).toFixed(0)}% more than your peers this month.`
    });
  }

  // Savings rate comparison
  const savingsDiff = userSavingsRate - peerSavingsRate;
  if (Math.abs(savingsDiff) > 5) {
    insights.push({
      type: savingsDiff > 0 ? 'success' : 'warning',
      message: savingsDiff > 0
        ? `Your savings rate is ${savingsDiff.toFixed(1)}% higher than your peer group.`
        : `Your savings rate is ${Math.abs(savingsDiff).toFixed(1)}% lower than your peer group.`
    });
  }

  // Emergency fund comparison
  const emergencyFundRatio = user.emergencyFund / user.monthlyIncome;
  const peerEmergencyRatio = peerStats.avgEmergencyFund / peerStats.avgIncome;
  if (emergencyFundRatio < peerEmergencyRatio * 0.5) {
    insights.push({
      type: 'warning',
      message: 'Your emergency fund is significantly smaller than your peer group average.'
    });
  }

  return insights;
}
