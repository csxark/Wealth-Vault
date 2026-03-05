// backend/tests/investmentFeeAnalyticsService.test.js
const InvestmentFeeAnalyticsService = require('../services/investmentFeeAnalyticsService');

describe('InvestmentFeeAnalyticsService', () => {
  const mockRepo = {
    getUserAccounts: async (userId) => [
      {
        id: "inv1",
        accountName: "Retirement Fund",
        feeRate: 1.2,
        balance: 50000,
        feeHistory: [1.2, 1.1, 1.0],
        provider: "ProviderA"
      },
      {
        id: "inv2",
        accountName: "Index Fund",
        feeRate: 0.3,
        balance: 30000,
        feeHistory: [0.3, 0.3, 0.3],
        provider: "ProviderB"
      }
    ]
  };

  it('should generate analytics for investment fees', async () => {
    const service = new InvestmentFeeAnalyticsService(mockRepo);
    const result = await service.getAnalytics('user1', { simulationYears: 10 });
    expect(result.feeTrends.length).toBe(2);
    expect(result.impactSimulations.length).toBe(2);
    expect(Object.keys(result.riskScores).length).toBe(2);
    expect(result.forecast.length).toBe(2);
    expect(result.alternativeProviders.length).toBe(2);
  });
});
