/**
 * Debt Amortization Service
 * Generates complex amortization schedules with support for PIK interest, 
 * irregular payments, conversions, and prepayments
 */

import { db } from '../config/db.js';
import { debts, debtPayments } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Generate standard amortization schedule
 */
export async function generateAmortizationSchedule(userId, debtId) {
    const debt = await fetchDebt(userId, debtId);
    
    if (!debt) {
        throw new Error('Debt not found');
    }

    const principal = parseFloat(debt.amount);
    const annualRate = parseFloat(debt.interestRate || 0) / 100;
    const maturityDate = new Date(debt.plannedPayoffDate);
    const now = new Date();
    
    // Calculate remaining months
    const monthsRemaining = Math.ceil((maturityDate - now) / (30.44 * 24 * 60 * 60 * 1000));
    
    if (monthsRemaining <= 0) {
        throw new Error('Debt has reached maturity');
    }

    const monthlyRate = annualRate / 12;
    const currentBalance = parseFloat(debt.currentBalance || principal);

    // Calculate monthly payment (P&I)
    let monthlyPayment;
    if (monthlyRate === 0) {
        monthlyPayment = currentBalance / monthsRemaining;
    } else {
        monthlyPayment = currentBalance * (monthlyRate * Math.pow(1 + monthlyRate, monthsRemaining)) 
                        / (Math.pow(1 + monthlyRate, monthsRemaining) - 1);
    }

    // Build schedule
    const schedule = [];
    let balance = currentBalance;
    let totalInterest = 0;
    let totalPrincipal = 0;

    for (let month = 1; month <= monthsRemaining; month++) {
        const interestPayment = balance * monthlyRate;
        const principalPayment = monthlyPayment - interestPayment;
        balance = balance - principalPayment;

        // Adjust last payment for rounding
        if (month === monthsRemaining && balance !== 0) {
            const adjustment = balance;
            balance = 0;
        }

        totalInterest += interestPayment;
        totalPrincipal += principalPayment;

        const paymentDate = new Date(now);
        paymentDate.setMonth(paymentDate.getMonth() + month);

        schedule.push({
            month,
            paymentDate,
            payment: monthlyPayment,
            principal: principalPayment,
            interest: interestPayment,
            remainingBalance: Math.max(0, balance)
        });
    }

    return {
        debtId,
        debtName: debt.name,
        currentBalance,
        monthlyPayment,
        monthsRemaining,
        totalPayments: monthlyPayment * monthsRemaining,
        totalInterest,
        totalPrincipal,
        schedule
    };
}

/**
 * Generate PIK (Payment-in-Kind) amortization schedule
 * Interest capitalizes to principal instead of being paid in cash
 */
export async function generatePIKSchedule(userId, debtId, periodsAhead = 12) {
    const debt = await fetchDebt(userId, debtId);
    
    if (!debt || !debt.metadata?.isPIK) {
        throw new Error('Debt is not a PIK debt');
    }

    const initialBalance = parseFloat(debt.currentBalance || debt.amount);
    const pikRate = parseFloat(debt.metadata.pikRate || debt.interestRate) / 100;
    const periodsPerYear = debt.metadata.pikFrequency === 'quarterly' ? 4 : 12;
    const periodicRate = pikRate / periodsPerYear;

    const schedule = [];
    let balance = initialBalance;
    let totalAccrued = 0;

    for (let period = 1; period <= periodsAhead; period++) {
        const accruedInterest = balance * periodicRate;
        balance = balance + accruedInterest;
        totalAccrued += accruedInterest;

        const periodDate = new Date();
        if (periodsPerYear === 4) {
            periodDate.setMonth(periodDate.getMonth() + (period * 3));
        } else {
            periodDate.setMonth(periodDate.getMonth() + period);
        }

        schedule.push({
            period,
            periodDate,
            beginningBalance: balance - accruedInterest,
            accruedInterest,
            endingBalance: balance,
            cumulativeAccrued: totalAccrued
        });
    }

    return {
        debtId,
        debtName: debt.name,
        initialBalance,
        pikRate: pikRate * 100,
        periodsPerYear,
        projectedBalance: balance,
        totalAccrued,
        schedule
    };
}

/**
 * Calculate irregular payment impact on schedule
 */
