/**
 * DebtReductionAdvisor Service
 * Analyzes debts, recommends repayment strategies, tracks progress, and triggers alerts
 */
const AlertNotificationService = require('./alertNotificationService');

class DebtReductionAdvisor {
    /**
     * Recommend optimal repayment strategy
     * @param {Array} debts - List of user debts [{id, amount, interestRate, minPayment, dueDate}]
     * @param {String} strategy - 'avalanche' | 'snowball'
     * @returns {Array} Ordered debts for repayment
     */
    static recommendStrategy(debts, strategy = 'avalanche') {
        if (strategy === 'avalanche') {
            // Highest interest first
            return debts.slice().sort((a, b) => b.interestRate - a.interestRate);
        } else {
            // Smallest balance first
            return debts.slice().sort((a, b) => a.amount - b.amount);
        }
    }

    /**
     * Track progress and trigger alerts
     * @param {Array} debts - List of debts
     * @param {Object} payments - Payments made {debtId: amountPaid}
     * @param {String} userId - User ID
     * @returns {Array} Alerts
     */
    static trackProgressAndAlert(debts, payments, userId) {
        const alerts = [];
        for (const debt of debts) {
            const paid = payments[debt.id] || 0;
            const percentPaid = (paid / debt.amount) * 100;
            if (percentPaid >= 100) {
                alerts.push({
                    ...AlertNotificationService.generateAutoDetectionAlert({
                        transactionName: 'Debt Paid Off',
                        merchant: debt.lender || 'Lender',
                        amount: debt.amount,
                        frequency: 'one-time',
                        confidenceScore: 99
                    }, userId, null),
                    message: `Congratulations! Debt to ${debt.lender} fully paid.`
                });
            } else if (percentPaid >= 50 && percentPaid < 100) {
                alerts.push({
                    ...AlertNotificationService.generateAutoDetectionAlert({
                        transactionName: 'Debt Halfway Paid',
                        merchant: debt.lender || 'Lender',
                        amount: debt.amount,
                        frequency: 'one-time',
                        confidenceScore: 90
                    }, userId, null),
                    message: `Great job! Over 50% paid to ${debt.lender}.`
                });
            }
            // Alert for missed payment
            const today = new Date();
            if (new Date(debt.dueDate) < today && paid < debt.minPayment) {
                alerts.push({
                    ...AlertNotificationService.generatePaymentFailedAlert(debt, { merchant: debt.lender }, userId),
                    message: `Missed minimum payment for debt to ${debt.lender}.`
                });
            }
        }
        return alerts;
    }
}

module.exports = DebtReductionAdvisor;
