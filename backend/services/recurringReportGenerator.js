/**
 * Recurring Report Generator Service
 * Generates monthly/yearly reports and analytics for recurring transactions
 * Provides insights into spending patterns, trends, and budget allocation
 * 
 * Issue #663: Recurring Transactions & Bill Tracking
 */

const { parseISO, startOfMonth, endOfMonth, format, getMonth, getYear, differenceInMonths } = require('date-fns');

class RecurringReportGenerator {
    /**
     * Report Periods
     */
    static PERIOD = {
        MONTHLY: 'monthly',
        QUARTERLY: 'quarterly',
        SEMIANNUAL: 'semiannual',
        ANNUAL: 'annual',
        CUSTOM: 'custom',
    };

    /**
     * Generate monthly report for recurring transactions
     * @param {Array} recurringTransactions - Active recurring transactions
     * @param {Array} billPayments - Bill payment history
     * @param {Date} reportMonth - Month to report on
     * @returns {Object} Monthly report
     */
    static generateMonthlyReport(recurringTransactions, billPayments, reportMonth = new Date()) {
        const monthStart = startOfMonth(reportMonth);
        const monthEnd = endOfMonth(reportMonth);

        return {
            period: this.PERIOD.MONTHLY,
            reportMonth: format(monthStart, 'yyyy-MM'),
            monthName: format(monthStart, 'MMMM yyyy'),
            generatedAt: new Date().toISOString(),
            summary: this.calculateMonthlySummary(
                recurringTransactions,
                billPayments,
                monthStart,
                monthEnd
            ),
            breakdown: this.generateMonthlyBreakdown(
                recurringTransactions,
                billPayments,
                monthStart,
                monthEnd
            ),
            trends: this.getMonthlySummaryTrend(billPayments, reportMonth),
            recommendations: this.getMonthlyRecommendations(
                recurringTransactions,
                billPayments,
                monthStart,
                monthEnd
            ),
        };
    }

    /**
     * Calculate monthly summary statistics
     * @private
     */
    static calculateMonthlySummary(recurringTransactions, billPayments, monthStart, monthEnd) {
        // Filter bills for the month
        const monthlyBills = billPayments.filter(bill => {
            const billDate = parseISO(bill.billDate);
            return billDate >= monthStart && billDate <= monthEnd;
        });

        const paidBills = monthlyBills.filter(b => b.status === 'paid');
        const totalBilled = monthlyBills.reduce((sum, b) => sum + parseFloat(b.amount), 0);
        const totalPaid = paidBills.reduce((sum, b) => sum + parseFloat(b.actualAmount || b.amount), 0);
        const overdueAmount = monthlyBills
            .filter(b => b.status === 'overdue')
            .reduce((sum, b) => sum + parseFloat(b.amount), 0);

        // Calculate payment performance
        const onTimePayments = paidBills.filter(b => {
            const paymentDate = parseISO(b.paymentDate);
            const dueDate = parseISO(b.dueDate);
            return paymentDate <= dueDate;
        });

        const paymentOnTimeRate = paidBills.length > 0 ?
            (onTimePayments.length / paidBills.length) * 100 : 0;

        return {
            totalBills: monthlyBills.length,
            billsPaid: paidBills.length,
            billsOverdue: monthlyBills.filter(b => b.status === 'overdue').length,
            billsScheduled: monthlyBills.filter(b => b.status === 'scheduled').length,
            totalBilled: parseFloat(totalBilled.toFixed(2)),
            totalPaid: parseFloat(totalPaid.toFixed(2)),
            totalOverdue: parseFloat(overdueAmount.toFixed(2)),
            averageBillAmount: monthlyBills.length > 0 ?
                parseFloat((totalBilled / monthlyBills.length).toFixed(2)) : 0,
            paymentOnTimeRate: parseFloat(paymentOnTimeRate.toFixed(1)),
            unpaidAmount: monthlyBills.length > 0 ?
                parseFloat((totalBilled - totalPaid).toFixed(2)) : 0,
        };
    }

