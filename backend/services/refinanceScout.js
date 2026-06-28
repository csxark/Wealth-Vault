import db from '../config/db.js';
import { debts, refinanceOpportunities, refinanceProposals } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { generateInsights } from './aiInsightsService.js';
import debtEngine from './debtEngine.js';

class RefinanceScout {
  /**
   * Scan for refinancing opportunities for a user
   */
  async scanOpportunities(userId) {
    const userDebts = await db.query.debts.findMany({
      where: and(eq(debts.userId, userId), eq(debts.isActive, true))
    });

    const opportunities = [];

    const marketRates = {
      'credit_card': 0.15,
      'personal_loan': 0.08,
      'mortgage': 0.065,
      'auto_loan': 0.05,
      'student_loan': 0.045,
      'medical': 0,
      'other': 0.10
    };

    for (const debt of userDebts) {
      const currentApr = parseFloat(debt.apr);
      const marketRate = marketRates[debt.debtType] || 0.10;

      if (currentApr > marketRate + 0.01) {
        const potentialSavings = await this.calculatePotentialSavings(debt, marketRate);
        const recommendation = await this.getAIRecommendation(debt, marketRate, potentialSavings);

        const opportunity = {
          userId,
          debtId: debt.id,
          currentApr: currentApr.toString(),
          suggestedApr: marketRate.toString(),
          potentialSavings: potentialSavings.totalInterestSaved.toString(),
          monthsSaved: potentialSavings.monthsSaved,
          recommendation,
          marketRateEstimate: marketRate.toString()
        };

        const [saved] = await db.insert(refinanceOpportunities).values(opportunity).returning();
        opportunities.push(saved);
      }
    }

    return opportunities;
  }

  /**
   * Scan for Refinance Opportunities (L3)
   * Advanced version using refinanceProposals table and refined savings calculation.
   */
  async scanForRefinance(userId) {
    const userDebts = await db.query.debts.findMany({
      where: and(eq(debts.userId, userId), eq(debts.isActive, true))
    });

    const proposals = [];

    for (const debt of userDebts) {
      const marketRate = await debtEngine.getMarketRefinanceRate(debt.debtType || 'personal_loan');
      const currentRate = parseFloat(debt.apr);

      if (currentRate - marketRate > 0.005) {
        const balance = parseFloat(debt.currentBalance);
        const monthlySavings = (balance * (currentRate - marketRate)) / 12;
        const estimatedSavings = monthlySavings * 24;

        const [proposal] = await db.insert(refinanceProposals).values({
          userId,
          debtId: debt.id,
          currentRate: currentRate.toString(),
          proposedRate: marketRate.toString(),
          estimatedSavings: estimatedSavings.toString(),
          monthlySavings: monthlySavings.toString(),
          roiMonths: 6,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }).returning();

        proposals.push(proposal);
      }
    }

    return proposals;
  }

  /**
   * Calculate potential savings from refinancing
   */
  async calculatePotentialSavings(debt, newApr) {
    const balance = parseFloat(debt.currentBalance);
    const currentApr = parseFloat(debt.apr);
    const minPayment = parseFloat(debt.minimumPayment);

    const currentScenario = await debtEngine.calculateMonthsToPayoff(balance, currentApr, minPayment);
    const currentInterest = debtEngine.calculateTotalInterest(balance, currentApr, minPayment);

    const newScenario = await debtEngine.calculateMonthsToPayoff(balance, newApr, minPayment);
    const newInterest = debtEngine.calculateTotalInterest(balance, newApr, minPayment);

    return {
      totalInterestSaved: parseFloat((currentInterest - newInterest).toFixed(2)),
      monthsSaved: currentScenario - newScenario,
      currentMonths: currentScenario,
      newMonths: newScenario
    };
  }

  /**
   * Use Gemini AI to generate a personalized recommendation
   */
  async getAIRecommendation(debt, marketRate, savings) {
    const prompt = `
            Analyze this debt refinancing opportunity for a Wealth-Vault user:
            - Debt Name: ${debt.name}
            - Debt Type: ${debt.debtType}
            - Current Balance: $${debt.currentBalance}
            - Current APR: ${(parseFloat(debt.apr) * 100).toFixed(2)}%
            - Suggested Market APR: ${(marketRate * 100).toFixed(2)}%
            - Potential Interest Savings: $${savings.totalInterestSaved}
            - Time Saved: ${savings.monthsSaved} months

            Provide a concise, professional recommendation (max 3 sentences). 
            Mention if they should look for a 0% balance transfer card or a personal loan.
        `;

    return await generateInsights(prompt);
  }

  /**
   * Get pending opportunities for user
   */
  async getOpportunities(userId) {
    return await db.query.refinanceOpportunities.findMany({
      where: and(
        eq(refinanceOpportunities.userId, userId),
        eq(refinanceOpportunities.isReviewed, false)
      ),
      with: {
        debt: true
      }
    });
  }

  /**
   * Mark opportunity as reviewed
   */
  async markAsReviewed(opportunityId) {
    return await db.update(refinanceOpportunities)
      .set({
        isReviewed: true,
        reviewedAt: new Date()
      })
      .where(eq(refinanceOpportunities.id, opportunityId));
  }

  /**
   * Calculate LTV (Loan-to-Value) (L3)
   */
  async calculateLTV(debtId, assetId) {
    const debt = await db.query.debts.findFirst({ where: eq(debts.id, debtId) });
    const assetValue = 250000;

    const ltv = parseFloat(debt.currentBalance) / assetValue;
    return ltv;
  }
}

export default new RefinanceScout();