export async function applyIrregularPayment(userId, debtId, paymentAmount, paymentDate = new Date()) {
    const debt = await fetchDebt(userId, debtId);
    
    if (!debt) {
        throw new Error('Debt not found');
    }

    const currentBalance = parseFloat(debt.currentBalance || debt.amount);
    const annualRate = parseFloat(debt.interestRate || 0) / 100;
    const monthlyRate = annualRate / 12;

    // Calculate accrued interest since last payment
    const lastPaymentDate = debt.metadata?.lastPaymentDate ? new Date(debt.metadata.lastPaymentDate) : new Date(debt.createdAt);
    const daysSinceLastPayment = (paymentDate - lastPaymentDate) / (24 * 60 * 60 * 1000);
    const accruedInterest = currentBalance * (annualRate / 365) * daysSinceLastPayment;

    // Apply payment: interest first, then principal
    let interestPaid = Math.min(paymentAmount, accruedInterest);
    let principalPaid = Math.max(0, paymentAmount - accruedInterest);
    let newBalance = currentBalance - principalPaid;

    // Update debt
    await db.update(debts)
        .set({
            currentBalance: newBalance.toFixed(2),
            metadata: {
                ...(debt.metadata || {}),
                lastPaymentDate: paymentDate,
                lastPaymentAmount: paymentAmount,
                irregularPayments: [
                    ...((debt.metadata?.irregularPayments) || []),
                    {
                        date: paymentDate,
                        amount: paymentAmount,
                        interestPaid,
                        principalPaid,
                        balanceAfter: newBalance
                    }
                ]
            },
            updatedAt: new Date()
        })
        .where(eq(debts.id, debtId));

    // Regenerate schedule with new balance
    const updatedSchedule = await generateAmortizationSchedule(userId, debtId);

    return {
        paymentAmount,
        paymentDate,
        accruedInterest,
        interestPaid,
        principalPaid,
        oldBalance: currentBalance,
        newBalance,
        updatedSchedule
    };
}

/**
 * Calculate prepayment impact (with optional penalty)
 */
export async function calculatePrepayment(userId, debtId, prepaymentAmount) {
    const debt = await fetchDebt(userId, debtId);
    
    if (!debt) {
        throw new Error('Debt not found');
    }

    const currentBalance = parseFloat(debt.currentBalance || debt.amount);
    const annualRate = parseFloat(debt.interestRate || 0) / 100;

    // Check for prepayment penalty
    const prepaymentPenalty = debt.metadata?.prepaymentPenaltyRate || 0;
    const penaltyAmount = prepaymentAmount * (prepaymentPenalty / 100);
    const netPrepayment = prepaymentAmount - penaltyAmount;

    // Calculate interest savings
    const maturityDate = new Date(debt.plannedPayoffDate);
    const now = new Date();
    const monthsRemaining = Math.ceil((maturityDate - now) / (30.44 * 24 * 60 * 60 * 1000));
    
    // Original schedule
    const originalSchedule = await generateAmortizationSchedule(userId, debtId);
    const originalTotalInterest = originalSchedule.totalInterest;

    // Calculate new balance and interest after prepayment
    const newBalance = currentBalance - netPrepayment;
    
    // Estimate new total interest (simplified)
    const monthlyRate = annualRate / 12;
    let estimatedInterest = 0;
    let balance = newBalance;
    
    if (monthlyRate === 0) {
        estimatedInterest = 0;
    } else {
        const newMonthlyPayment = newBalance * (monthlyRate * Math.pow(1 + monthlyRate, monthsRemaining)) 
                                  / (Math.pow(1 + monthlyRate, monthsRemaining) - 1);
        
        for (let month = 1; month <= monthsRemaining; month++) {
            const interestPayment = balance * monthlyRate;
            const principalPayment = newMonthlyPayment - interestPayment;
            balance = balance - principalPayment;
            estimatedInterest += interestPayment;
        }
    }

    const interestSavings = originalTotalInterest - estimatedInterest;
    const netSavings = interestSavings - penaltyAmount;

    return {
        prepaymentAmount,
        penaltyAmount,
        netPrepayment,
        currentBalance,
        balanceAfterPrepayment: newBalance,
        originalTotalInterest,
        newTotalInterest: estimatedInterest,
        interestSavings,
        netSavings,
        recommendation: netSavings > 0 ? 'favorable' : 'unfavorable'
    };
}

