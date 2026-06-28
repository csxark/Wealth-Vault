/**
 * Example usage for DebtReductionAdvisor
 * Demonstrates strategy recommendation, progress tracking, and alert generation
 */
const DebtReductionAdvisor = require('./debtReductionAdvisor');

// Example debts
const debts = [
    { id: 'd1', amount: 5000, interestRate: 0.18, minPayment: 100, dueDate: '2026-03-01', lender: 'BankA' },
    { id: 'd2', amount: 2000, interestRate: 0.12, minPayment: 50, dueDate: '2026-03-10', lender: 'BankB' },
    { id: 'd3', amount: 800, interestRate: 0.22, minPayment: 25, dueDate: '2026-02-28', lender: 'BankC' }
];

// Example payments made
const payments = {
    d1: 2500, // 50% paid
    d2: 2000, // 100% paid
    d3: 0     // missed payment
};

const userId = 'user123';

// Recommend repayment order (avalanche)
const avalancheOrder = DebtReductionAdvisor.recommendStrategy(debts, 'avalanche');
console.log('Avalanche order:', avalancheOrder);

// Recommend repayment order (snowball)
const snowballOrder = DebtReductionAdvisor.recommendStrategy(debts, 'snowball');
console.log('Snowball order:', snowballOrder);

// Track progress and generate alerts
const alerts = DebtReductionAdvisor.trackProgressAndAlert(debts, payments, userId);
console.log('Generated alerts:', alerts);
