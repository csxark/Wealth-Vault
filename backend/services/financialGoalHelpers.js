// financialGoalHelpers.js
// Helper functions for Financial Goal Progress Tracker

const moment = require('moment');

function calculateMilestones(goal, saved) {
    // Calculate milestone alerts for a goal
    const milestones = [25, 50, 75, 100];
    return milestones.map(percent => {
        const target = goal.targetAmount * (percent / 100);
        if (saved >= target) {
            return `Milestone reached: ${percent}% of ${goal.name}`;
        } else {
            return `Upcoming milestone: ${percent}% of ${goal.name}`;
        }
    });
}

function simulateGoalProgress(goal, monthlySave, months) {
    // Simulate progress scenario for a goal
    let saved = 0;
    let timeline = [];
    for (let m = 1; m <= months; m++) {
        saved += monthlySave;
        timeline.push({ month: m, saved, percent: Math.min((saved / goal.targetAmount) * 100, 100) });
    }
    return timeline;
}

function recommendSavingsAdjustment(goal, saved, monthsLeft) {
    // Recommend adjustment to savings plan
    const needed = goal.targetAmount - saved;
    const monthly = monthsLeft > 0 ? needed / monthsLeft : 0;
    if (monthly > 0) {
        return `Increase monthly savings for ${goal.name} to $${monthly.toFixed(2)} to reach target.`;
    } else {
        return `Goal ${goal.name} completed. Consider reallocating surplus.`;
    }
}

function calculateAchievementProbability(goal, saved, monthlySave, monthsLeft) {
    // Calculate probability of achieving goal
    const projected = saved + monthlySave * monthsLeft;
    return Math.min(projected / goal.targetAmount, 1);
}

module.exports = {
    calculateMilestones,
    simulateGoalProgress,
    recommendSavingsAdjustment,
    calculateAchievementProbability
};

// --- End of helpers ---
// Use these helpers in FinancialGoalProgressTrackerService for advanced milestone alerts, progress simulation, and recommendations.
