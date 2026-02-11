import geminiService from './geminiservice.js';
import replayEngine from './replayEngine.js';
import db from '../config/db.js';
import { forensicQueries, stateDeltas } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

class ForensicAI {
    /**
     * Explain a complex transaction chain in natural language
     * @param {string} userId - User ID
     * @param {string} resourceId - Resource ID to explain
     * @returns {Promise<string>} AI-generated explanation
     */
    async explainTransactionChain(userId, resourceId) {
        try {
            const trace = await replayEngine.traceTransaction(userId, resourceId);

            if (!trace.found) {
                return 'No transaction history found for this resource.';
            }

            const prompt = `You are a financial forensics expert. Analyze this transaction history and explain it in simple, clear language:

Transaction ID: ${resourceId}
Type: ${trace.resourceType}
Total Changes: ${trace.totalChanges}
Created: ${trace.created}
Last Modified: ${trace.lastModified}

Change History:
${trace.lifecycle.map((change, idx) => `
${idx + 1}. ${change.operation} at ${change.timestamp}
   - Triggered by: ${change.triggeredBy}
   - Changed fields: ${change.changedFields?.join(', ') || 'N/A'}
   - Before: ${JSON.stringify(change.beforeState, null, 2)}
   - After: ${JSON.stringify(change.afterState, null, 2)}
`).join('\n')}

Provide a concise explanation of:
1. What this transaction represents
2. How it evolved over time
3. Any unusual patterns or concerns
4. Impact on the user's finances

Keep the explanation under 200 words and use simple language.`;

            const explanation = await geminiService.generateInsights(prompt);
            return explanation;
        } catch (error) {
            console.error('Transaction explanation error:', error);
            return 'Unable to generate explanation at this time.';
        }
    }

    /**
     * Analyze balance discrepancies
     * @param {string} userId - User ID
     * @param {Date} date1 - First date
     * @param {Date} date2 - Second date
     * @returns {Promise<Object>} Discrepancy analysis
     */
    async analyzeBalanceDiscrepancy(userId, date1, date2) {
        try {
            const [balance1, balance2] = await Promise.all([
                replayEngine.calculateBalanceAtDate(userId, date1),
                replayEngine.calculateBalanceAtDate(userId, date2),
            ]);

            const difference = balance2 - balance1;

            // Get transactions between the two dates
            const deltas = await db
                .select()
                .from(stateDeltas)
                .where(
                    and(
                        eq(stateDeltas.userId, userId),
                        eq(stateDeltas.resourceType, 'expense')
                    )
                )
                .orderBy(desc(stateDeltas.createdAt))
                .limit(100);

            const prompt = `Analyze this balance change:

Date 1 (${date1.toISOString()}): ₹${balance1.toFixed(2)}
Date 2 (${date2.toISOString()}): ₹${balance2.toFixed(2)}
Difference: ₹${difference.toFixed(2)}

Recent transactions: ${deltas.length} changes recorded

Explain:
1. What caused this balance change?
2. Is this change expected or unusual?
3. Any red flags or concerns?
4. Recommendations for the user

Keep it concise and actionable.`;

            const analysis = await geminiService.generateInsights(prompt);

            return {
                date1,
                date2,
                balance1,
                balance2,
                difference,
                percentageChange: ((difference / balance1) * 100).toFixed(2),
                aiAnalysis: analysis,
            };
        } catch (error) {
            console.error('Balance discrepancy analysis error:', error);
            throw new Error('Failed to analyze balance discrepancy');
        }
    }

    /**
     * Generate a forensic report for a specific time period
     * @param {string} userId - User ID
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {Promise<Object>} Forensic report
     */
    async generateForensicReport(userId, startDate, endDate) {
        try {
            const startTime = Date.now();

            // Replay states at both dates
            const [startState, endState] = await Promise.all([
                replayEngine.replayToDate(userId, startDate),
                replayEngine.replayToDate(userId, endDate),
            ]);

            // Get all deltas in the period
            const deltas = await db
                .select()
                .from(stateDeltas)
                .where(
                    and(
                        eq(stateDeltas.userId, userId),
                        and(
                            db.sql`${stateDeltas.createdAt} >= ${startDate}`,
                            db.sql`${stateDeltas.createdAt} <= ${endDate}`
                        )
                    )
                )
                .orderBy(stateDeltas.createdAt);

            const summary = {
                period: { start: startDate, end: endDate },
                totalChanges: deltas.length,
                operations: {
                    creates: deltas.filter(d => d.operation === 'CREATE').length,
                    updates: deltas.filter(d => d.operation === 'UPDATE').length,
                    deletes: deltas.filter(d => d.operation === 'DELETE').length,
                },
                resourceTypes: this.groupByResourceType(deltas),
                triggeredBy: this.groupByTrigger(deltas),
                startBalance: parseFloat(startState.state.expenses?.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0) || 0),
                endBalance: parseFloat(endState.state.expenses?.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0) || 0),
            };

            summary.balanceChange = summary.endBalance - summary.startBalance;

            // Generate AI insights
            const prompt = `Analyze this forensic financial report:

Period: ${startDate.toISOString()} to ${endDate.toISOString()}
Total Changes: ${summary.totalChanges}
Operations: ${summary.operations.creates} creates, ${summary.operations.updates} updates, ${summary.operations.deletes} deletes
Balance Change: ₹${summary.balanceChange.toFixed(2)}

Provide:
1. Overall assessment of financial activity
2. Any unusual patterns or anomalies
3. Risk assessment (low/medium/high)
4. Recommendations

Be concise and professional.`;

            const aiInsights = await geminiService.generateInsights(prompt);

            const executionTime = Date.now() - startTime;

            // Save forensic query
            const [query] = await db.insert(forensicQueries).values({
                userId,
                queryType: 'forensic_report',
                targetDate: startDate,
                queryParams: { startDate, endDate },
                resultSummary: summary,
                aiExplanation: aiInsights,
                executionTime,
                status: 'completed',
                completedAt: new Date(),
            }).returning();

            return {
                queryId: query.id,
                summary,
                aiInsights,
                executionTime,
                generatedAt: new Date(),
            };
        } catch (error) {
            console.error('Forensic report generation error:', error);
            throw new Error('Failed to generate forensic report');
        }
    }

    /**
     * Helper: Group deltas by resource type
     */
    groupByResourceType(deltas) {
        return deltas.reduce((acc, delta) => {
            acc[delta.resourceType] = (acc[delta.resourceType] || 0) + 1;
            return acc;
        }, {});
    }

    /**
     * Helper: Group deltas by trigger
     */
    groupByTrigger(deltas) {
        return deltas.reduce((acc, delta) => {
            acc[delta.triggeredBy] = (acc[delta.triggeredBy] || 0) + 1;
            return acc;
        }, {});
    }
}

export default new ForensicAI();
