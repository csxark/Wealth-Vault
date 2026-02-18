/**
 * Retirement Planning Service
 * Handles calculations for retirement savings planning
 */

import db from '../config/db.js';
import { retirementPlanning } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Calculate the Future Value of current savings considering compound interest
 * Formula: FV = PV * (1 + r)^n
 * @param {number} presentValue - Current savings amount
 * @param {number} annualRate - Annual return rate (decimal, e.g., 0.07 for 7%)
 * @param {number} years - Number of years
 * @returns {number} Future value
 */
const calculateFutureValueOfCurrentSavings = (presentValue, annualRate, years) => {
    return presentValue * Math.pow(1 + annualRate, years);
};

/**
 * Calculate the Future Value of regular monthly contributions using Future Value of Annuity formula
 * Formula: FV = PMT * [((1 + r)^n - 1) / r]
 * where r is monthly rate
 * @param {number} monthlyPayment - Monthly contribution amount
 * @param {number} annualRate - Annual return rate (decimal)
 * @param {number} years - Number of years
 * @returns {number} Future value of monthly contributions
 */
const calculateFutureValueOfContributions = (monthlyPayment, annualRate, years) => {
    const monthlyRate = annualRate / 12;
    const monthsCount = years * 12;
    
    if (monthlyRate === 0) {
        return monthlyPayment * monthsCount;
    }
    
    return monthlyPayment * (Math.pow(1 + monthlyRate, monthsCount) - 1) / monthlyRate;
};

/**
 * Calculate required monthly payment to reach retirement goal
 * Using Present Value of Annuity formula rearranged
 * @param {number} futureValue - Desired amount at retirement
 * @param {number} currentSavings - Current savings
 * @param {number} annualRate - Annual return rate
 * @param {number} years - Years until retirement
 * @returns {number} Required monthly contribution
 */
const calculateRequiredMonthlyContribution = (futureValue, currentSavings, annualRate, years) => {
    const monthlyRate = annualRate / 12;
    const monthsCount = years * 12;
    
    // FV of current savings
    const fvOfCurrentSavings = calculateFutureValueOfCurrentSavings(currentSavings, annualRate, years);
    
    // Amount still needed from monthly contributions
    const amountNeededFromContributions = futureValue - fvOfCurrentSavings;
    
    if (monthlyRate === 0) {
        return amountNeededFromContributions / monthsCount;
    }
    
    if (amountNeededFromContributions <= 0) {
        return 0; // Already have enough savings
    }
    
    // PMT = FV / [((1 + r)^n - 1) / r]
    return amountNeededFromContributions / (Math.pow(1 + monthlyRate, monthsCount) - 1) * monthlyRate;
};

/**
 * Calculate the projected retirement amount based on current savings and monthly contributions
 * @param {number} currentSavings - Current savings
 * @param {number} monthlyContribution - Monthly contribution
 * @param {number} annualRate - Annual return rate
 * @param {number} years - Years until retirement
 * @returns {number} Projected retirement amount
 */
const calculateProjectedRetirementAmount = (currentSavings, monthlyContribution, annualRate, years) => {
    const fvOfCurrentSavings = calculateFutureValueOfCurrentSavings(currentSavings, annualRate, years);
    const fvOfContributions = calculateFutureValueOfContributions(monthlyContribution, annualRate, years);
    return fvOfCurrentSavings + fvOfContributions;
};

/**
 * Determine retirement status based on progress
 * @param {number} projectedAmount - Projected retirement amount
 * @param {number} desiredAmount - Desired retirement savings
 * @returns {string} Status: 'on_track', 'off_track', 'ahead'
 */
const determineRetirementStatus = (projectedAmount, desiredAmount) => {
    const percentage = (projectedAmount / desiredAmount) * 100;
    
    if (percentage >= 100) {
        return 'ahead';
    } else if (percentage >= 90) {
        return 'on_track';
    } else {
        return 'off_track';
    }
};

