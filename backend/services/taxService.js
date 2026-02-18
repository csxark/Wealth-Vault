import db from '../config/db.js';
import { taxLots, washSaleLogs, harvestOpportunities, taxCategories } from '../db/schema.js';
import { eq, and, sql, gte, lte, asc, desc } from 'drizzle-orm';

/**
 * Tax Service (L3)
 * Implements Tax-Loss Harvesting and Wash-Sale Prevention logic.
 */
class TaxService {
  /**
   * Get available tax lots for an investment using a matching algorithm
   * @param {string} investmentId
   * @param {string} userId
   * @param {string} method - 'FIFO', 'LIFO', 'HIFO' (Highest In, First Out)
   */
  async getMatchingLots(investmentId, userId, method = 'FIFO') {
    let orderBy;
    switch (method) {
      case 'LIFO':
        orderBy = desc(taxLots.acquiredAt);
        break;
      case 'HIFO':
        orderBy = desc(taxLots.costBasisPerUnit);
        break;
      case 'FIFO':
      default:
        orderBy = asc(taxLots.acquiredAt);
    }

    return await db.query.taxLots.findMany({
      where: and(
        eq(taxLots.investmentId, investmentId),
        eq(taxLots.userId, userId),
        eq(taxLots.isSold, false)
      ),
      orderBy
    });
  }

  /**
   * Detect potential Wash-Sale (Buy within 30 days before/after a loss sale)
   */
  async checkWashSaleRisk(userId, investmentId, sellDate, lossAmount) {
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
    const windowStart = new Date(sellDate.getTime() - thirtyDaysInMs);
    const windowEnd = new Date(sellDate.getTime() + thirtyDaysInMs);

    // Check for "Replacement Shares" bought in the window
    const replacementLots = await db.query.taxLots.findMany({
      where: and(
        eq(taxLots.userId, userId),
        eq(taxLots.investmentId, investmentId),
        gte(taxLots.acquiredAt, windowStart),
        lte(taxLots.acquiredAt, windowEnd)
      )
    });

    if (replacementLots.length > 0) {
      return {
        isWashSale: true,
        replacementLots,
        disallowedLoss: lossAmount
      };
    }

    return { isWashSale: false };
  }

  /**
   * Calculate Tax Alpha (Estimated tax savings from harvested losses)
   */
  async calculateTaxAlpha(userId) {
    const harvestedLosses = await db.select({
      total: sql`sum(${harvestOpportunities.unrealizedLoss})`
    }).from(harvestOpportunities)
      .where(and(
        eq(harvestOpportunities.userId, userId),
        eq(harvestOpportunities.status, 'harvested')
      ));

    const taxRate = 0.20; // Default LTCG rate
    const alpha = (harvestedLosses[0]?.total || 0) * taxRate;

    return {
      totalLossesHarvested: harvestedLosses[0]?.total || 0,
      estimatedTaxAlpha: alpha
    };
  }

  /**
   * Liquidate lots when selling shares
   */
  async liquidateLots(userId, investmentId, quantityToSell, method = 'FIFO') {
    const lots = await this.getMatchingLots(investmentId, userId, method);
    let remainingToSell = parseFloat(quantityToSell);
    const updatedLots = [];

    for (const lot of lots) {
      if (remainingToSell <= 0) break;

      const lotQty = parseFloat(lot.quantity);
      if (lotQty <= remainingToSell) {
        // Full lot sold
        const [updated] = await db.update(taxLots)
          .set({ isSold: true, soldAt: new Date(), quantity: '0' })
          .where(eq(taxLots.id, lot.id))
          .returning();
        updatedLots.push(updated);
        remainingToSell -= lotQty;
      } else {
        // Partial lot sold
        const [updated] = await db.update(taxLots)
          .set({ quantity: (lotQty - remainingToSell).toString() })
          .where(eq(taxLots.id, lot.id))
          .returning();
        updatedLots.push(updated);
        remainingToSell = 0;
      }
    }
    return updatedLots;
  }
}

/**
 * Initialize default tax categories in the database
 * Populates IRS-compliant tax deduction categories
 */
export async function initializeDefaultTaxCategories() {
  const defaultCategories = [
    {
      categoryName: 'Business Expenses',
      description: 'Ordinary and necessary expenses for operating a business',
      deductibilityType: 'fully_deductible',
      deductibilityRate: '1.00',
      taxJurisdiction: 'US_Federal',
      irsCode: 'Section 162',
      applicableExpenseCategories: ['business', 'office'],
      exampleExpenses: ['Office supplies', 'Software subscriptions', 'Professional services'],
      requiredDocumentation: ['Receipts', 'Invoices', 'Business purpose notes'],
      isActive: true,
      priorityOrder: 1
    },
    {
      categoryName: 'Home Office Deduction',
      description: 'Deduction for business use of home',
      deductibilityType: 'partially_deductible',
      deductibilityRate: '0.50',
      taxJurisdiction: 'US_Federal',
      irsCode: 'Section 280A',
      applicableExpenseCategories: ['home', 'utilities'],
      exampleExpenses: ['Rent/mortgage', 'Utilities', 'Home insurance'],
      requiredDocumentation: ['Floor plan', 'Square footage calculation', 'Expense receipts'],
      isActive: true,
      priorityOrder: 2
    },
    {
      categoryName: 'Charitable Contributions',
      description: 'Donations to qualified charitable organizations',
      deductibilityType: 'fully_deductible',
      deductibilityRate: '1.00',
      taxJurisdiction: 'US_Federal',
      irsCode: 'Section 170',
      percentageAgiLimit: '60.00',
      applicableExpenseCategories: ['charity', 'donation'],
      exampleExpenses: ['Cash donations', 'Property donations'],
      requiredDocumentation: ['Donation receipt', 'Appraisal for property over $5,000'],
      isActive: true,
      priorityOrder: 3
    },
    {
      categoryName: 'Medical Expenses',
      description: 'Unreimbursed medical and dental expenses',
      deductibilityType: 'partially_deductible',
      deductibilityRate: '1.00',
      taxJurisdiction: 'US_Federal',
      irsCode: 'Section 213',
      percentageAgiLimit: '7.50',
      applicableExpenseCategories: ['medical', 'health'],
      exampleExpenses: ['Doctor visits', 'Prescriptions', 'Medical equipment'],
      requiredDocumentation: ['Medical bills', 'Insurance statements', 'Receipts'],
      isActive: true,
      priorityOrder: 4
    },
    {
      categoryName: 'State and Local Taxes',
      description: 'State, local, and property taxes',
      deductibilityType: 'fully_deductible',
      deductibilityRate: '1.00',
      taxJurisdiction: 'US_Federal',
      irsCode: 'Section 164',
      maxDeductionLimit: '10000.00',
      applicableExpenseCategories: ['tax', 'property'],
      exampleExpenses: ['Property tax', 'State income tax', 'Sales tax'],
      requiredDocumentation: ['Tax bills', 'Payment receipts'],
      isActive: true,
      priorityOrder: 5
    }
  ];

  try {
    // Check if categories already exist
    const existing = await db.select().from(taxCategories).limit(1);
    
    if (existing.length === 0) {
      await db.insert(taxCategories).values(defaultCategories);
      console.log('✅ Default tax categories initialized successfully');
    } else {
      console.log('ℹ️  Tax categories already exist, skipping initialization');
    }
  } catch (error) {
    console.error('❌ Error initializing default tax categories:', error);
    // Don't throw - this should not prevent server startup
  }
}

export default new TaxService();
