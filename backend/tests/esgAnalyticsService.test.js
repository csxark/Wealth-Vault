// backend/tests/esgAnalyticsService.test.js
const ESGAnalyticsService = require('../services/esgAnalyticsService');
const PortfolioRepository = require('../repositories/portfolioRepository');
const ESGRepository = require('../repositories/esgRepository');

describe('ESGAnalyticsService', () => {
  const mockPortfolioRepo = {
    getUserPortfolio: async (userId) => ({
      userId,
      assets: [
        { symbol: 'AAPL' },
        { symbol: 'TSLA' },
        { symbol: 'GOOG' }
      ]
    })
  };
  const mockESGRepo = {
    getRatingsForSymbols: async (symbols) => [
      { symbol: 'AAPL', overall: 85 },
      { symbol: 'TSLA', overall: 55 },
      { symbol: 'GOOG', overall: 90 }
    ]
  };

  it('should return ESG compliance trends for user', async () => {
    const service = new ESGAnalyticsService(mockPortfolioRepo, mockESGRepo);
    const trends = await service.getComplianceTrends('user1');
    expect(Array.isArray(trends)).toBe(true);
    expect(trends.length).toBe(6);
  });
});