/**
 * Adjust schedule after debt-to-equity conversion
 */
export async function adjustScheduleForConversion(userId, debtId, convertedAmount, conversionDate = new Date()) {
    const debt = await fetchDebt(userId, debtId);
    
    if (!debt) {
        throw new Error('Debt not found');
    }

    const currentBalance = parseFloat(debt.currentBalance || debt.amount);
    const newBalance = currentBalance - convertedAmount;

    if (newBalance < 0) {
        throw new Error('Converted amount exceeds current balance');
    }

    // Update debt balance
    await db.update(debts)
        .set({
            currentBalance: newBalance.toFixed(2),
            metadata: {
                ...(debt.metadata || {}),
                conversions: [
                    ...((debt.metadata?.conversions) || []),
                    {
                        date: conversionDate,
                        convertedAmount,
                        balanceAfter: newBalance
                    }
                ]
            },
            updatedAt: new Date()
        })
        .where(eq(debts.id, debtId));

    // If fully converted, mark as paid
    if (newBalance === 0) {
        await db.update(debts)
            .set({
                status: 'paid',
                paidOffDate: conversionDate,
                updatedAt: new Date()
            })
            .where(eq(debts.id, debtId));

        return {
            debtId,
            fullyConverted: true,
            convertedAmount,
            message: 'Debt fully converted to equity'
        };
    }

    // Generate new amortization schedule for remaining balance
    const updatedSchedule = await generateAmortizationSchedule(userId, debtId);

    return {
        debtId,
        fullyConverted: false,
        convertedAmount,
        oldBalance: currentBalance,
        newBalance,
        updatedSchedule
    };
}

/**
 * Project future cash flows (expected and stressed scenarios)
 */
export async function projectCashFlows(userId, debtId, horizonMonths = 24) {
    const debt = await fetchDebt(userId, debtId);
    
    if (!debt) {
        throw new Error('Debt not found');
    }

    // Get standard schedule
    const schedule = await generateAmortizationSchedule(userId, debtId);
    
    // Expected scenario (base case)
    const expectedCashFlows = schedule.schedule.slice(0, horizonMonths).map(period => ({
        month: period.month,
        date: period.paymentDate,
        amount: period.payment,
        principal: period.principal,
        interest: period.interest,
        scenario: 'expected'
    }));

    // Stressed scenario (50% default probability)
    const stressedCashFlows = schedule.schedule.slice(0, horizonMonths).map(period => {
        // Simulate 50% chance of default each month
        const survivalProb = Math.pow(0.95, period.month); // 5% default per month
        return {
            month: period.month,
            date: period.paymentDate,
            amount: period.payment * survivalProb,
            principal: period.principal * survivalProb,
            interest: period.interest * survivalProb,
            survivalProbability: survivalProb,
            scenario: 'stressed'
        };
    });

    // Calculate NPV (Net Present Value) using discount rate
    const discountRate = 0.10 / 12; // 10% annual discount rate
    
    const expectedNPV = expectedCashFlows.reduce((npv, cf, idx) => {
        return npv + (cf.amount / Math.pow(1 + discountRate, idx + 1));
    }, 0);

    const stressedNPV = stressedCashFlows.reduce((npv, cf, idx) => {
        return npv + (cf.amount / Math.pow(1 + discountRate, idx + 1));
    }, 0);

    return {
        debtId,
        debtName: debt.name,
        horizonMonths,
        expectedCashFlows,
        stressedCashFlows,
        summary: {
            expectedTotalCashFlow: expectedCashFlows.reduce((sum, cf) => sum + cf.amount, 0),
            stressedTotalCashFlow: stressedCashFlows.reduce((sum, cf) => sum + cf.amount, 0),
            expectedNPV,
            stressedNPV,
            cashFlowAtRisk: expectedNPV - stressedNPV
        }
    };
}

/**
 * Helper function to fetch debt
 */
async function fetchDebt(userId, debtId) {
    const result = await db.select()
        .from(debts)
        .where(and(
            eq(debts.userId, userId),
            eq(debts.id, debtId)
        ))
        .limit(1);
    
    return result.length > 0 ? result[0] : null;
}

export default {
    generateAmortizationSchedule,
    generatePIKSchedule,
    applyIrregularPayment,
    calculatePrepayment,
    adjustScheduleForConversion,
    projectCashFlows
};
