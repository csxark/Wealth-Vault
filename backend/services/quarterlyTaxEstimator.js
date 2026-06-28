// Quarterly Tax Estimator - Calculate estimated quarterly tax payments
// Issue #641: Real-Time Tax Optimization & Deduction Tracking

import { db } from '../db/index.js';
import { quarterlyTaxPayments, taxProfiles, taxEstimates } from '../db/schema.js';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import taxCalculationEngine from './taxCalculationEngine.js';

class QuarterlyTaxEstimator {
    constructor() {
        // Quarterly payment schedule
        this.quarterSchedule = {
            1: { quarter: 1, dueDate: '04/15', months: [1, 2, 3] },
            2: { quarter: 2, dueDate: '06/15', months: [4, 5] },
            3: { quarter: 3, dueDate: '09/15', months: [6, 7, 8] },
            4: { quarter: 4, dueDate: '01/15', months: [9, 10, 11, 12] }, // Next year
        };

        // Safe harbor percentages
        this.safeHarborRates = {
            standard: 0.90,      // 90% of current year tax
            priorYear: 1.00,     // 100% of prior year tax
            highEarner: 1.10,    // 110% of prior year tax (AGI > $150k)
        };
    }

    /**
     * Calculate quarterly estimated tax payments
     * @param {string} userId - User ID
     * @param {number} taxYear - Tax year
     * @returns {object} Quarterly payment schedule
     */
    async calculateQuarterlyPayments(userId, taxYear = new Date().getFullYear()) {
        try {
            // Get tax profile
            const [profile] = await db.select()
                .from(taxProfiles)
                .where(and(
                    eq(taxProfiles.userId, userId),
                    eq(taxProfiles.taxYear, taxYear)
                ))
                .limit(1);

            if (!profile) {
                throw new Error('Tax profile not found');
            }

            if (!profile.isSelfEmployed && profile.w2JobsCount > 0) {
                return {
                    success: false,
                    message: 'Quarterly estimated payments are typically not required for W-2 employees with proper withholding',
                    requiresQuarterly: false,
                };
            }

            // Get current year tax estimate
            const currentEstimate = await taxCalculationEngine.calculateTaxEstimate(userId, taxYear);
            const estimatedAnnualTax = parseFloat(currentEstimate.estimate.totalTax);
            const withholdingYtd = parseFloat(profile.withholdingYtd || 0);

            // Get prior year tax for safe harbor
            const priorYearTax = await this.getPriorYearTax(userId, taxYear - 1);

            // Calculate safe harbor amounts
            const safeHarbor = this.calculateSafeHarbor(
                estimatedAnnualTax,
                priorYearTax,
                parseFloat(currentEstimate.estimate.adjustedGrossIncome)
            );

            // Determine recommended quarterly payment amount
            const totalPaymentNeeded = Math.max(
                estimatedAnnualTax - withholdingYtd,
                safeHarbor.requiredPayment
            );

            const quarterlyPayment = totalPaymentNeeded / 4;

            // Generate payment schedule
            const schedule = await this.generatePaymentSchedule(
                userId,
                taxYear,
                quarterlyPayment,
                safeHarbor
            );

            return {
                success: true,
                requiresQuarterly: true,
                estimatedAnnualTax,
                withholdingYtd,
                totalPaymentNeeded,
                quarterlyPayment: Math.ceil(quarterlyPayment),
                safeHarbor,
                schedule,
                recommendations: this.generateRecommendations(
                    totalPaymentNeeded,
                    quarterlyPayment,
                    safeHarbor
                ),
            };

        } catch (error) {
            console.error('Error calculating quarterly payments:', error);
            throw error;
        }
    }

    /**
     * Get prior year tax liability
     */
    async getPriorYearTax(userId, priorYear) {
        const [priorEstimate] = await db.select()
            .from(taxEstimates)
            .where(and(
                eq(taxEstimates.userId, userId),
                eq(taxEstimates.taxYear, priorYear),
                eq(taxEstimates.isProjection, false)
            ))
            .orderBy(desc(taxEstimates.createdAt))
            .limit(1);

        return priorEstimate ? parseFloat(priorEstimate.totalTax) : 0;
    }

    /**
     * Calculate safe harbor amounts
     */
    calculateSafeHarbor(currentYearTax, priorYearTax, agi) {
        const isHighEarner = agi > 150000;

        const safeHarborOptions = {
            currentYear90: {
                method: '90% of current year tax',
                amount: currentYearTax * this.safeHarborRates.standard,
                isRecommended: priorYearTax === 0 || currentYearTax < priorYearTax,
            },
            priorYear100: {
                method: '100% of prior year tax',
                amount: priorYearTax * this.safeHarborRates.priorYear,
                isRecommended: priorYearTax > 0 && !isHighEarner && priorYearTax < currentYearTax,
            },
            priorYear110: {
                method: '110% of prior year tax (high earner)',
                amount: priorYearTax * this.safeHarborRates.highEarner,
                isRecommended: isHighEarner && priorYearTax > 0,
            },
        };

        // Determine recommended safe harbor
        const recommended = Object.values(safeHarborOptions).find(opt => opt.isRecommended);
        const requiredPayment = recommended ? recommended.amount : safeHarborOptions.currentYear90.amount;

        return {
            options: safeHarborOptions,
            recommended: recommended?.method || safeHarborOptions.currentYear90.method,
            requiredPayment,
            isHighEarner,
        };
    }

