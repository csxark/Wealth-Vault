// financialGoalVisualization.js
// Visualization helpers for Financial Goal Progress Tracker

const moment = require('moment');

function generateProgressChart(goal, timeline) {
    // Generate a simple progress chart data for a goal
    return {
        goalId: goal.goalId,
        name: goal.name,
        chart: timeline.map(point => ({
            month: point.month,
            percent: point.percent
        }))
    };
}

function generateMilestoneTimeline(goal, timeline) {
    // Generate milestone timeline for a goal
    const milestones = [25, 50, 75, 100];
    return milestones.map(percent => {
        const milestoneMonth = timeline.find(point => point.percent >= percent);
        return {
            percent,
            month: milestoneMonth ? milestoneMonth.month : null,
            date: milestoneMonth ? moment().add(milestoneMonth.month, 'months').format('YYYY-MM-DD') : null
        };
    });
}

function summarizeGoalProgress(goals, timelines) {
    // Summarize progress for all goals
    return goals.map((goal, idx) => {
        const timeline = timelines[idx];
        const lastPoint = timeline[timeline.length - 1];
        return {
            goalId: goal.goalId,
            name: goal.name,
            finalPercent: lastPoint.percent,
            completed: lastPoint.percent >= 100
        };
    });
}

function generateProbabilityHeatmap(goals, probabilities) {
    // Generate a heatmap data for achievement probabilities
    return goals.map((goal, idx) => ({
        goalId: goal.goalId,
        name: goal.name,
        probability: probabilities[idx]
    }));
}

module.exports = {
    generateProgressChart,
    generateMilestoneTimeline,
    summarizeGoalProgress,
    generateProbabilityHeatmap
};

// --- End of visualization helpers ---
// Use these helpers in FinancialGoalProgressTrackerService for progress charting, milestone timelines, and probability heatmaps.
