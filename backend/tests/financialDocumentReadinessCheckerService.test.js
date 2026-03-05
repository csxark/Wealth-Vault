// backend/tests/financialDocumentReadinessCheckerService.test.js
const FinancialDocumentReadinessCheckerService = require('../services/financialDocumentReadinessCheckerService');

describe('FinancialDocumentReadinessCheckerService', () => {
  const mockRepo = {
    getUserDocuments: async (userId) => [
      { type: "Tax Return", lastUpdated: "2025-02-01" },
      { type: "Loan Agreement", lastUpdated: "2026-01-15" }
    ]
  };

  it('should identify missing documents', async () => {
    const service = new FinancialDocumentReadinessCheckerService(mockRepo);
    const result = await service.analyzeReadiness('user1');
    expect(result.report.some(r => r.status === "missing")).toBe(true);
  });

  it('should identify outdated documents', async () => {
    const outdatedRepo = {
      getUserDocuments: async (userId) => [
        { type: "Tax Return", lastUpdated: "2023-01-01" }
      ]
    };
    const service = new FinancialDocumentReadinessCheckerService(outdatedRepo);
    const result = await service.analyzeReadiness('user2');
    expect(result.report.some(r => r.status === "outdated")).toBe(true);
  });

  it('should identify complete documents', async () => {
    const completeRepo = {
      getUserDocuments: async (userId) => [
        { type: "Tax Return", lastUpdated: "2026-02-01" },
        { type: "Loan Agreement", lastUpdated: "2026-01-15" },
        { type: "Insurance Policy", lastUpdated: "2026-01-10" },
        { type: "Pay Stub", lastUpdated: "2026-02-15" },
        { type: "Emergency Fund Statement", lastUpdated: "2026-02-20" }
      ]
    };
    const service = new FinancialDocumentReadinessCheckerService(completeRepo);
    const result = await service.analyzeReadiness('user3');
    expect(result.report.every(r => r.status === "complete")).toBe(true);
  });
});
