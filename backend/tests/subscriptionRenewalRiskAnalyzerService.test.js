// backend/tests/subscriptionRenewalRiskAnalyzerService.test.js
import SubscriptionRenewalRiskAnalyzerService from '../services/subscriptionRenewalRiskAnalyzerService.js';

describe('SubscriptionRenewalRiskAnalyzerService', () => {
  const mockRepo = {
    getUserSubscriptions: async (userId) => [
      {
        id: "sub1",
        name: "Netflix",
        renewalDate: "2026-03-15",
        status: "active",
        lastAction: "renewed",
        history: [
          { date: "2026-02-15", action: "renewed" },
          { date: "2026-01-15", action: "unwanted" }
        ]
      },
      {
        id: "sub2",
        name: "Spotify",
        renewalDate: "2026-03-20",
        status: "inactive",
        lastAction: "cancelled",
        history: [
          { date: "2026-02-20", action: "missed" }
        ]
      }
    ]
  };

  it('should analyze renewal risk and generate alerts', async () => {
    const service = new SubscriptionRenewalRiskAnalyzerService(mockRepo);
    const result = await service.analyzeRenewalRisk('user1', { lookbackMonths: 12, renewalRiskThreshold: 1 });
    expect(result.analysis.length).toBeGreaterThan(0);
    expect(result.upcomingAlerts.length).toBeGreaterThan(0);
    expect(result.riskAlerts.length).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.trends.length).toBeGreaterThan(0);
    expect(result.summary.totalSubscriptions).toBe(2);
  });
});
