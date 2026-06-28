// backend/routes/retirementGoalAdmin.js
const express = require('express');
const router = express.Router();
const RetirementGoalRepository = require('../repositories/retirementGoalRepository');
const RetirementAccountRepository = require('../repositories/retirementAccountRepository');
const { exportProgress } = require('../utils/retirementExport');

// GET /api/retirement/admin/goals
router.get('/goals', async (req, res) => {
  try {
    const goals = await RetirementGoalRepository.getAllGoals();
    res.json(goals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/retirement/admin/accounts
router.get('/accounts', async (req, res) => {
  try {
    const accounts = await RetirementAccountRepository.getAllAccounts();
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/retirement/admin/export/:userId
router.get('/export/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    // Mock: get progress for export
    const progress = { totalBalance: 100000, projected: 500000, yearsToGoal: 25, percentToGoal: 80 };
    const format = req.query.format || 'json';
    const exportData = exportProgress(progress, format);
    res.send(exportData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
