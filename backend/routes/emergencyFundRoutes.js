// backend/routes/emergencyFundRoutes.js
const express = require('express');
const router = express.Router();
const AdaptiveEmergencyFundForecaster = require('../services/adaptiveEmergencyFundForecaster');
const EmergencyFund = require('../models/emergencyFund');
const Transaction = require('../models/transaction');
const recommendationUtils = require('../utils/recommendationUtils');

// Forecast endpoint
router.get('/forecast/:userId', async (req, res) => {
  const { userId } = req.params;
  const transactions = await Transaction.getUserTransactions(userId);
  const fund = await EmergencyFund.getUserFunds(userId);
  const forecaster = new AdaptiveEmergencyFundForecaster();
  // Dummy lifeEvents and incomeHistory for now
  const lifeEvents = [];
  const incomeHistory = transactions.filter(tx => tx.type === 'income');
  const result = await forecaster.forecast(userId, transactions, lifeEvents, incomeHistory);
  res.json(result);
});

// Recommendation endpoint
router.get('/recommendation/:userId', async (req, res) => {
  const { userId } = req.params;
  const transactions = await Transaction.getUserTransactions(userId);
  const fund = await EmergencyFund.getUserFunds(userId);
  const monthlyIncome = transactions.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0) / 6;
  const monthlyExpenses = transactions.filter(tx => tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0) / 6;
  const recommendedFund = fund?.[0]?.recommendedFund || 0;
  const currentBalance = fund?.[0]?.balance || 0;
  const balanceHistory = fund?.[0]?.balanceHistory || [];
  const plan = recommendationUtils.generateSavingsPlan(currentBalance, recommendedFund, monthlyIncome, monthlyExpenses);
  const progress = recommendationUtils.trackProgress(balanceHistory, recommendedFund);
  res.json({ plan, progress });
});

module.exports = router;
