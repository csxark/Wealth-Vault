// Financial Milestone Achievement Engine Service
// Breaks down goals, tracks progress, provides feedback and notifications

const { getUserGoals, getUserMilestones, saveMilestoneProgress } = require('../models/milestoneUserData');
const { generateMilestones, getProgressFeedback } = require('../utils/milestoneUtils');
const { sendMilestoneNotification } = require('./milestoneNotificationService');

class MilestoneAchievementEngine {
    constructor(userId) {
        this.userId = userId;
        this.goals = [];
        this.milestones = [];
    }

    async loadUserData() {
        this.goals = await getUserGoals(this.userId);
        this.milestones = await getUserMilestones(this.userId);
    }

    async setupMilestones() {
        await this.loadUserData();
        this.milestones = generateMilestones(this.goals);
        // Save milestones to DB
        this.milestones.forEach(m => saveMilestoneProgress(this.userId, m));
        return this.milestones;
    }

    async trackProgress() {
        await this.loadUserData();
        const feedback = getProgressFeedback(this.goals, this.milestones);
        feedback.forEach(fb => {
            if (fb.celebrate) {
                sendMilestoneNotification(this.userId, fb.message);
            }
        });
        return feedback;
    }
}

module.exports = MilestoneAchievementEngine;