    /**
     * Generate breakdown by category
     * @private
     */
    static generateMonthlyBreakdown(recurringTransactions, billPayments, monthStart, monthEnd) {
        const monthlyBills = billPayments.filter(bill => {
            const billDate = parseISO(bill.billDate);
            return billDate >= monthStart && billDate <= monthEnd;
        });

        const breakdown = {};

        for (const bill of monthlyBills) {
            const recurring = recurringTransactions.find(r => r.id === bill.recurringTransactionId);
            const category = recurring?.category || 'Other';

            if (!breakdown[category]) {
                breakdown[category] = {
                    category: category,
                    count: 0,
                    totalAmount: 0,
                    paidAmount: 0,
                    transactions: [],
                };
            }

            breakdown[category].count += 1;
            breakdown[category].totalAmount += parseFloat(bill.amount);
            if (bill.status === 'paid') {
                breakdown[category].paidAmount += parseFloat(bill.actualAmount || bill.amount);
            }
            breakdown[category].transactions.push({
                merchant: recurring?.merchant,
                amount: bill.amount,
                status: bill.status,
                dueDate: bill.dueDate,
            });
        }

        // Format and sort by amount
        return Object.values(breakdown)
            .map(cat => ({
                ...cat,
                totalAmount: parseFloat(cat.totalAmount.toFixed(2)),
                paidAmount: parseFloat(cat.paidAmount.toFixed(2)),
                percentage: monthlyBills.length > 0 ?
                    parseFloat(((cat.totalAmount / monthlyBills.reduce((sum, b) => sum + parseFloat(b.amount), 0)) * 100).toFixed(1)) : 0,
            }))
            .sort((a, b) => b.totalAmount - a.totalAmount);
    }

    /**
     * Get month-over-month trend
     * @private
     */
    static getMonthlySummaryTrend(billPayments, currentMonth) {
        const trends = {};

        // Analyze last 6 months
        for (let i = 0; i < 6; i++) {
            const monthDate = new Date(currentMonth);
            monthDate.setMonth(monthDate.getMonth() - i);

            const monthStart = startOfMonth(monthDate);
            const monthEnd = endOfMonth(monthDate);

            const monthlyBills = billPayments.filter(bill => {
                const billDate = parseISO(bill.billDate);
                return billDate >= monthStart && billDate <= monthEnd;
            });

            const totalAmount = monthlyBills.reduce((sum, b) => sum + parseFloat(b.amount), 0);
            const monthKey = format(monthDate, 'yyyy-MM');

            trends[monthKey] = parseFloat(totalAmount.toFixed(2));
        }

        // Calculate trend direction
        const monthKeys = Object.keys(trends).sort().reverse();
        const trendDirection = monthKeys.length >= 2 ? 
            trends[monthKeys[0]] > trends[monthKeys[1]] ? 'increasing' : 'decreasing' : 'stable';

        return {
            monthlyTotals: trends,
            trendDirection: trendDirection,
            trendPercentage: monthKeys.length >= 2 ? 
                parseFloat((((trends[monthKeys[0]] - trends[monthKeys[1]]) / trends[monthKeys[1]]) * 100).toFixed(1)) : 0,
        };
    }

    /**
     * Get recommendations based on monthly data
     * @private
     */
    static getMonthlyRecommendations(recurringTransactions, billPayments, monthStart, monthEnd) {
        const recommendations = [];
        const monthlyBills = billPayments.filter(bill => {
            const billDate = parseISO(bill.billDate);
            return billDate >= monthStart && billDate <= monthEnd;
        });

        // Check for late payments
        const latePayments = monthlyBills
            .filter(b => b.status === 'paid');
        const lateCount = latePayments
            .filter(b => parseISO(b.paymentDate) > parseISO(b.dueDate)).length;

        if (lateCount > 0) {
            recommendations.push({
                category: 'payment_timing',
                severity: 'medium',
                message: `${lateCount} payment(s) were late this month`,
                action: 'Set up payment reminders or enable auto-pay',
            });
        }

        // Check for overdue bills
        const overdueCount = monthlyBills
            .filter(b => b.status === 'overdue').length;

        if (overdueCount > 0) {
            recommendations.push({
                category: 'overdue_bills',
                severity: 'high',
                message: `${overdueCount} bill(s) still overdue`,
                action: 'Process outstanding payments immediately',
            });
        }

        return recommendations;
    }

