// backend/tests/retirementAnalyticsService.test.js
const RetirementAnalyticsService = require('../services/retirementAnalyticsService');
const RetirementGoalRepository = require('../repositories/retirementGoalRepository');

describe('RetirementAnalyticsService', () => {
  const mockGoalRepo = {
    getUserGoal: async (userId) => ({
      userId,
      targetAmount: 500000,
      targetAge: 65,
      currentAge: 40
    })
  };

  it('should return progress trends for user', async () => {
    const service = new RetirementAnalyticsService(mockGoalRepo);
    const trends = await service.getProgressTrends('user1');
    expect(Array.isArray(trends)).toBe(true);
    expect(trends.length).toBe(6);
  });
});
