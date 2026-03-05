// backend/tests/retirementProgressService.test.js
const RetirementProgressService = require('../services/retirementProgressService');
const RetirementGoalRepository = require('../repositories/retirementGoalRepository');
const RetirementAccountRepository = require('../repositories/retirementAccountRepository');

describe('RetirementProgressService', () => {
  const mockGoalRepo = {
    getUserGoal: async (userId) => ({
      userId,
      targetAmount: 500000,
      targetAge: 65,
      currentAge: 40
    })
  };
  const mockAccountRepo = {
    getUserAccounts: async (userId) => [
      { balance: 100000, annualContribution: 10000, expectedReturn: 0.06 },
      { balance: 50000, annualContribution: 5000, expectedReturn: 0.06 }
    ]
  };

  it('should track progress and detect gap', async () => {
    const service = new RetirementProgressService(mockGoalRepo, mockAccountRepo);
    const result = await service.trackProgress('user1');
    expect(result.progress).toHaveProperty('totalBalance');
    expect(result.progress).toHaveProperty('projected');
    expect(Array.isArray(result.recommendations)).toBe(true);
  });
});