    /**
     * Generate quarterly report
     * @param {Array} recurringTransactions - Recurring transactions
     * @param {Array} billPayments - Bill payment history
     * @param {Date} reportDate - Date within the quarter
     * @returns {Object} Quarterly report
     */
    static generateQuarterlyReport(recurringTransactions, billPayments, reportDate = new Date()) {
        const month = getMonth(reportDate);
        const year = getYear(reportDate);
        const quarterStart = new Date(year, Math.floor(month / 3) * 3, 1);
        const quarterEnd = new Date(year, Math.floor(month / 3) * 3 + 3, 0);
        const quarter = Math.floor(month / 3) + 1;

        // Get 3 months of reports
        const monthlyReports = [];
        const allBills = [];

        for (let i = 0; i < 3; i++) {
            const monthDate = new Date(quarterStart);
            monthDate.setMonth(monthDate.getMonth() + i);

            const monthStart = startOfMonth(monthDate);
            const monthEnd = endOfMonth(monthDate);

            const monthlyBills = billPayments.filter(bill => {
                const billDate = parseISO(bill.billDate);
                return billDate >= monthStart && billDate <= monthEnd;
            });

            allBills.push(...monthlyBills);

            monthlyReports.push({
                month: format(monthDate, 'MMMM'),
                totalBilled: monthlyBills.reduce((sum, b) => sum + parseFloat(b.amount), 0),
            });
        }

        return {
            period: this.PERIOD.QUARTERLY,
            quarter: `Q${quarter} ${year}`,
            quarterStartDate: quarterStart,
            quarterEndDate: quarterEnd,
            generatedAt: new Date().toISOString(),
            summary: {
                totalBills: allBills.length,
                totalBilled: parseFloat(allBills.reduce((sum, b) => sum + parseFloat(b.amount), 0).toFixed(2)),
                totalPaid: parseFloat(allBills
                    .filter(b => b.status === 'paid')
                    .reduce((sum, b) => sum + parseFloat(b.actualAmount || b.amount), 0)
                    .toFixed(2)),
                averageMonthlyAmount: parseFloat((allBills.reduce((sum, b) => sum + parseFloat(b.amount), 0) / 3).toFixed(2)),
            },
            monthlyBreakdown: monthlyReports,
        };
    }

    /**
     * Generate annual report
     * @param {Array} recurringTransactions - Recurring transactions
     * @param {Array} billPayments - Bill payment history
     * @param {number} reportYear - Year to report on
     * @returns {Object} Annual report
     */
    static generateAnnualReport(recurringTransactions, billPayments, reportYear = getYear(new Date())) {
        const yearStart = new Date(reportYear, 0, 1);
        const yearEnd = new Date(reportYear, 11, 31);

        const yearlyBills = billPayments.filter(bill => {
            const billDate = parseISO(bill.billDate);
            return billDate >= yearStart && billDate <= yearEnd;
        });

        // Calculate quarterly totals
        const quarterlyTotals = {};
        for (let q = 1; q <= 4; q++) {
            const qStart = new Date(reportYear, (q - 1) * 3, 1);
            const qEnd = new Date(reportYear, (q - 1) * 3 + 3, 0);

            const qBills = yearlyBills.filter(bill => {
                const billDate = parseISO(bill.billDate);
                return billDate >= qStart && billDate <= qEnd;
            });

            quarterlyTotals[`Q${q}`] = parseFloat(
                qBills.reduce((sum, b) => sum + parseFloat(b.amount), 0).toFixed(2)
            );
        }

        const totalBilled = yearlyBills.reduce((sum, b) => sum + parseFloat(b.amount), 0);
        const totalPaid = yearlyBills
            .filter(b => b.status === 'paid')
            .reduce((sum, b) => sum + parseFloat(b.actualAmount || b.amount), 0);

        return {
            period: this.PERIOD.ANNUAL,
            year: reportYear,
            generatedAt: new Date().toISOString(),
            summary: {
                totalBills: yearlyBills.length,
                totalBilled: parseFloat(totalBilled.toFixed(2)),
                totalPaid: parseFloat(totalPaid.toFixed(2)),
                averageMonthlyAmount: parseFloat((totalBilled / 12).toFixed(2)),
                paymentOnTimeRate: yearlyBills.length > 0 ?
                    parseFloat((yearlyBills.filter(b => b.status === 'paid').length / yearlyBills.length * 100).toFixed(1)) : 0,
            },
            quarterlyTotals: quarterlyTotals,
            topCategories: this.getYearlyTopCategories(recurringTransactions, yearlyBills),
            annualSavingOpportunities: this.getAnnualSavingOpportunities(yearlyBills),
        };
    }

    /**
     * Get top spending categories for annual report
     * @private
     */
    static getYearlyTopCategories(recurringTransactions, bills) {
        const categories = {};

        for (const bill of bills) {
            const recurring = recurringTransactions.find(r => r.id === bill.recurringTransactionId);
            const category = recurring?.category || 'Other';

            if (!categories[category]) {
                categories[category] = 0;
            }
            categories[category] += parseFloat(bill.amount);
        }

        return Object.entries(categories)
            .map(([category, amount]) => ({
                category: category,
                totalAmount: parseFloat(amount.toFixed(2)),
                monthlyAverage: parseFloat((amount / 12).toFixed(2)),
                annualPercentage: bills.length > 0 ?
                    parseFloat(((amount / bills.reduce((sum, b) => sum + parseFloat(b.amount), 0)) * 100).toFixed(1)) : 0,
            }))
            .sort((a, b) => b.totalAmount - a.totalAmount)
            .slice(0, 10);
    }