    /**
     * Generate quarterly payment schedule
     */
    async generatePaymentSchedule(userId, taxYear, quarterlyPayment, safeHarbor) {
        const schedule = [];

        for (let quarter = 1; quarter <= 4; quarter++) {
            const quarterInfo = this.quarterSchedule[quarter];
            const dueDate = this.calculateDueDate(taxYear, quarter);

            // Check if payment already made
            const [existingPayment] = await db.select()
                .from(quarterlyTaxPayments)
                .where(and(
                    eq(quarterlyTaxPayments.userId, userId),
                    eq(quarterlyTaxPayments.taxYear, taxYear),
                    eq(quarterlyTaxPayments.quarter, quarter)
                ))
                .limit(1);

            if (existingPayment) {
                schedule.push({
                    quarter,
                    dueDate,
                    estimatedAmount: quarterlyPayment,
                    safeHarborAmount: safeHarbor.requiredPayment / 4,
                    recommendedAmount: Math.ceil(Math.max(quarterlyPayment, safeHarbor.requiredPayment / 4)),
                    actualAmountPaid: parseFloat(existingPayment.actualAmountPaid || 0),
                    isPaid: existingPayment.isPaid,
                    paymentDate: existingPayment.paymentDate,
                    paymentMethod: existingPayment.paymentMethod,
                    confirmationNumber: existingPayment.confirmationNumber,
                    penaltyRisk: this.assessPenaltyRisk(existingPayment, quarterlyPayment, dueDate),
                });
            } else {
                // Create payment record
                const recommendedAmount = Math.ceil(Math.max(quarterlyPayment, safeHarbor.requiredPayment / 4));

                const [payment] = await db.insert(quarterlyTaxPayments).values({
                    userId,
                    taxYear,
                    quarter,
                    dueDate,
                    estimatedAmount: quarterlyPayment,
                    safeHarborAmount: safeHarbor.requiredPayment / 4,
                    recommendedAmount,
                    isPaid: false,
                    penaltyRisk: this.assessPenaltyRisk(null, quarterlyPayment, dueDate),
                }).returning();

                schedule.push({
                    quarter,
                    dueDate,
                    estimatedAmount: quarterlyPayment,
                    safeHarborAmount: safeHarbor.requiredPayment / 4,
                    recommendedAmount,
                    isPaid: false,
                    penaltyRisk: payment.penaltyRisk,
                });
            }
        }

        return schedule;
    }

    /**
     * Calculate due date for quarter
     */
    calculateDueDate(taxYear, quarter) {
        const dueDates = {
            1: new Date(taxYear, 3, 15),      // April 15
            2: new Date(taxYear, 5, 15),      // June 15
            3: new Date(taxYear, 8, 15),      // September 15
            4: new Date(taxYear + 1, 0, 15),  // January 15 (next year)
        };

        return dueDates[quarter];
    }

    /**
     * Assess penalty risk
     */
    assessPenaltyRisk(payment, requiredAmount, dueDate) {
        if (payment && payment.isPaid) {
            const paidAmount = parseFloat(payment.actualAmountPaid || 0);
            if (paidAmount >= requiredAmount * 0.9) {
                return 'low';
            } else if (paidAmount >= requiredAmount * 0.75) {
                return 'medium';
            } else {
                return 'high';
            }
        }

        // Check if due date has passed
        const today = new Date();
        if (today > dueDate) {
            return 'high'; // Overdue
        }

        const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
        if (daysUntilDue <= 7) {
            return 'high'; // Due soon
        } else if (daysUntilDue <= 30) {
            return 'medium';
        } else {
            return 'low';
        }
    }

    /**
     * Generate payment recommendations
     */
    generateRecommendations(totalNeeded, quarterlyAmount, safeHarbor) {
        const recommendations = [];

        recommendations.push({
            type: 'safe_harbor',
            title: 'Use Safe Harbor Method',
            description: `Pay ${safeHarbor.recommended} to avoid underpayment penalties, even if you owe more tax at year-end.`,
        });

        if (totalNeeded > 10000) {
            recommendations.push({
                type: 'cash_flow',
                title: 'Plan for Cash Flow',
                description: `You need to pay approximately $${Math.ceil(quarterlyAmount).toLocaleString()} each quarter. Set aside funds from income regularly to avoid cash flow issues.`,
            });
        }

        recommendations.push({
            type: 'automation',
            title: 'Set Up Payment Reminders',
            description: 'Enable automatic reminders 2 weeks before each quarterly deadline to avoid late payment penalties.',
        });

        recommendations.push({
            type: 'online_payment',
            title: 'Pay Online via IRS Direct Pay',
            description: 'Use IRS Direct Pay (free) or EFTPS to make secure electronic payments. Keep confirmation numbers for your records.',
        });

        return recommendations;
    }

