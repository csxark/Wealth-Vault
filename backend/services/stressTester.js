import db from '../config/db.js';
import { stressScenarios, runwayCalculations, cashFlowProjections, expenses, goals, debts } from '../db/schema.js';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

/**
 * Stress Tester - Simulates "Black Swan" crisis scenarios
 * Tests financial resilience under extreme conditions
 */
class StressTester {
    constructor() {
        this.scenarioTemplates = {
            job_loss: {
                name: 'Job Loss',
                description: 'Complete loss of primary income',
                defaultParameters: {
                    incomeReduction: 100, // 100% income loss
                    duration: 6, // 6 months
                    severanceMonths: 0,
                    unemploymentBenefit: 0
                }
            },
            market_crash: {
                name: 'Market Crash',
                description: '2008-style market collapse',
                defaultParameters: {
                    marketDrop: 40, // 40% portfolio value drop
                    recoveryMonths: 24,
                    incomeReduction: 0,
                    expenseIncrease: 0
                }
            },
            medical_emergency: {
                name: 'Medical Emergency',
                description: 'Unexpected medical expenses',
                defaultParameters: {
                    emergencyCost: 50000,
                    incomeReduction: 30, // Reduced work capacity
                    duration: 3,
                    insuranceCoverage: 80 // 80% covered
                }
            },
            recession: {
                name: 'Economic Recession',
                description: 'Prolonged economic downturn',
                defaultParameters: {
                    incomeReduction: 25,
                    expenseIncrease: 15, // Inflation
                    marketDrop: 20,
                    duration: 18
                }
            },
            catastrophic: {
                name: 'Catastrophic Event',
                description: 'Multiple simultaneous crises',
                defaultParameters: {
                    incomeReduction: 100,
                    marketDrop: 50,
                    emergencyCost: 100000,
                    duration: 12
                }
            }
        };
    }

    /**
     * Create a new stress test scenario
     */
    async createScenario(userId, scenarioType, customParameters = {}) {
        const template = this.scenarioTemplates[scenarioType];

        if (!template) {
            throw new Error(`Invalid scenario type: ${scenarioType}`);
        }

        const parameters = {
            ...template.defaultParameters,
            ...customParameters
        };

        const severity = this.calculateSeverity(parameters);

        const [scenario] = await db.insert(stressScenarios).values({
            userId,
            name: template.name,
            scenarioType,
            severity,
            parameters,
            status: 'pending'
        }).returning();

        return scenario;
    }

    /**
     * Run stress test simulation
     */
    async runStressTest(scenarioId) {
        try {
            const [scenario] = await db.select()
                .from(stressScenarios)
                .where(eq(stressScenarios.id, scenarioId));

            if (!scenario) {
                throw new Error('Scenario not found');
            }

            // Update status to running
            await db.update(stressScenarios)
                .set({ status: 'running' })
                .where(eq(stressScenarios.id, scenarioId));

            // Get user's current financial state
            const financialState = await this.getUserFinancialState(scenario.userId);

            // Apply stress scenario
            const stressedState = this.applyStressScenario(financialState, scenario);

            // Calculate runway
            const runwayResult = await this.calculateRunway(
                scenario.userId,
                scenarioId,
                stressedState
            );

            // Generate AI recommendations
            const recommendations = this.generateRecommendations(stressedState, runwayResult);

            // Update runway calculation with recommendations
            await db.update(runwayCalculations)
                .set({ recommendations })
                .where(eq(runwayCalculations.id, runwayResult.id));

            // Update scenario status
            await db.update(stressScenarios)
                .set({
                    status: 'completed',
                    completedAt: new Date()
                })
                .where(eq(stressScenarios.id, scenarioId));

            return {
                scenario,
                runway: { ...runwayResult, recommendations },
                severity: this.assessSeverity(runwayResult)
            };
        } catch (error) {
            console.error('Stress test failed:', error);

            await db.update(stressScenarios)
                .set({ status: 'failed' })
                .where(eq(stressScenarios.id, scenarioId));

            throw new Error(`Stress test failed: ${error.message}`);
        }
    }

