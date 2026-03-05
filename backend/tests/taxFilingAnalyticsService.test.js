// backend/tests/taxFilingAnalyticsService.test.js
const TaxFilingAnalyticsService = require('../services/taxFilingAnalyticsService');

describe('TaxFilingAnalyticsService', () => {
  const mockRepo = {
    getUserFilings: async (userId) => [
      {
        taxYear: 2025,
        deadline: "2026-04-15",
        filedDate: null,
        status: "pending",
        penalties: 0
      },
      {
        taxYear: 2024,
        deadline: "2025-04-15",
        filedDate: "2025-04-10",
        status: "on-time",
        penalties: 0
      }
    ]
  };

  it('should generate analytics for tax filings', async () => {
    const service = new TaxFilingAnalyticsService(mockRepo);
    const result = await service.getAnalytics('user1', {});
    expect(result.filingTrends.length).toBe(2);
    expect(result.riskSimulations.length).toBe(2);
    expect(Object.keys(result.complianceScores).length).toBe(2);
    expect(result.forecast.length).toBe(2);
    expect(result.strategySuggestions.length).toBe(2);
  });
});
