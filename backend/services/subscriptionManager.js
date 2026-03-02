/**
 * Subscription Manager Service
 * Manages subscription details, renewals, accounts, and cancellation tracking
 * 
 * Issue #663: Recurring Transactions & Bill Tracking
 */

const { parseISO, addDays, addMonths, addYears, isBefore, isAfter, differenceInDays, format, startOfDay } = require('date-fns');

class SubscriptionManager {
    /**
     * Subscription Types
     */
    static TYPES = {
        SOFTWARE: 'software',
        STREAMING: 'streaming',
        UTILITIES: 'utilities',
        CLOUD_STORAGE: 'cloud_storage',
        PRODUCTIVITY: 'productivity',
        ENTERTAINMENT: 'entertainment',
        MUSIC: 'music',
        EDUCATION: 'education',
        FITNESS: 'fitness',
        SECURITY: 'security',
        COMMUNICATION: 'communication',
        BUSINESS: 'business',
        PHOTOGRAPHY: 'photography',
        OTHER: 'other',
    };

    /**
     * Common subscription intervals
     */
    static INTERVALS = {
        MONTHLY: 'monthly',
        QUARTERLY: 'quarterly',
        SEMIANNUAL: 'semi_annual',
        ANNUAL: 'annual',
        CUSTOM: 'custom',
    };

    /**
     * Create subscription metadata from recurring transaction
     * @param {Object} recurringTransaction - The recurring transaction
     * @param {Object} subscriptionData - Subscription details
     * @returns {Object} Subscription metadata
     */
    static createSubscriptionMetadata(recurringTransaction, subscriptionData = {}) {
        return {
            recurringTransactionId: recurringTransaction.id,
            subscriptionType: subscriptionData.subscriptionType || this.TYPES.OTHER,
            accountId: subscriptionData.accountId || null,
            accountEmail: subscriptionData.accountEmail || null,
            serviceProvider: subscriptionData.serviceProvider || recurringTransaction.merchant || null,
            businessName: subscriptionData.businessName || null,
            cancellationUrl: subscriptionData.cancellationUrl || null,
            contactInfo: subscriptionData.contactInfo || null,
            autoRenewal: subscriptionData.autoRenewal !== false,
            renewalDate: subscriptionData.renewalDate || this.calculateNextRenewalDate(recurringTransaction),
            estimatedYearlyValue: this.calculateYearlyValue(recurringTransaction),
            features: subscriptionData.features || [],
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    /**
     * Calculate next renewal date based on recurring transaction
     * @private
     */
    static calculateNextRenewalDate(recurringTransaction) {
        const nextDue = parseISO(recurringTransaction.nextDueDate || new Date());
        
        // Map frequency to renewal calculation
        const frequencyMap = {
            weekly: (date) => addDays(date, 7),
            biweekly: (date) => addDays(date, 14),
            monthly: (date) => addMonths(date, 1),
            quarterly: (date) => addMonths(date, 3),
            semiannual: (date) => addMonths(date, 6),
            annual: (date) => addYears(date, 1),
            daily: (date) => addDays(date, 1),
        };

        const calculator = frequencyMap[recurringTransaction.frequency] || 
            ((date) => addMonths(date, 1));
        
        return calculator(nextDue);
    }

    /**
     * Calculate estimated yearly value from recurring transaction
     * @private
     */
    static calculateYearlyValue(recurringTransaction) {
        const amount = parseFloat(recurringTransaction.amount);
        
        const frequencyMultiplier = {
            daily: 365,
            weekly: 52,
            biweekly: 26,
            monthly: 12,
            quarterly: 4,
            semiannual: 2,
            annual: 1,
        };

        const multiplier = frequencyMultiplier[recurringTransaction.frequency] || 12;
        return parseFloat((amount * multiplier).toFixed(2));
    }

    /**
     * Update subscription renewal date
     * @param {Object} subscription - Subscription to update
     * @param {Date} newRenewalDate - New renewal date
     * @returns {Object} Updated subscription
     */
    static updateRenewalDate(subscription, newRenewalDate) {
        return {
            ...subscription,
            renewalDate: newRenewalDate,
            updatedAt: new Date(),
        };
    }

    /**
     * Toggle auto-renewal setting
     * @param {Object} subscription - Subscription to update
     * @param {boolean} autoRenewal - New auto-renewal setting
     * @returns {Object} Updated subscription
     */
    static toggleAutoRenewal(subscription, autoRenewal) {
        return {
            ...subscription,
            autoRenewal: autoRenewal,
            updatedAt: new Date(),
        };
    }

    /**
     * Get subscription status information
     * @param {Object} subscription - Subscription to check
     * @param {Array} billPayments - Associated bill payments
     * @returns {Object} Status information
     */
    static getSubscriptionStatus(subscription, billPayments = []) {
        const today = startOfDay(new Date());
        const renewalDate = startOfDay(parseISO(subscription.renewalDate));
        const daysUntilRenewal = differenceInDays(renewalDate, today);

        // Get latest payment
        const latestPayment = billPayments
            .filter(p => p.status === 'paid')
            .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate))[0];

        const status = {
            subscriptionId: subscription.id,
            serviceProvider: subscription.serviceProvider,
            currentStatus: 'active',
            renewalDate: subscription.renewalDate,
            daysUntilRenewal: daysUntilRenewal,
            autoRenewal: subscription.autoRenewal,
            lastPaymentDate: latestPayment?.paymentDate || null,
            lastPaymentAmount: latestPayment?.actualAmount || null,
            estimatedYearlyValue: subscription.estimatedYearlyValue,
        };

        // Determine subscription status
        if (daysUntilRenewal < 0) {
            status.currentStatus = 'renewal_overdue';
            status.issueSeverity = 'high';
        } else if (daysUntilRenewal <= 7) {
            status.currentStatus = 'renewing_soon';
            status.issueSeverity = 'low';
        }

        return status;
    }

