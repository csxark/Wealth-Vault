// Express API for Milestone Achievement Engine
const express = require('express');
const router = express.Router();
const MilestoneAchievementEngine = require('../services/milestoneAchievementEngineService');
const {
    addMilestoneGoal,
    getUserGoals,
    addMilestone,
    getUserMilestones,
    saveMilestoneProgress
} = require('../models/milestoneMockDb');
const { MilestoneGoal, Milestone } = require('../models/milestoneUserData');

// Create milestone goal
router.post('/milestone-goal', (req, res) => {
    const { id, userId, name, targetAmount, deadline } = req.body;
    const goal = new MilestoneGoal(id, userId, name, targetAmount, deadline);
    addMilestoneGoal(goal);
    res.status(201).json(goal);
});

// Get user goals
router.get('/milestone-goals/:userId', (req, res) => {
    const userId = req.params.userId;
    const goals = getUserGoals(userId);
    res.status(200).json(goals);
});

// Setup milestones for goals
router.post('/milestones/setup/:userId', async (req, res) => {
    const userId = req.params.userId;
    const engine = new MilestoneAchievementEngine(userId);
    try {
        const milestones = await engine.setupMilestones();
        milestones.forEach(m => addMilestone(new Milestone(m.id, userId, m.goalId, m.name, m.targetAmount, m.achievedAmount, m.achieved, m.deadline)));
        res.status(200).json(milestones);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get user milestones
router.get('/milestones/:userId', (req, res) => {
    const userId = req.params.userId;
    const milestones = getUserMilestones(userId);
    res.status(200).json(milestones);
});

// Update milestone progress
router.put('/milestone-progress/:userId/:milestoneId', (req, res) => {
    const userId = req.params.userId;
    const milestoneId = req.params.milestoneId;
    const { achievedAmount, achieved } = req.body;
    let milestones = getUserMilestones(userId);
    let milestone = milestones.find(m => m.id === milestoneId);
    if (!milestone) {
        return res.status(404).json({ error: 'Milestone not found' });
    }
    milestone.achievedAmount = achievedAmount;
    milestone.achieved = achieved;
    saveMilestoneProgress(userId, milestone);
    res.status(200).json(milestone);
});

// Track progress and feedback
router.get('/milestone-feedback/:userId', async (req, res) => {
    const userId = req.params.userId;
    const engine = new MilestoneAchievementEngine(userId);
    try {
        const feedback = await engine.trackProgress();
        res.status(200).json(feedback);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