/**
 * Generate scenario analysis with different investment return rates
 * @param {number} currentSavings - Current savings
 * @param {number} monthlyContribution - Monthly contribution
 * @param {number} years - Years until retirement
 * @returns {Array} Array of scenarios (conservative, moderate, aggressive)
 */
const generateScenarioAnalysis = (currentSavings, monthlyContribution, years) => {
    const scenarios = [
        { name: 'Conservative', rate: 0.04, description: 'Low risk (bonds, stable funds)' },
        { name: 'Moderate', rate: 0.07, description: 'Balanced approach (stocks/bonds mix)' },
        { name: 'Aggressive', rate: 0.10, description: 'Higher risk (stocks focused)' }
    ];
    
    return scenarios.map(scenario => ({
        name: scenario.name,
        description: scenario.description,
        expectedReturn: scenario.rate,
        projectedAmount: calculateProjectedRetirementAmount(currentSavings, monthlyContribution, scenario.rate, years)
    }));
};

/**
 * Generate age-based milestones
 * @param {number} currentAge - Current age
 * @param {number} retirementAge - Retirement age
 * @param {number} currentSavings - Current savings
 * @param {number} monthlyContribution - Monthly contribution
 * @param {number} annualRate - Annual return rate
 * @returns {Array} Array of milestones
 */
const generateMilestones = (currentAge, retirementAge, currentSavings, monthlyContribution, annualRate) => {
    const milestones = [];
    const milestoneAges = [currentAge + 5, currentAge + 10, currentAge + 15, currentAge + 20];
    
    milestoneAges.forEach(age => {
        if (age < retirementAge) {
            const yearsFromNow = age - currentAge;
            const projectedAmount = calculateProjectedRetirementAmount(currentSavings, monthlyContribution, annualRate, yearsFromNow);
            
            milestones.push({
                age,
                year: new Date().getFullYear() + yearsFromNow,
                yearsFromNow,
                projectedAmount: Math.round(projectedAmount * 100) / 100,
                interimGoal: `Save to ${projectedAmount.toFixed(2)}`
            });
        }
    });
    
    return milestones;
};

/**
 * Create or update retirement planning calculation
 * @param {string} userId - User ID
 * @param {Object} inputData - User input data
 * @returns {Object} Retirement planning data
 */
