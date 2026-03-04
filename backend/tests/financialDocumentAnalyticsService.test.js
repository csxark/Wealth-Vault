// backend/tests/financialDocumentAnalyticsService.test.js
const FinancialDocumentAnalyticsService = require('../services/financialDocumentAnalyticsService');

describe('FinancialDocumentAnalyticsService', () => {
  const mockRepo = {
    getUserDocuments: async (userId) => [
      { type: "Tax Return", lastUpdated: "2025-02-01", fileUrl: "url1" },
      { type: "Loan Agreement", lastUpdated: "2024-01-15", fileUrl: "url2" },
      { type: "Insurance Policy", lastUpdated: "2023-01-10", fileUrl: null }
    ]
  };

  it('should detect expiry risk', async () => {
    const service = new FinancialDocumentAnalyticsService(mockRepo);
    const result = await service.getAnalytics('user1');
    expect(result.expiryRisk.length).toBeGreaterThan(0);
  });

  it('should detect compliance issues', async () => {
    const service = new FinancialDocumentAnalyticsService(mockRepo);
    const result = await service.getAnalytics('user1');
    expect(result.complianceIssues.length).toBeGreaterThan(0);
  });

  it('should calculate urgency scores', async () => {
    const service = new FinancialDocumentAnalyticsService(mockRepo);
    const result = await service.getAnalytics('user1');
    expect(result.urgencyScores["Tax Return"]).toBeDefined();
  });
});
