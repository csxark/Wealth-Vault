// backend/tests/subscriptionRenewalAnalyticsService.test.js
import SubscriptionRenewalAnalyticsService from '../services/subscriptionRenewalAnalyticsService.js';

describe('SubscriptionRenewalAnalyticsService', () => {
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
          { date: "2026-01-15", action: "unwanted" },
          { date: "2025-12-15", action: "cancelled" }
        ]
      },
      {
        id: "sub2",
        name: "Spotify",
        renewalDate: "2026-03-20",
        status: "inactive",
        lastAction: "cancelled",
        history: [
          { date: "2026-02-20", action: "missed" },
          { date: "2026-01-20", action: "renewed" }
        ]
      }
    ]
  };

  it('should generate analytics for subscriptions', async () => {
    const service = new SubscriptionRenewalAnalyticsService(mockRepo);
    const result = await service.getAnalytics('user1');
    expect(result.renewalPatterns.length).toBe(2);
    expect(result.cancellationTrends.length).toBe(2);
    expect(result.renewalForecast.length).toBe(2);
    expect(Object.keys(result.riskScores).length).toBe(2);
    expect(result.missedRenewalStats.length).toBe(2);
  });
});