    /**
     * Identify annual saving opportunities
     * @private
     */
    static getAnnualSavingOpportunities(bills) {
        const opportunities = [];

        // Group by merchant
        const merchants = {};
        for (const bill of bills) {
            const merchant = bill.recurringTransactionId; // Would be merchant ID
            if (!merchants[merchant]) {
                merchants[merchant] = [];
            }
            merchants[merchant].push(bill);
        }

        // Check for identical recurring amounts that could be optimized
        for (const [merchant, merchantBills] of Object.entries(merchants)) {
            const amounts = merchantBills.map(b => parseFloat(b.amount));
            const uniqueAmounts = new Set(amounts);

            if (uniqueAmounts.size > 1) {
                // Multiple different amounts for same merchant
                const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
                const maxAmount = Math.max(...amounts);
                const potentialSavings = (maxAmount - avgAmount) * 12;

                if (potentialSavings > 50) {
                    opportunities.push({
                        opportunity: 'Potential bulk discount or plan optimization',
                        estimatedAnnualSavings: parseFloat(potentialSavings.toFixed(2)),
                        currentAnnualSpend: parseFloat((avgAmount * 12).toFixed(2)),
                    });
                }
            }
        }

        return opportunities;
    }

    /**
     * Generate comparative analysis between periods
     * @param {Array} billPayments - Bill history
     * @param {Date} startPeriod - Start date
     * @param {Date} endPeriod - End date
     * @returns {Object} Comparison analysis
     */
    static generatePeriodComparison(billPayments, startPeriod, endPeriod) {
        const periodBills = billPayments.filter(bill => {
            const billDate = parseISO(bill.billDate);
            return billDate >= startPeriod && billDate <= endPeriod;
        });

        const totalAmount = periodBills.reduce((sum, b) => sum + parseFloat(b.amount), 0);
        const paidAmount = periodBills
            .filter(b => b.status === 'paid')
            .reduce((sum, b) => sum + parseFloat(b.actualAmount || b.amount), 0);

        return {
            period: `${format(startPeriod, 'yyyy-MM-dd')} to ${format(endPeriod, 'yyyy-MM-dd')}`,
            totalBills: periodBills.length,
            totalBilled: parseFloat(totalAmount.toFixed(2)),
            totalPaid: parseFloat(paidAmount.toFixed(2)),
            paymentRate: periodBills.length > 0 ?
                parseFloat(((paidAmount / totalAmount) * 100).toFixed(1)) : 0,
        };
    }

    /**
     * Export report as JSON
     * @param {Object} report - Report to export
     * @returns {string} JSON string
     */
    static exportAsJSON(report) {
        return JSON.stringify(report, null, 2);
    }

    /**
     * Export report as CSV
     * @param {Object} report - Report to export
     * @returns {string} CSV format
     */
    static exportAsCSV(report) {
        if (!report.breakdown) {
            return 'Report format not suitable for CSV export';
        }

        const headers = ['Category', 'Count', 'Total Amount', 'Paid Amount', 'Percentage'];
        const rows = report.breakdown.map(cat => [
            cat.category,
            cat.count,
            cat.totalAmount,
            cat.paidAmount,
            cat.percentage,
        ]);

        return [headers, ...rows]
            .map(row => row.map(cell => `"${cell}"`).join(','))
            .join('\n');
    }

    /**
     * Get report summary email content
     * @param {Object} report - Report to summarize
     * @returns {string} Email-friendly summary
     */
    static generateEmailSummary(report) {
        const summary = report.summary || {};

        return `
Monthly Bill Summary - ${report.monthName}

Total Bills: ${summary.totalBills}
Total Billed: $${summary.totalBilled}
Total Paid: $${summary.totalPaid}
Overdue Amount: $${summary.totalOverdue}

Payment Performance
On-Time Rate: ${summary.paymentOnTimeRate}%
Bills Paid: ${summary.billsPaid} of ${summary.totalBills}

Top Categories (by amount):
${report.breakdown?.slice(0, 5).map(cat => 
    `  - ${cat.category}: $${cat.totalAmount} (${cat.percentage}%)`
).join('\n')}

${report.recommendations?.length > 0 ? `\nRecommendations:\n${report.recommendations.map(r => 
    `  - ${r.message}`
).join('\n')}` : ''}
        `;
    }
}

module.exports = RecurringReportGenerator;
