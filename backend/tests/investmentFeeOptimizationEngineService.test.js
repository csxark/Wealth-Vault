// backend/tests/investmentFeeOptimizationEngineService.test.js
const InvestmentFeeOptimizationEngineService = require('../services/investmentFeeOptimizationEngineService');

describe('InvestmentFeeOptimizationEngineService', () => {
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

  it('should analyze fees and generate alerts', async () => {
    const service = new InvestmentFeeOptimizationEngineService(mockRepo);
    const result = await service.analyzeFees('user1', { feeThreshold: 1.0, simulationYears: 10 });
    expect(result.analysis.length).toBe(2);
    expect(result.alerts.length).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.trends.length).toBe(2);
    expect(result.summary.totalAccounts).toBe(2);
    expect(result.summary.highFeeAccounts).toBe(1);
  });
});
