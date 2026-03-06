// Mock Database for Milestone Engine
const { MilestoneGoal, Milestone } = require('./milestoneUserData');

const milestoneGoals = [];
const milestones = [];

function addMilestoneGoal(goal) {
    milestoneGoals.push(goal);
    return goal;
}

function getUserGoals(userId) {
    return milestoneGoals.filter(g => g.userId === userId);
}

function addMilestone(milestone) {
    milestones.push(milestone);
    return milestone;
}

function getUserMilestones(userId) {
    return milestones.filter(m => m.userId === userId);
}

function saveMilestoneProgress(userId, milestone) {
    // Update or add milestone progress
    const idx = milestones.findIndex(m => m.id === milestone.id && m.userId === userId);
    if (idx >= 0) {
        milestones[idx] = milestone;
    } else {
        milestones.push(milestone);
    }
    return milestone;
}

module.exports = {
    addMilestoneGoal,
    getUserGoals,
    addMilestone,
    getUserMilestones,
    saveMilestoneProgress
};
