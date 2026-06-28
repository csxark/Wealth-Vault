// backend/tests/emergencyFundHealthMonitorService.test.js
const EmergencyFundHealthMonitorService = require('../services/emergencyFundHealthMonitorService');

describe('EmergencyFundHealthMonitorService', () => {
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

  it('should analyze fund health and generate alerts', async () => {
    const service = new EmergencyFundHealthMonitorService(mockRepo);
    const result = await service.analyzeFundHealth('user1', { scenarioType: "job loss", adequacyThreshold: 10000 });
    expect(result.analysis.length).toBe(1);
    expect(result.alerts.length).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.trends.length).toBe(1);
    expect(result.summary.totalFunds).toBe(1);
    expect(result.summary.insufficientFunds).toBe(1);
    expect(result.summary.highRiskFunds).toBe(1);
  });
});