    /**
     * Get user's current financial state
     */
    async getUserFinancialState(userId) {
        const [userExpenses, userGoals, userDebts] = await Promise.all([
            db.select().from(expenses).where(eq(expenses.userId, userId)),
            db.select().from(goals).where(eq(goals.userId, userId)),
            db.select().from(debts).where(eq(debts.userId, userId))
        ]);

        // Calculate monthly averages
        const last3Months = new Date();
        last3Months.setMonth(last3Months.getMonth() - 3);

        const recentExpenses = userExpenses.filter(e =>
            new Date(e.date) >= last3Months && e.status === 'completed'
        );

        const monthlyExpenses = recentExpenses.reduce((sum, e) =>
            sum + parseFloat(e.amount), 0
        ) / 3;

        const totalDebts = userDebts
            .filter(d => d.isActive)
            .reduce((sum, d) => sum + parseFloat(d.currentBalance), 0);

        const monthlyDebtPayments = userDebts
            .filter(d => d.isActive)
            .reduce((sum, d) => sum + parseFloat(d.minimumPayment || 0), 0);

        return {
            currentBalance: 50000, // Would fetch from actual balance
            monthlyIncome: 5000, // Would fetch from user profile
            monthlyExpenses,
            monthlyDebtPayments,
            totalDebts,
            investmentValue: 100000, // Would fetch from investments
            emergencyFund: 10000 // Would fetch from goals
        };
    }

    /**
     * Apply stress scenario to financial state
     */
    applyStressScenario(state, scenario) {
        const params = scenario.parameters;
        const stressedState = { ...state };

        switch (scenario.scenarioType) {
            case 'job_loss':
                stressedState.monthlyIncome *= (1 - params.incomeReduction / 100);
                stressedState.monthlyIncome += params.unemploymentBenefit || 0;
                stressedState.currentBalance += (params.severanceMonths || 0) * state.monthlyIncome;
                break;

            case 'market_crash':
                stressedState.investmentValue *= (1 - params.marketDrop / 100);
                stressedState.monthlyIncome *= (1 - params.incomeReduction / 100);
                stressedState.monthlyExpenses *= (1 + (params.expenseIncrease || 0) / 100);
                break;

            case 'medical_emergency':
                const outOfPocket = params.emergencyCost * (1 - params.insuranceCoverage / 100);
                stressedState.currentBalance -= outOfPocket;
                stressedState.monthlyIncome *= (1 - params.incomeReduction / 100);
                break;

            case 'recession':
                stressedState.monthlyIncome *= (1 - params.incomeReduction / 100);
                stressedState.monthlyExpenses *= (1 + params.expenseIncrease / 100);
                stressedState.investmentValue *= (1 - params.marketDrop / 100);
                break;

            case 'catastrophic':
                stressedState.monthlyIncome *= (1 - params.incomeReduction / 100);
                stressedState.investmentValue *= (1 - params.marketDrop / 100);
                stressedState.currentBalance -= params.emergencyCost;
                break;
        }

        return stressedState;
    }

    /**
     * Calculate cash flow runway
     */
    async calculateRunway(userId, scenarioId, state) {
        const monthlyBurnRate = state.monthlyExpenses + state.monthlyDebtPayments - state.monthlyIncome;

        let currentBalance = state.currentBalance;
        const dailyProjections = [];
        let runwayDays = 0;
        let zeroBalanceDate = null;
        let criticalThresholdDate = null;
        const criticalThreshold = state.currentBalance * 0.2; // 20% threshold

        // Project daily for up to 2 years
        const maxDays = 730;
        const dailyBurnRate = monthlyBurnRate / 30;

        for (let day = 0; day < maxDays; day++) {
            const date = new Date();
            date.setDate(date.getDate() + day);

            currentBalance -= dailyBurnRate;

            dailyProjections.push({
                date: date.toISOString().split('T')[0],
                balance: Math.max(0, currentBalance),
                income: state.monthlyIncome / 30,
                expenses: (state.monthlyExpenses + state.monthlyDebtPayments) / 30
            });

            if (currentBalance <= criticalThreshold && !criticalThresholdDate) {
                criticalThresholdDate = date;
            }

            if (currentBalance <= 0 && !zeroBalanceDate) {
                zeroBalanceDate = date;
                runwayDays = day;
                break;
            }
        }

        // If never hits zero, runway is max days
        if (!zeroBalanceDate) {
            runwayDays = maxDays;
            zeroBalanceDate = new Date();
            zeroBalanceDate.setDate(zeroBalanceDate.getDate() + maxDays);
        }

        const [runway] = await db.insert(runwayCalculations).values({
            scenarioId,
            userId,
            currentBalance: state.currentBalance,
            monthlyBurnRate,
            runwayDays,
            zeroBalanceDate,
            criticalThresholdDate,
            dailyProjections
        }).returning();

        return runway;
    }