    /**
     * Generate renewal reminders
     * @param {Array} subscriptions - Subscriptions to check
     * @param {number} daysAhead - Days to look ahead for reminders
     * @returns {Array} Subscriptions needing reminders
     */
    static generateRenewalReminders(subscriptions, daysAhead = 7) {
        const today = new Date();
        const reminderDate = addDays(today, daysAhead);

        return subscriptions
            .filter(sub => {
                const renewalDate = parseISO(sub.renewalDate);
                return !isBefore(renewalDate, today) && 
                       isBefore(renewalDate, reminderDate);
            })
            .map(sub => {
                const renewalDate = parseISO(sub.renewalDate);
                return {
                    ...sub,
                    daysUntilRenewal: differenceInDays(renewalDate, today),
                    reminderType: 'renewal_upcoming',
                    reminderPriority: differenceInDays(renewalDate, today) <= 3 ? 'high' : 'medium',
                };
            })
            .sort((a, b) => a.daysUntilRenewal - b.daysUntilRenewal);
    }

    /**
     * Identify subscriptions at risk of non-renewal
     * @param {Array} subscriptions - Subscriptions to analyze
     * @param {Array} allBillPayments - All bill payments
     * @returns {Array} At-risk subscriptions
     */
    static identifyAtRiskSubscriptions(subscriptions, allBillPayments) {
        const riskSubscriptions = [];

        for (const subscription of subscriptions) {
            const relatedPayments = allBillPayments
                .filter(p => p.recurringTransactionId === subscription.recurringTransactionId)
                .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));

            let riskFactors = [];
            let riskScore = 0;

            // Check for failed payments
            const failedPayments = relatedPayments
                .filter(p => p.status === 'failed');
            if (failedPayments.length > 0) {
                riskFactors.push(`${failedPayments.length} failed payment(s)`);
                riskScore += failedPayments.length * 20;
            }

            // Check for overdue bills
            const overduePayments = relatedPayments
                .filter(p => p.status === 'overdue');
            if (overduePayments.length > 0) {
                riskFactors.push(`${overduePayments.length} overdue bill(s)`);
                riskScore += overduePayments.length * 15;
            }

            // Check auto-renewal status
            if (!subscription.autoRenewal) {
                riskFactors.push('Auto-renewal disabled');
                riskScore += 10;
            }

            // Check for skipped payments
            const skippedPayments = relatedPayments
                .filter(p => p.status === 'skipped')
                .slice(0, 2);
            if (skippedPayments.length > 1) {
                riskFactors.push(`${skippedPayments.length} skipped payment(s)`);
                riskScore += skippedPayments.length * 10;
            }