export const createOrUpdateRetirementPlan = async (userId, inputData) => {
    const {
        currentAge,
        retirementAge,
        currentSavings,
        desiredRetirementSavings,
        expectedAnnualReturn,
        monthlyContribution,
        inflationRate,
        currency,
        notes
    } = inputData;
    
    // Validation
    if (retirementAge <= currentAge) {
        throw new Error('Retirement age must be greater than current age');
    }
    
    if (desiredRetirementSavings <= 0) {
        throw new Error('Desired retirement savings must be positive');
    }
    
    const yearsToRetirement = retirementAge - currentAge;
    const annualRate = expectedAnnualReturn || 0.07;
    const inflation = inflationRate || 0.03;
    
    // Adjust desired savings for inflation
    const adjustedDesiredSavings = desiredRetirementSavings * Math.pow(1 + inflation, yearsToRetirement);
    
    // Calculate total amount needed from now until retirement
    const fvOfCurrentSavings = calculateFutureValueOfCurrentSavings(currentSavings, annualRate, yearsToRetirement);
    const totalAmountNeeded = Math.max(0, adjustedDesiredSavings - fvOfCurrentSavings);
    
    // Calculate required monthly contribution
    const calculatedMonthlyContribution = calculateRequiredMonthlyContribution(
        adjustedDesiredSavings,
        currentSavings,
        annualRate,
        yearsToRetirement
    );
    
    // Calculate projected retirement amount based on actual/planned contribution
    const userContribution = monthlyContribution || 0;
    const projectedRetirementAmount = calculateProjectedRetirementAmount(
        currentSavings,
        userContribution,
        annualRate,
        yearsToRetirement
    );
    
    // Determine status and shortfall
    const retirementGoalMet = projectedRetirementAmount >= adjustedDesiredSavings;
    const shortfallAmount = Math.max(0, adjustedDesiredSavings - projectedRetirementAmount);
    const status = determineRetirementStatus(projectedRetirementAmount, adjustedDesiredSavings);
    
    // Generate scenario analysis
    const scenarioAnalysis = generateScenarioAnalysis(currentSavings, userContribution, yearsToRetirement);
    
    // Generate milestones
    const milestones = generateMilestones(currentAge, retirementAge, currentSavings, userContribution, annualRate);
    
    const metadata = {
        assumptions: {
            annualReturnRate: annualRate,
            inflationRate: inflation,
            calculationDate: new Date().toISOString()
        },
        scenarioAnalysis,
        milestones
    };
    
    // Check if user already has a retirement plan
    const existingPlan = await db.query.retirementPlanning.findFirst({
        where: eq(retirementPlanning.userId, userId)
    });
    
    let result;
    
    if (existingPlan) {
        // Update existing plan
        const updated = await db.update(retirementPlanning)
            .set({
                currentAge,
                retirementAge,
                currentSavings,
                desiredRetirementSavings: adjustedDesiredSavings,
                expectedAnnualReturn: annualRate,
                yearsToRetirement,
                monthlyContribution: userContribution,
                totalAmountNeeded,
                inflationRate: inflation,
                currency,
                calculatedMonthlyContribution,
                projectedRetirementAmount,
                retirementGoalMet,
                shortfallAmount,
                status,
                metadata,
                notes,
                lastCalculatedAt: new Date(),
                updatedAt: new Date()
            })
            .where(eq(retirementPlanning.userId, userId))
            .returning();
        
        result = updated[0];
    } else {
        // Create new plan
        const inserted = await db.insert(retirementPlanning)
            .values({
                userId,
                currentAge,
                retirementAge,
                currentSavings,
                desiredRetirementSavings: adjustedDesiredSavings,
                expectedAnnualReturn: annualRate,
                yearsToRetirement,
                monthlyContribution: userContribution,
                totalAmountNeeded,
                inflationRate: inflation,
                currency,
                calculatedMonthlyContribution,
                projectedRetirementAmount,
                retirementGoalMet,
                shortfallAmount,
                status,
                metadata,
                notes,
                lastCalculatedAt: new Date()
            })
            .returning();
        
        result = inserted[0];
    }
    
    return result;
};

/**
 * Get user's retirement planning data
 * @param {string} userId - User ID
 * @returns {Object} Retirement planning data
 */
export const getRetirementPlan = async (userId) => {
    const plan = await db.query.retirementPlanning.findFirst({
        where: eq(retirementPlanning.userId, userId)
    });
    
    return plan;
};

/**
 * Delete user's retirement planning data
 * @param {string} userId - User ID
 * @returns {boolean} Success
 */
export const deleteRetirementPlan = async (userId) => {
    const result = await db.delete(retirementPlanning)
        .where(eq(retirementPlanning.userId, userId));
    
    return result;
};

/**
 * Test if monthly contributions are sufficient
 * @param {number} monthlyContribution - Monthly contribution
 * @param {number} requiredContribution - Required monthly contribution
 * @returns {Object} Comparison data
 */
export const compareContributions = (monthlyContribution, requiredContribution) => {
    const difference = monthlyContribution - requiredContribution;
    const percentageOfRequired = (monthlyContribution / requiredContribution) * 100;
    
    return {
        userContribution: monthlyContribution,
        requiredContribution,
        difference,
        percentageOfRequired,
        isSufficient: monthlyContribution >= requiredContribution,
        message: monthlyContribution >= requiredContribution
            ? `Contributing $${monthlyContribution.toFixed(2)} which is ${percentageOfRequired.toFixed(1)}% of required amount`
            : `Shortfall of $${Math.abs(difference).toFixed(2)} per month. Need to contribute $${requiredContribution.toFixed(2)}`
    };
};

export default {
    createOrUpdateRetirementPlan,
    getRetirementPlan,
    deleteRetirementPlan,
    compareContributions,
    calculateProjectedRetirementAmount,
    calculateRequiredMonthlyContribution,
    generateScenarioAnalysis,
    generateMilestones
};
