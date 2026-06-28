// backend/tests/taxFilingDeadlineAlertService.test.js
const TaxFilingDeadlineAlertService = require('../services/taxFilingDeadlineAlertService');

describe('TaxFilingDeadlineAlertService', () => {
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

  it('should analyze deadlines and generate alerts', async () => {
    const service = new TaxFilingDeadlineAlertService(mockRepo);
    const result = await service.analyzeDeadlines('user1', { riskThreshold: 0.5, lookbackYears: 2 });
    expect(result.analysis.length).toBe(2);
    expect(result.alerts.length).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.trends.length).toBe(2);
    expect(result.summary.totalYears).toBe(2);
    expect(result.summary.lateFilings).toBe(0);
    expect(result.summary.highRiskYears).toBe(1);
  });
});
