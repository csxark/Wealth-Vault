// backend/tests/sustainableScreenerService.test.js
const SustainableScreenerService = require('../services/sustainableScreenerService');
const ESGRepository = require('../repositories/esgRepository');
const PortfolioRepository = require('../repositories/portfolioRepository');

describe('SustainableScreenerService', () => {
  const mockESGRepo = {
    getRatingsForSymbols: async (symbols) => [
      { symbol: 'AAPL', overall: 85 },
      { symbol: 'TSLA', overall: 55 },
      { symbol: 'GOOG', overall: 90 }
    ]
  };
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

  it('should screen portfolio and flag non-compliant assets', async () => {
    const service = new SustainableScreenerService(mockESGRepo, mockPortfolioRepo);
    const result = await service.screenPortfolio('user1');
    expect(Array.isArray(result.flagged)).toBe(true);
    expect(result.flagged.length).toBe(1);
    expect(result.compliance.complianceScore).toBeGreaterThan(0);
  });
});
