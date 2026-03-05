// Unit Tests for Milestone Achievement Engine
const { MilestoneGoal, Milestone } = require('../models/milestoneUserData');
const { generateMilestones, getProgressFeedback } = require('../utils/milestoneUtils');
const MilestoneAchievementEngine = require('../services/milestoneAchievementEngineService');
const assert = require('assert');

describe('Milestone Utils', () => {
    it('should generate milestones', () => {
        const goals = [
            new MilestoneGoal(1, 1, 'Save for House', 1000000, '2026-12-31')
        ];
        const milestones = generateMilestones(goals);
        assert(milestones.length === 5);
    });

    it('should provide progress feedback', () => {
        const milestones = [
            new Milestone(1, 1, 1, 'Save for House Milestone 1', 200000, 200000, true, '2026-12-31'),
            new Milestone(2, 1, 1, 'Save for House Milestone 2', 400000, 100000, false, '2026-12-31')
        ];
        const feedback = getProgressFeedback([], milestones);
        assert(feedback.length === milestones.length);
        assert(feedback[0].celebrate === true);
    });
});

describe('MilestoneAchievementEngine', () => {
    it('should setup milestones and track progress', async () => {
        // Mock data loading
        const engine = new MilestoneAchievementEngine(1);
        engine.goals = [
            new MilestoneGoal(1, 1, 'Save for House', 1000000, '2026-12-31')
        ];
        engine.milestones = generateMilestones(engine.goals);
        const feedback = await engine.trackProgress();
        assert(feedback.length === engine.milestones.length);
    });
});