            if (riskScore > 0) {
                riskSubscriptions.push({
                    ...subscription,
                    riskScore: Math.min(riskScore, 100),
                    riskFactors: riskFactors,
                    riskLevel: riskScore > 50 ? 'high' : riskScore > 20 ? 'medium' : 'low',
                    paymentHistory: {
                        totalPayments: relatedPayments.length,
                        successfulPayments: relatedPayments.filter(p => p.status === 'paid').length,
                        failedPayments: failedPayments.length,
                        overduePayments: overduePayments.length,
                    },
                });
            }
        }

        return riskSubscriptions.sort((a, b) => b.riskScore - a.riskScore);
    }

    /**
     * Get subscription portfolio value
     * @param {Array} subscriptions - Subscriptions to analyze
     * @returns {Object} Portfolio analysis
     */
    static analyzeSubscriptionPortfolio(subscriptions) {
        const total = {
            count: subscriptions.length,
            monthlyTotal: 0,
            yearlyTotal: 0,
            byType: {},
        };

        // Calculate totals and group by type
        for (const sub of subscriptions) {
            const yearlyValue = parseFloat(sub.estimatedYearlyValue || 0);
            const monthlyValue = yearlyValue / 12;

            total.monthlyTotal += monthlyValue;
            total.yearlyTotal += yearlyValue;

            if (!total.byType[sub.subscriptionType]) {
                total.byType[sub.subscriptionType] = {
                    count: 0,
                    monthlyTotal: 0,
                    yearlyTotal: 0,
                };
            }

            total.byType[sub.subscriptionType].count += 1;
            total.byType[sub.subscriptionType].monthlyTotal += monthlyValue;
            total.byType[sub.subscriptionType].yearlyTotal += yearlyValue;
        }

        // Round values
        total.monthlyTotal = parseFloat(total.monthlyTotal.toFixed(2));
        total.yearlyTotal = parseFloat(total.yearlyTotal.toFixed(2));

        Object.keys(total.byType).forEach(type => {
            total.byType[type].monthlyTotal = parseFloat(total.byType[type].monthlyTotal.toFixed(2));
            total.byType[type].yearlyTotal = parseFloat(total.byType[type].yearlyTotal.toFixed(2));
        });

        // Find most expensive subscriptions
        const mostExpensive = subscriptions
            .sort((a, b) => parseFloat(b.estimatedYearlyValue) - parseFloat(a.estimatedYearlyValue))
            .slice(0, 5);

        return {
            totalSubscriptions: total.count,
            monthlySpending: total.monthlyTotal,
            yearlySpending: total.yearlyTotal,
            spendingByType: total.byType,
            mostExpensive: mostExpensive.map(sub => ({
                serviceProvider: sub.serviceProvider,
                type: sub.subscriptionType,
                yearlyValue: sub.estimatedYearlyValue,
                monthlyValue: (parseFloat(sub.estimatedYearlyValue) / 12).toFixed(2),
            })),
        };
    }

    /**
     * Get subscription recommendations
     * @param {Array} subscriptions - User's subscriptions
     * @param {Object} portfolio - Portfolio analysis
     * @returns {Array} Recommendations
     */
    static getSubscriptionRecommendations(subscriptions, portfolio) {
        const recommendations = [];

        // Recommendation 1: High spending subscriptions
        if (portfolio.yearlySpending > 500) {
            recommendations.push({
                category: 'spending',
                priority: 'high',
                title: 'Review high-cost subscriptions',
                description: `You're spending $${portfolio.yearlySpending.toFixed(2)}/year on subscriptions`,
                suggestion: 'Consider canceling unused services or downgrading to lower tiers',
                estimatedSavings: portfolio.yearlySpending * 0.1, // Estimate 10% savings
            });
        }

        // Recommendation 2: Duplicate subscriptions
        const typeGrouped = {};
        subscriptions.forEach(sub => {
            if (!typeGrouped[sub.subscriptionType]) {
                typeGrouped[sub.subscriptionType] = [];
            }
            typeGrouped[sub.subscriptionType].push(sub);
        });

        for (const [type, subs] of Object.entries(typeGrouped)) {
            if (subs.length > 1) {
                const duplicates = subs.slice(1);
                const savingsEstimate = duplicates.reduce((sum, sub) => 
                    sum + parseFloat(sub.estimatedYearlyValue), 0
                );

                recommendations.push({
                    category: 'duplicates',
                    priority: 'high',
                    title: `Multiple ${type} subscriptions detected`,
                    description: `You have ${subs.length} ${type} subscriptions`,
                    suggestion: 'Consider keeping only the one you use most',
                    estimatedSavings: savingsEstimate,
                    affectedSubscriptions: duplicates.map(s => s.serviceProvider),
                });
            }
        }

        // Recommendation 3: Auto-renewal disabled
        const autoRenewalDisabled = subscriptions
            .filter(s => !s.autoRenewal);

        if (autoRenewalDisabled.length > 0) {
            recommendations.push({
                category: 'auto_renewal',
                priority: 'medium',
                title: 'Manual renewal required',
                description: `${autoRenewalDisabled.length} subscription(s) don't auto-renew`,
                suggestion: 'Set up reminders or enable auto-renewal for uninterrupted service',
                affectedSubscriptions: autoRenewalDisabled.map(s => s.serviceProvider),
            });
        }

        // Recommendation 4: Unused services
        const freeServices = subscriptions
            .filter(s => parseFloat(s.estimatedYearlyValue) === 0);

        if (freeServices.length > 0) {
            recommendations.push({
                category: 'unused',
                priority: 'low',
                title: 'Free subscriptions on record',
                description: `${freeServices.length} free service(s) tracked`,
                suggestion: 'Clean up free services if no longer used',
                affectedSubscriptions: freeServices.map(s => s.serviceProvider),
            });
        }

        return recommendations.sort((a, b) => {
            const priorityMap = { high: 3, medium: 2, low: 1 };
            return (priorityMap[b.priority] || 0) - (priorityMap[a.priority] || 0);
        });
    }

    /**
     * Calculate subscription value vs usage
     * @param {Object} subscription - Subscription to evaluate
     * @param {Array} billPayments - Payment history
     * @returns {Object} Value assessment
     */
    static assessSubscriptionValue(subscription, billPayments = []) {
        const yearlyValue = parseFloat(subscription.estimatedYearlyValue || 0);
        const monthlyValue = yearlyValue / 12;

        // Count payments
        const successfulPayments = billPayments
            .filter(p => p.status === 'paid').length;

        const paymentRate = successfulPayments / (billPayments.length || 1);

        return {
            serviceProvider: subscription.serviceProvider,
            subscriptionType: subscription.subscriptionType,
            estimatedMonthlyValue: monthlyValue.toFixed(2),
            estimatedYearlyValue: yearlyValue.toFixed(2),
            paymentHistory: {
                totalBills: billPayments.length,
                successfulPayments: successfulPayments,
                paymentRate: parseFloat((paymentRate * 100).toFixed(1)),
            },
            valueAssessment: paymentRate >= 0.9 ? 'high' : paymentRate >= 0.7 ? 'medium' : 'low',
            recommendations: this.getValueRecommendations(paymentRate, monthlyValue),
        };
    }

    /**
     * Get value-based recommendations
     * @private
     */
    static getValueRecommendations(paymentRate, monthlyValue) {
        const recommendations = [];

        if (paymentRate < 0.7) {
            recommendations.push({
                severity: 'high',
                message: 'Consider canceling - low payment success rate',
            });
        }

        if (monthlyValue > 25) {
            recommendations.push({
                severity: 'medium',
                message: 'High cost subscription - verify regular usage',
            });
        }

        return recommendations;
    }

    /**
     * Export subscriptions to structured format
     * @param {Array} subscriptions - Subscriptions to export
     * @returns {Object} Exported data
     */
    static exportSubscriptions(subscriptions) {
        return {
            exportDate: new Date().toISOString(),
            subscriptionCount: subscriptions.length,
            subscriptions: subscriptions.map(sub => ({
                serviceProvider: sub.serviceProvider,
                type: sub.subscriptionType,
                accountEmail: sub.accountEmail,
                monthlyValue: (parseFloat(sub.estimatedYearlyValue) / 12).toFixed(2),
                yearlyValue: sub.estimatedYearlyValue,
                renewalDate: format(parseISO(sub.renewalDate), 'yyyy-MM-dd'),
                autoRenewal: sub.autoRenewal,
                cancellationUrl: sub.cancellationUrl,
            })),
        };
    }
}

module.exports = SubscriptionManager;
