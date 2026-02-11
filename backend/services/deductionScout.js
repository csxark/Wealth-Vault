import db from '../config/db.js';
import { taxDeductions, expenses } from '../db/schema.js';
import { getAIProvider } from './aiProvider.js';
import { eq, and, isNull } from 'drizzle-orm';

class DeductionScout {
    constructor() {
        this.deductionCategories = {
            business_expense: ['office supplies', 'software', 'equipment', 'advertising', 'professional fees'],
            medical: ['doctor', 'hospital', 'pharmacy', 'insurance', 'medical'],
            charitable: ['donation', 'charity', 'nonprofit', 'contribution'],
            mortgage_interest: ['mortgage', 'home loan', 'interest'],
            education: ['tuition', 'books', 'course', 'school', 'university'],
            vehicle: ['car', 'mileage', 'gas', 'auto', 'parking'],
            home_office: ['internet', 'utilities', 'rent', 'office']
        };
    }

    /**
     * Scan all untagged expenses for deduction opportunities
     */
    async scanExpenses(userId, taxYear = new Date().getFullYear()) {
        console.log(`[Deduction Scout] Scanning expenses for user ${userId}, tax year ${taxYear}`);

        // Get expenses that haven't been analyzed for deductions
        const untaggedExpenses = await db.query.expenses.findMany({
            where: and(
                eq(expenses.userId, userId),
                isNull(expenses.taxCategoryId)
            )
        });

        const detectedDeductions = [];

        for (const expense of untaggedExpenses) {
            const result = await this.analyzeExpenseForDeduction(expense, taxYear);
            if (result) {
                detectedDeductions.push(result);
            }
        }

        console.log(`[Deduction Scout] Found ${detectedDeductions.length} potential deductions`);
        return detectedDeductions;
    }

    /**
     * Analyze a single expense using AI
     */
    async analyzeExpenseForDeduction(expense, taxYear) {
        // Quick keyword check first
        const keywordMatch = this.quickCategoryMatch(expense.description);

        // Use Gemini for deeper analysis
        const aiAnalysis = await this.getGeminiAnalysis(expense);

        if (!aiAnalysis || aiAnalysis.confidence < 0.6) {
            return null; // Not confident enough
        }

        // Create deduction entry
        const [deduction] = await db.insert(taxDeductions).values({
            userId: expense.userId,
            expenseId: expense.id,
            taxYear,
            category: aiAnalysis.category,
            description: `${expense.description} (AI-detected)`,
            amount: expense.amount,
            deductionType: aiAnalysis.deductionType || 'itemized',
            aiDetected: true,
            confidence: aiAnalysis.confidence,
            aiReasoning: aiAnalysis.reasoning,
            status: aiAnalysis.confidence >= 0.85 ? 'pending' : 'pending', // High confidence still needs approval
            metadata: {
                originalExpense: expense.description,
                detectedAt: new Date(),
                keywordMatch
            }
        }).returning();

        // Update expense with tax category reference
        await db.update(expenses)
            .set({ taxCategoryId: deduction.id })
            .where(eq(expenses.id, expense.id));

        return deduction;
    }

    /**
     * Quick keyword matching
     */
    quickCategoryMatch(description) {
        const lowerDesc = description.toLowerCase();

        for (const [category, keywords] of Object.entries(this.deductionCategories)) {
            for (const keyword of keywords) {
                if (lowerDesc.includes(keyword)) {
                    return category;
                }
            }
        }

        return null;
    }

