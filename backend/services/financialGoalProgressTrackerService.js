// FinancialGoalProgressTrackerService.js
// Backend service for financial goal progress tracking and milestone alerts

const moment = require('moment');

class FinancialGoalProgressTrackerService {
    constructor(goals, savingsHistory, options = {}) {
        this.goals = goals; // [{ goalId, name, targetAmount, targetDate, priority }]
        this.savingsHistory = savingsHistory; // [{ month, amount }]
        this.options = Object.assign({ months: 12 }, options);
        this.progressReports = [];
        this.milestoneAlerts = [];
        this.adjustmentRecommendations = [];
        this.achievementProbabilities = [];
        this.summary = null;
        this._init();
    }

    _init() {
        this._aggregateGoalData();
        this._simulateProgressScenarios();
        this._generateMilestoneAlerts();
        this._recommendAdjustments();
        this._visualizeAchievementProbabilities();
        this._generateSummary();
    }

    _aggregateGoalData() {
        // Aggregate goal and savings data
        this.progressReports = this.goals.map(goal => {
            const saved = this._getSavedAmount(goal.goalId);
            const percent = Math.min((saved / goal.targetAmount) * 100, 100);
            return {
                goalId: goal.goalId,
                name: goal.name,
                saved,
                target: goal.targetAmount,
                percent,
                status: percent >= 100 ? 'completed' : 'in progress',
                nextMilestone: percent < 100 ? `Reach 50% by ${moment().add(3, 'months').format('MMMM YYYY')}` : null
            };
        });
    }

    _getSavedAmount(goalId) {
        // Simulate saved amount (stub for DB integration)
        return Math.floor(Math.random() * 0.8 * this.goals.find(g => g.goalId === goalId).targetAmount);
    }

    _simulateProgressScenarios() {
        // Simulate progress scenarios for each goal
        this.goals.forEach(goal => {
            let monthlySave = this._estimateMonthlySave(goal);
            let monthsToGoal = monthlySave > 0 ? Math.ceil((goal.targetAmount - this._getSavedAmount(goal.goalId)) / monthlySave) : null;
            this.progressReports.find(r => r.goalId === goal.goalId).monthsToGoal = monthsToGoal;
        });
    }

    _estimateMonthlySave(goal) {
        // Estimate monthly savings for a goal
        return Math.max(goal.targetAmount / this.options.months, 50);
    }

    _generateMilestoneAlerts() {
        // Generate milestone alerts for each goal
        this.milestoneAlerts = this.goals.map(goal => {
            const saved = this._getSavedAmount(goal.goalId);
            const milestones = [25, 50, 75, 100];
            return {
                goalId: goal.goalId,
                name: goal.name,
                alerts: milestones.map(percent => {
                    const target = goal.targetAmount * (percent / 100);
                    if (saved >= target) {
                        return `Milestone reached: ${percent}% of ${goal.name}`;
                    } else {
                        return `Upcoming milestone: ${percent}% of ${goal.name}`;
                    }
                })
            };
        });
    }

    _recommendAdjustments() {
        // Recommend adjustments to savings plans
        this.adjustmentRecommendations = this.goals.map(goal => {
            const saved = this._getSavedAmount(goal.goalId);
            if (saved < goal.targetAmount * 0.5) {
                return `Increase monthly savings for ${goal.name} to stay on track.`;
            } else if (saved >= goal.targetAmount) {
                return `Goal ${goal.name} completed. Consider reallocating surplus to other goals.`;
            } else {
                return `Maintain current savings rate for ${goal.name}.`;
            }
        });
    }

    _visualizeAchievementProbabilities() {
        // Visualize goal achievement probabilities
        this.achievementProbabilities = this.goals.map(goal => {
            const saved = this._getSavedAmount(goal.goalId);
            const monthsLeft = moment(goal.targetDate).diff(moment(), 'months');
            const monthlySave = this._estimateMonthlySave(goal);
            const projected = saved + monthlySave * monthsLeft;
            const probability = Math.min(projected / goal.targetAmount, 1);
            return {
                goalId: goal.goalId,
                name: goal.name,
                probability: Math.round(probability * 100)
            };
        });
    }

    _generateSummary() {
        // Generate overall summary
        this.summary = {
            totalGoals: this.goals.length,
            completedGoals: this.progressReports.filter(r => r.status === 'completed').length,
            inProgressGoals: this.progressReports.filter(r => r.status === 'in progress').length,
            adjustmentRecommendations: this.adjustmentRecommendations
        };
    }

    track() {
        // Main entry point
        return {
            summary: this.summary,
            progressReports: this.progressReports,
            milestoneAlerts: this.milestoneAlerts,
            adjustmentRecommendations: this.adjustmentRecommendations,
            achievementProbabilities: this.achievementProbabilities
        };
    }

    static examplePayload() {
        return {
            goals: [
                { goalId: 'vacation', name: 'Vacation', targetAmount: 1200, targetDate: '2026-10-01', priority: 'medium' },
                { goalId: 'home', name: 'Home Down Payment', targetAmount: 15000, targetDate: '2027-06-01', priority: 'high' }
            ],
            savingsHistory: [
                { month: '2025-12', amount: 400 },
                { month: '2026-01', amount: 450 },
                { month: '2026-02', amount: 500 },
                { month: '2026-03', amount: 550 }
            ],
            options: {
                months: 12
            }
        };
    }
}

module.exports = FinancialGoalProgressTrackerService;

// --- End of Service ---
// This file contains robust, modular logic for financial goal progress tracking and milestone alerts.
// For full integration, add API endpoint in backend/routes/goals.js and connect to DB for real user data.
