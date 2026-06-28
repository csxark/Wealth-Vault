// backend/tests/rebalancingAdvisorService.test.js
const RebalancingAdvisorService = require('../services/rebalancingAdvisorService');
const PortfolioRepository = require('../repositories/portfolioRepository');
const RebalancingRepository = require('../repositories/rebalancingRepository');

describe('RebalancingAdvisorService', () => {
  const mockPortfolioRepo = {
    getUserPortfolio: async (userId) => ({
      userId,
      assets: [
        { symbol: 'AAPL', allocation: 30, targetAllocation: 25 },
        { symbol: 'GOOG', allocation: 40, targetAllocation: 35 },
        { symbol: 'TSLA', allocation: 30, targetAllocation: 40 }
      ],
      lastRebalanced: null,
      drift: 0
    }),
    updatePortfolio: async () => true
  };
  const mockRebalancingRepo = {
    addRebalancingAction: async (data) => data,
    getUserRebalancingHistory: async () => []
  };

  it('should analyze portfolio and recommend actions', async () => {
    const service = new RebalancingAdvisorService(mockPortfolioRepo, mockRebalancingRepo);
    const result = await service.analyzePortfolio('user1');
    expect(result.drift).toBeGreaterThan(0);
    expect(Array.isArray(result.actions)).toBe(true);
  });

  it('should automate rebalancing and update history', async () => {
    const service = new RebalancingAdvisorService(mockPortfolioRepo, mockRebalancingRepo);
    const result = await service.automateRebalancing('user1');
    expect(result.success).toBe(true);
    expect(result.history).toHaveProperty('userId', 'user1');
  });
});