    /**
     * Use Gemini AI to analyze expense
     */
    /**
     * Use AI Provider to analyze expense
     */
    async getGeminiAnalysis(expense) {
        try {
            const prompt = `
You are a professional tax advisor AI. Analyze this expense and determine if it qualifies as a tax deduction in the United States.

Expense Details:
- Description: ${expense.description}
- Amount: $${parseFloat(expense.amount).toFixed(2)}
- Category: ${expense.subcategory || 'Unknown'}
- Payment Method: ${expense.paymentMethod}

Respond ONLY with a JSON object in this exact format:
{
  "isDeductible": true/false,
  "category": "business_expense" | "medical" | "charitable" | "mortgage_interest" | "education" | "vehicle" | "home_office" | "other",
  "deductionType": "itemized" | "above_the_line" | "standard",
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation of why this is/isn't deductible"
}

Tax deduction categories:
- business_expense: Work-related costs (home office, equipment, software)
- medical: Healthcare costs exceeding 7.5% of AGI
- charitable: Donations to qualified organizations
- mortgage_interest: Home loan interest
- education: Qualified education expenses
- vehicle: Business mileage, work-related travel
- home_office: Utilities, internet for dedicated workspace

Be conservative. Only flag as deductible if there's strong evidence.
`;

            const provider = getAIProvider();
            const result = await provider.generateJSON(prompt, {
                model: 'experimental',
                temperature: 0.2
            });

            if (!result || !result.isDeductible) {
                return null;
            }

            return result;

        } catch (error) {
            console.error('[Deduction Scout] AI analysis failed:', error.message);
            return null;
        }
    }

    /**
     * Get deduction suggestions for user
     */
    async getSuggestions(userId, taxYear) {
        const suggestions = await db.query.taxDeductions.findMany({
            where: and(
                eq(taxDeductions.userId, userId),
                eq(taxDeductions.taxYear, taxYear),
                eq(taxDeductions.aiDetected, true),
                eq(taxDeductions.status, 'pending')
            ),
            with: {
                expense: true
            },
            orderBy: (taxDeductions, { desc }) => [desc(taxDeductions.confidence)]
        });

        return suggestions;
    }

    /**
     * Bulk approve high-confidence deductions
     */
    async autoApproveHighConfidence(userId, taxYear, threshold = 0.9) {
        const highConfidence = await db.query.taxDeductions.findMany({
            where: and(
                eq(taxDeductions.userId, userId),
                eq(taxDeductions.taxYear, taxYear),
                eq(taxDeductions.status, 'pending')
            )
        });

        const approved = [];

        for (const deduction of highConfidence) {
            if (parseFloat(deduction.confidence) >= threshold) {
                const [updated] = await db.update(taxDeductions)
                    .set({
                        status: 'approved',
                        approvedBy: userId,
                        approvedAt: new Date()
                    })
                    .where(eq(taxDeductions.id, deduction.id))
                    .returning();

                approved.push(updated);
            }
        }

        return approved;
    }

    /**
     * Analyze receipt/invoice text
     */
    async analyzeReceipt(receiptText, userId, taxYear) {
        const prompt = `
Analyze this receipt/invoice and extract deductible items:

${receiptText}

Return a JSON array of deductible line items:
[
  {
    "description": "Item description",
    "amount": 0.00,
    "category": "business_expense",
    "confidence": 0.0-1.0,
    "reasoning": "Why this is deductible"
  }
]
`;

        try {
            const provider = getAIProvider();
            const items = await provider.generateJSON(prompt, {
                model: 'experimental'
            });

            if (!Array.isArray(items)) return [];

            const deductions = [];

            for (const item of items) {
                if (item.confidence >= 0.6) {
                    const [deduction] = await db.insert(taxDeductions).values({
                        userId,
                        taxYear,
                        category: item.category,
                        description: item.description,
                        amount: item.amount.toString(),
                        aiDetected: true,
                        confidence: item.confidence,
                        aiReasoning: item.reasoning,
                        status: 'pending',
                        metadata: { source: 'receipt_scan' }
                    }).returning();

                    deductions.push(deduction);
                }
            }

            return deductions;

        } catch (error) {
            console.error('[Deduction Scout] Receipt analysis failed:', error);
            return [];
        }
    }
}

export default new DeductionScout();
