// backend/tests/emergencyFundAnalyticsService.test.js
const EmergencyFundAnalyticsService = require('../services/emergencyFundAnalyticsService');

describe('EmergencyFundAnalyticsService', () => {
  const mockRepo = {
    getUserFunds: async (userId) => [
      {
        id: "ef1",
        balance: 5000,
        lastUpdated: "2026-03-01",
        balanceHistory: [4000, 4500, 5000],
        transactions: [
          { date: "2026-02-01", amount: 500, type: "deposit" },
          { date: "2026-01-01", amount: 500, type: "deposit" }
        ],
        riskProfile: "high"
      }
    ]
  };

  it('should generate analytics for emergency fund', async () => {
    const service = new EmergencyFundAnalyticsService(mockRepo);
    const result = await service.getAnalytics('user1', { scenarioType: "job loss" });
    expect(result.adequacyTrends.length).toBe(1);
    expect(result.scenarioSimulations.length).toBe(1);
    expect(Object.keys(result.riskScores).length).toBe(1);
    expect(result.forecast.length).toBe(1);
    expect(result.savingsPatterns.length).toBe(1);
  });
});