    /**
     * Record a quarterly payment
     */
    async recordPayment(userId, taxYear, quarter, paymentDetails) {
        try {
            const { amount, paymentDate, paymentMethod, confirmationNumber } = paymentDetails;

            await db.update(quarterlyTaxPayments)
                .set({
                    actualAmountPaid: amount,
                    paymentDate: new Date(paymentDate),
                    paymentMethod,
                    confirmationNumber,
                    isPaid: true,
                    penaltyRisk: 'low',
                    updatedAt: new Date(),
                })
                .where(and(
                    eq(quarterlyTaxPayments.userId, userId),
                    eq(quarterlyTaxPayments.taxYear, taxYear),
                    eq(quarterlyTaxPayments.quarter, quarter)
                ));

            return {
                success: true,
                message: `Q${quarter} ${taxYear} payment recorded successfully`,
            };

        } catch (error) {
            console.error('Error recording quarterly payment:', error);
            throw error;
        }
    }

    /**
     * Get payment status for the year
     */
    async getPaymentStatus(userId, taxYear = new Date().getFullYear()) {
        try {
            const payments = await db.select()
                .from(quarterlyTaxPayments)
                .where(and(
                    eq(quarterlyTaxPayments.userId, userId),
                    eq(quarterlyTaxPayments.taxYear, taxYear)
                ))
                .orderBy(quarterlyTaxPayments.quarter);

            const totalPaid = payments.reduce((sum, p) => 
                sum + parseFloat(p.actualAmountPaid || 0), 0
            );

            const totalRequired = payments.reduce((sum, p) => 
                sum + parseFloat(p.recommendedAmount || 0), 0
            );

            const paidCount = payments.filter(p => p.isPaid).length;
            const overdueCount = payments.filter(p => 
                !p.isPaid && new Date(p.dueDate) < new Date()
            ).length;

            return {
                success: true,
                taxYear,
                summary: {
                    totalPaid,
                    totalRequired,
                    remainingBalance: Math.max(0, totalRequired - totalPaid),
                    paidQuarters: paidCount,
                    overdueQuarters: overdueCount,
                    complianceStatus: paidCount === 4 ? 'compliant' : 
                                    overdueCount > 0 ? 'overdue' : 'in_progress',
                },
                payments,
            };

        } catch (error) {
            console.error('Error getting payment status:', error);
            throw error;
        }
    }

    /**
     * Send payment reminders
     */
    async sendPaymentReminders(userId, taxYear = new Date().getFullYear()) {
        try {
            const payments = await db.select()
                .from(quarterlyTaxPayments)
                .where(and(
                    eq(quarterlyTaxPayments.userId, userId),
                    eq(quarterlyTaxPayments.taxYear, taxYear),
                    eq(quarterlyTaxPayments.isPaid, false)
                ));

            const reminders = [];
            const today = new Date();

            for (const payment of payments) {
                const dueDate = new Date(payment.dueDate);
                const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

                if (daysUntilDue <= 14 && daysUntilDue >= 0 && !payment.reminderSent) {
                    // Send reminder
                    reminders.push({
                        quarter: payment.quarter,
                        dueDate: payment.dueDate,
                        amount: payment.recommendedAmount,
                        daysUntilDue,
                        urgency: daysUntilDue <= 7 ? 'high' : 'medium',
                    });

                    // Mark reminder as sent
                    await db.update(quarterlyTaxPayments)
                        .set({ reminderSent: true })
                        .where(eq(quarterlyTaxPayments.id, payment.id));
                }
            }

            return {
                success: true,
                reminders,
                count: reminders.length,
            };

        } catch (error) {
            console.error('Error sending payment reminders:', error);
            throw error;
        }
    }

    /**
     * Calculate underpayment penalty
     */
    calculateUnderpaymentPenalty(totalRequired, totalPaid, taxYear) {
        const underpaid = Math.max(0, totalRequired - totalPaid);
        
        if (underpaid === 0) {
            return {
                hasPenalty: false,
                underpaidAmount: 0,
                estimatedPenalty: 0,
            };
        }

        // IRS underpayment penalty rate (approximately 8% for 2026, varies quarterly)
        const penaltyRate = 0.08;
        
        // Simplified penalty calculation (actual calculation is more complex)
        const estimatedPenalty = underpaid * penaltyRate;

        return {
            hasPenalty: true,
            underpaidAmount: underpaid,
            estimatedPenalty,
            penaltyRate: `${(penaltyRate * 100).toFixed(2)}%`,
            recommendation: 'Consider making an additional payment to reduce penalty',
        };
    }
}

export default new QuarterlyTaxEstimator();