    /**
     * Generate AI-driven survival recommendations
     */
    generateRecommendations(state, runway) {
        const recommendations = [];

        // Critical runway warning
        if (runway.runwayDays < 90) {
            recommendations.push({
                priority: 'critical',
                category: 'immediate_action',
                title: 'Critical Cash Flow Alert',
                description: `You have only ${runway.runwayDays} days of runway. Immediate action required.`,
                actions: [
                    'Cut all non-essential expenses immediately',
                    'Negotiate payment plans with creditors',
                    'Explore emergency income sources (gig work, freelancing)',
                    'Consider liquidating non-essential assets'
                ]
            });
        }

        // Expense reduction opportunities
        if (state.monthlyExpenses > state.monthlyIncome * 0.5) {
            const targetReduction = state.monthlyExpenses - (state.monthlyIncome * 0.4);
            recommendations.push({
                priority: 'high',
                category: 'expense_reduction',
                title: 'Reduce Monthly Expenses',
                description: `Target: Reduce expenses by $${targetReduction.toFixed(2)}/month`,
                actions: [
                    'Review and cancel unused subscriptions',
                    'Negotiate lower rates on utilities and insurance',
                    'Switch to generic brands and bulk buying',
                    'Reduce dining out and entertainment'
                ]
            });
        }

        // Emergency fund recommendation
        if (state.emergencyFund < state.monthlyExpenses * 3) {
            recommendations.push({
                priority: 'medium',
                category: 'emergency_fund',
                title: 'Build Emergency Fund',
                description: 'Your emergency fund is below recommended 3-6 months of expenses',
                actions: [
                    'Set up automatic transfers to emergency savings',
                    'Allocate windfalls (tax refunds, bonuses) to emergency fund',
                    'Consider high-yield savings account for emergency fund'
                ]
            });
        }

        // Debt management
        if (state.monthlyDebtPayments > state.monthlyIncome * 0.3) {
            recommendations.push({
                priority: 'high',
                category: 'debt_management',
                title: 'Debt Burden Too High',
                description: 'Debt payments exceed 30% of income',
                actions: [
                    'Contact creditors to negotiate lower payments',
                    'Explore debt consolidation options',
                    'Consider balance transfer for high-interest credit cards',
                    'Seek credit counseling if needed'
                ]
            });
        }

        // Income diversification
        recommendations.push({
            priority: 'medium',
            category: 'income_boost',
            title: 'Diversify Income Sources',
            description: 'Reduce dependency on single income source',
            actions: [
                'Explore part-time or freelance opportunities',
                'Monetize skills or hobbies',
                'Consider passive income streams (rental, dividends)',
                'Upskill for better-paying opportunities'
            ]
        });

        return recommendations;
    }

    /**
     * Calculate scenario severity
     */
    calculateSeverity(parameters) {
        let score = 0;

        if (parameters.incomeReduction >= 75) score += 3;
        else if (parameters.incomeReduction >= 50) score += 2;
        else if (parameters.incomeReduction >= 25) score += 1;

        if (parameters.marketDrop >= 40) score += 3;
        else if (parameters.marketDrop >= 25) score += 2;
        else if (parameters.marketDrop >= 10) score += 1;

        if (parameters.emergencyCost >= 75000) score += 3;
        else if (parameters.emergencyCost >= 25000) score += 2;
        else if (parameters.emergencyCost >= 10000) score += 1;

        if (score >= 7) return 'catastrophic';
        if (score >= 5) return 'severe';
        if (score >= 3) return 'moderate';
        return 'mild';
    }

    /**
     * Assess severity of runway results
     */
    assessSeverity(runway) {
        if (runway.runwayDays < 30) return 'critical';
        if (runway.runwayDays < 90) return 'severe';
        if (runway.runwayDays < 180) return 'moderate';
        return 'stable';
    }

    /**
     * Get scenario templates
     */
    getScenarioTemplates() {
        return Object.entries(this.scenarioTemplates).map(([type, template]) => ({
            type,
            ...template
        }));
    }
}

export default new StressTester();
