/**
 * Bill Tracking Engine Service
 * Manages bill payments, tracks statuses, and handles payment scheduling
 * 
 * Issue #663: Recurring Transactions & Bill Tracking
 */

const { parseISO, addDays, startOfDay, isBefore, isAfter, differenceInDays, format, endOfDay } = require('date-fns');

class BillTrackingEngine {
    /**
     * Bill Status Enum
     */
    static STATUS = {
        SCHEDULED: 'scheduled',
        DUE: 'due',
        OVERDUE: 'overdue',
        PAID: 'paid',
        SKIPPED: 'skipped',
        FAILED: 'failed',
    };

    /**
     * Payment priority levels
     */
    static PRIORITY = {
        CRITICAL: 'critical',    // Overdue by 30+ days
        HIGH: 'high',             // Overdue or due in 1-3 days
        MEDIUM: 'medium',         // Due in 4-7 days
        LOW: 'low',               // Due in 8+ days
        FUTURE: 'future',         // Scheduled for future
    };

    /**
     * Create a new bill entry for a recurring transaction
     * @param {Object} recurringTransaction - The recurring transaction
     * @param {Date} billDate - Date the bill occurred
     * @param {Date} dueDate - Due date for payment
     * @returns {Object} New bill entry
     */
    static createBillEntry(recurringTransaction, billDate, dueDate) {
        const today = startOfDay(new Date());
        let status = this.STATUS.SCHEDULED;

        // Determine initial status
        if (isBefore(dueDate, today)) {
            status = this.STATUS.OVERDUE;
        } else if (
            isBefore(dueDate, addDays(today, 1)) ||
            isBefore(dueDate, addDays(today, 1))
        ) {
            status = this.STATUS.DUE;
        }

        return {
            recurringTransactionId: recurringTransaction.id,
            billDate: billDate,
            dueDate: dueDate,
            status: status,
            amount: recurringTransaction.amount,
            actualAmount: null,
            paymentDate: null,
            paymentMethod: null,
            notes: null,
            relatedTransactionId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    /**
     * Update bill status based on current date
     * @param {Object} bill - Bill to update
     * @returns {Object} Updated bill
     */
    static updateBillStatus(bill) {
        const today = startOfDay(new Date());
        const dueDate = startOfDay(parseISO(bill.dueDate));
        
        // If already paid or skipped, don't change status
        if (bill.status === this.STATUS.PAID || bill.status === this.STATUS.SKIPPED) {
            return bill;
        }

        let newStatus = bill.status;

        if (isBefore(dueDate, today)) {
            newStatus = this.STATUS.OVERDUE;
        } else if (isBefore(dueDate, addDays(today, 1))) {
            newStatus = this.STATUS.DUE;
        } else {
            newStatus = this.STATUS.SCHEDULED;
        }

        if (newStatus !== bill.status) {
            bill.status = newStatus;
            bill.updatedAt = new Date();
        }

        return bill;
    }

    /**
     * Mark bill as paid
     * @param {Object} bill - Bill to mark as paid
     * @param {number} paymentAmount - Actual payment amount
     * @param {string} paymentMethod - How it was paid
     * @param {Object} transaction - Related transaction object
     * @returns {Object} Updated bill
     */
    static markAsPaid(bill, paymentAmount, paymentMethod = null, transaction = null) {
        return {
            ...bill,
            status: this.STATUS.PAID,
            actualAmount: paymentAmount,
            paymentDate: new Date(),
            paymentMethod: paymentMethod,
            relatedTransactionId: transaction?.id || null,
            updatedAt: new Date(),
        };
    }

    /**
     * Mark bill as skipped
     * @param {Object} bill - Bill to skip
     * @param {string} reason - Reason for skipping
     * @returns {Object} Updated bill
     */
    static markAsSkipped(bill, reason = null) {
        return {
            ...bill,
            status: this.STATUS.SKIPPED,
            notes: reason || bill.notes,
            updatedAt: new Date(),
        };
    }

    /**
     * Mark bill payment as failed
     * @param {Object} bill - Bill with failed payment
     * @param {string} reason - Reason for failure
     * @returns {Object} Updated bill
     */
    static markAsFailed(bill, reason = null) {
        return {
            ...bill,
            status: this.STATUS.FAILED,
            notes: reason || bill.notes,
            updatedAt: new Date(),
        };
    }

    /**
     * Get days until due date
     * @param {Date} dueDate - Due date
     * @returns {number} Days until due (negative if overdue)
     */
    static getDaysTilDue(dueDate) {
        const today = startOfDay(new Date());
        const due = startOfDay(parseISO(dueDate));
        return differenceInDays(due, today);
    }

    /**
     * Calculate priority based on due date
     * @param {Object} bill - Bill to evaluate
     * @returns {string} Priority level
     */
    static calculatePriority(bill) {
        const daysTilDue = this.getDaysTilDue(bill.dueDate);

        if (bill.status === this.STATUS.PAID || bill.status === this.STATUS.SKIPPED) {
            return null;
        }

        if (daysTilDue < -30) {
            return this.PRIORITY.CRITICAL;
        } else if (daysTilDue < 3) {
            return daysTilDue < 0 ? this.PRIORITY.HIGH : this.PRIORITY.HIGH;
        } else if (daysTilDue < 8) {
            return this.PRIORITY.MEDIUM;
        } else if (daysTilDue < 14) {
            return this.PRIORITY.LOW;
        } else {
            return this.PRIORITY.FUTURE;
        }
    }

    /**
     * Generate upcoming bills from recurring transaction
     * @param {Object} recurringTransaction - The recurring transaction
     * @param {number} monthsAhead - How many months ahead to generate
     * @returns {Array} Generated bills
     */
    static generateUpcomingBills(recurringTransaction, monthsAhead = 3) {
        const bills = [];
        const today = new Date();
        let currentDate = parseISO(recurringTransaction.nextDueDate || today);

        // Map frequency to days
        const frequencyDays = {
            daily: 1,
            weekly: 7,
            biweekly: 14,
            monthly: 30,
            quarterly: 90,
            semiannual: 180,
            annual: 365,
        };

        const intervalDays = frequencyDays[recurringTransaction.frequency] ||
            recurringTransaction.customFrequencyDays ||
            30;

        // Generate bills for the next N months
        for (let i = 0; i < Math.ceil((monthsAhead * 30) / intervalDays); i++) {
            const billDate = currentDate;
            const dueDate = addDays(billDate, 7); // Default 7 days to pay

            bills.push(this.createBillEntry(recurringTransaction, billDate, dueDate));
            currentDate = addDays(currentDate, intervalDays);
        }

        return bills;
    }

    /**
     * Analyze bill payment history
     * @param {Array} bills - Bills to analyze
     * @returns {Object} Analysis results
     */
    static analyzeBillHistory(bills) {
        const paid = bills.filter(b => b.status === this.STATUS.PAID);
        const overdue = bills.filter(b => b.status === this.STATUS.OVERDUE);
        const upcoming = bills.filter(b => b.status === this.STATUS.DUE || b.status === this.STATUS.SCHEDULED);
        const failed = bills.filter(b => b.status === this.STATUS.FAILED);
        const skipped = bills.filter(b => b.status === this.STATUS.SKIPPED);

        // Calculate payment statistics
        const paidAmounts = paid.map(b => parseFloat(b.actualAmount || b.amount));
        const totalPaid = paidAmounts.reduce((sum, amt) => sum + amt, 0);
        const averagePaid = paidAmounts.length > 0 ? totalPaid / paidAmounts.length : 0;

        // Calculate payment timeliness
        const onTimePayments = paid.filter(b => {
            const daysLate = differenceInDays(parseISO(b.paymentDate), parseISO(b.dueDate));
            return daysLate <= 0;
        });
        const paymentOnTimeRate = paid.length > 0 ? (onTimePayments.length / paid.length) * 100 : 0;

        // Calculate payment delays
        const delays = paid.map(b => {
            const daysLate = differenceInDays(parseISO(b.paymentDate), parseISO(b.dueDate));
            return Math.max(daysLate, 0);
        });
        const averageDelay = delays.length > 0 ? delays.reduce((a, b) => a + b, 0) / delays.length : 0;

        return {
            totalBills: bills.length,
            paidCount: paid.length,
            overdueCount: overdue.length,
            skippedCount: skipped.length,
            failedCount: failed.length,
            upcomingCount: upcoming.length,
            totalPaid: parseFloat(totalPaid.toFixed(2)),
            averagePaidAmount: parseFloat(averagePaid.toFixed(2)),
            paymentOnTimeRate: parseFloat(paymentOnTimeRate.toFixed(2)),
            averagePaymentDelay: parseFloat(averageDelay.toFixed(1)),
            maxDelay: Math.max(...delays, 0),
            paymentConsistency: paid.length > 1 ? this.calculatePaymentConsistency(paid) : 100,
        };
    }

    /**
     * Calculate payment consistency score
     * @private
     */
    static calculatePaymentConsistency(paidBills) {
        if (paidBills.length < 2) return 100;

        // Check payment timing consistency
        const delays = paidBills.map(b => {
            const daysLate = differenceInDays(parseISO(b.paymentDate), parseISO(b.dueDate));
            return Math.abs(daysLate);
        });

        const avgDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
        const variance = delays.reduce((sum, delay) => sum + Math.pow(delay - avgDelay, 2), 0) / delays.length;
        const stdDev = Math.sqrt(variance);

        // Convert standard deviation to consistency score (0-100)
        // Higher variance = lower consistency
        return Math.max(100 - (stdDev * 5), 0);
    }

    /**
     * Get overdue bills with urgency info
     * @param {Array} bills - Bills to check
     * @returns {Array} Overdue bills with urgency
     */
    static getOverdueBills(bills) {
        return bills
            .filter(b => b.status === this.STATUS.OVERDUE)
            .map(bill => {
                const daysOverdue = Math.abs(this.getDaysTilDue(bill.dueDate));
                return {
                    ...bill,
                    daysOverdue: daysOverdue,
                    urgency: daysOverdue > 30 ? 'CRITICAL' : daysOverdue > 7 ? 'HIGH' : 'MEDIUM',
                    totalDueAmount: bill.amount,
                };
            })
            .sort((a, b) => b.daysOverdue - a.daysOverdue);
    }

    /**
     * Get bills due soon (next 7 days)
     * @param {Array} bills - Bills to check
     * @returns {Array} Bills due soon
     */
    static getBillsDueSoon(bills) {
        const today = new Date();
        const oneWeekFromNow = addDays(today, 7);

        return bills
            .filter(b => b.status === this.STATUS.DUE || b.status === this.STATUS.SCHEDULED)
            .filter(b => {
                const dueDate = parseISO(b.dueDate);
                return !isBefore(dueDate, today) && isBefore(dueDate, oneWeekFromNow);
            })
            .map(bill => ({
                ...bill,
                daysTilDue: this.getDaysTilDue(bill.dueDate),
                priority: this.calculatePriority(bill),
            }))
            .sort((a, b) => a.daysTilDue - b.daysTilDue);
    }

    /**
     * Get bill summary by status
     * @param {Array} bills - Bills to summarize
     * @returns {Object} Summary by status
     */
    static getBillSummaryByStatus(bills) {
        const summary = {
            [this.STATUS.SCHEDULED]: { count: 0, total: 0 },
            [this.STATUS.DUE]: { count: 0, total: 0 },
            [this.STATUS.OVERDUE]: { count: 0, total: 0 },
            [this.STATUS.PAID]: { count: 0, total: 0 },
            [this.STATUS.SKIPPED]: { count: 0, total: 0 },
            [this.STATUS.FAILED]: { count: 0, total: 0 },
        };

        for (const bill of bills) {
            const amount = parseFloat(bill.actualAmount || bill.amount);
            summary[bill.status].count += 1;
            summary[bill.status].total += amount;
        }

        // Format totals
        Object.keys(summary).forEach(status => {
            summary[status].total = parseFloat(summary[status].total.toFixed(2));
        });

        return summary;
    }

    /**
     * Estimate next month's expenses
     * @param {Array} recurringTransactions - Active recurring transactions
     * @param {Date} month - Month to estimate for
     * @returns {Object} Expense estimate
     */
    static estimateMonthlyExpenses(recurringTransactions, month = new Date()) {
        const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
        const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);

        let totalEstimate = 0;
        const transactions = [];

        for (const recurring of recurringTransactions) {
            if (recurring.status !== 'active') continue;

            const frequencyDays = this.mapFrequencyToDays(recurring.frequency);
            let currentDate = parseISO(recurring.nextDueDate || new Date());

            while (isBefore(currentDate, monthEnd) || 
                   isBefore(currentDate, endOfDay(monthEnd))) {
                if (!isBefore(currentDate, monthStart)) {
                    transactions.push({
                        recurringTransactionId: recurring.id,
                        transactionName: recurring.transactionName,
                        amount: recurring.amount,
                        date: currentDate,
                    });
                    totalEstimate += parseFloat(recurring.amount);
                }
                currentDate = addDays(currentDate, frequencyDays);
            }
        }

        return {
            month: format(monthStart, 'yyyy-MM'),
            estimatedTotal: parseFloat(totalEstimate.toFixed(2)),
            transactionCount: transactions.length,
            transactions: transactions.sort((a, b) => 
                new Date(a.date) - new Date(b.date)
            ),
        };
    }

    /**
     * Map frequency string to days
     * @private
     */
    static mapFrequencyToDays(frequency) {
        const map = {
            daily: 1,
            weekly: 7,
            biweekly: 14,
            monthly: 30,
            quarterly: 90,
            semiannual: 180,
            annual: 365,
        };
        return map[frequency] || 30;
    }

    /**
     * Get payment recommendations
     * @param {Array} bills - Bills to analyze
     * @param {number} availableBalance - Current balance for recommendations
     * @returns {Object} Payment recommendations
     */
    static getPaymentRecommendations(bills, availableBalance = null) {
        const overdue = this.getOverdueBills(bills);
        const dueSoon = this.getBillsDueSoon(bills);

        const recommendations = [];

        // Recommend paying overdue bills first
        if (overdue.length > 0) {
            const overdueDue = overdue.reduce((sum, b) => sum + parseFloat(b.amount), 0);
            recommendations.push({
                priority: 1,
                action: 'Pay overdue bills',
                bills: overdue.slice(0, 3), // Top 3 overdue
                estimatedAmount: parseFloat(overdueDue.toFixed(2)),
                urgency: 'CRITICAL',
            });
        }

        // Recommend paying bills due soon
       if (dueSoon.length > 0) {
            const dueSoonAmount = dueSoon.slice(0, 3)
                .reduce((sum, b) => sum + parseFloat(b.amount), 0);
            recommendations.push({
                priority: 2,
                action: 'Pay bills due in next 7 days',
                bills: dueSoon.slice(0, 3),
                estimatedAmount: parseFloat(dueSoonAmount.toFixed(2)),
                urgency: 'HIGH',
            });
        }

        // Filter recommendations by available balance if provided
        if (availableBalance !== null) {
            let remaining = availableBalance;
            const affordable = [];

            for (const rec of recommendations) {
                if (rec.estimatedAmount <= remaining) {
                    affordable.push(rec);
                    remaining -= rec.estimatedAmount;
                } else {
                    // Still include but mark as needs review
                    rec.flag = 'INSUFFICIENT_FUNDS';
                    affordable.push(rec);
                }
            }

            return affordable;
        }

        return recommendations;
    }

    /**
     * Export bills to CSV format
     * @param {Array} bills - Bills to export
     * @returns {string} CSV formatted bills
     */
    static exportToCSV(bills) {
        const headers = ['Bill Date', 'Due Date', 'Status', 'Amount', 'Payment Date'];
        const rows = bills.map(b => [
            format(parseISO(b.billDate), 'yyyy-MM-dd'),
            format(parseISO(b.dueDate), 'yyyy-MM-dd'),
            b.status,
            b.actualAmount || b.amount,
            b.paymentDate ? format(parseISO(b.paymentDate), 'yyyy-MM-dd') : '',
        ]);

        return [headers, ...rows]
            .map(row => row.map(cell => `"${cell}"`).join(','))
            .join('\n');
    }
}

module.exports = BillTrackingEngine;
