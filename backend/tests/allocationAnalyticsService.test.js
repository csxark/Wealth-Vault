// backend/tests/allocationAnalyticsService.test.js
const AllocationAnalyticsService = require('../services/allocationAnalyticsService');
const PortfolioRepository = require('../repositories/portfolioRepository');

describe('AllocationAnalyticsService', () => {
  const mockPortfolioRepo = {
    getUserPortfolio: async (userId) => ({
      userId,
      assets: [
        { symbol: 'AAPL', allocation: 30 },
        { symbol: 'GOOG', allocation: 40 },
        { symbol: 'TSLA', allocation: 30 }
      ]
    })
  };

  it('should return allocation trends for user', async () => {
    const service = new AllocationAnalyticsService(mockPortfolioRepo);
    const trends = await service.getAllocationTrends('user1');
    expect(Array.isArray(trends)).toBe(true);
    expect(trends.length).toBe(6);
  });
});
