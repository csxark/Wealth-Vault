/**
 * Credit Utilization Alert Engine Service Advanced Test Suite
 * Uses Jest for advanced and edge case testing
 */

const CreditUtilizationAlertEngineService = require('../backend/services/creditUtilizationAlertEngineService');

describe('CreditUtilizationAlertEngineService Advanced', () => {
    const creditAccounts = [
        { accountId: 'card1', name: 'Visa Platinum', limit: 5000, balance: 4900, utilizationHistory: [0.95, 0.98], type: 'revolving', paymentDue: '2026-03-06' },
        { accountId: 'card2', name: 'MasterCard Gold', limit: 3000, balance: 900, utilizationHistory: [0.25, 0.3], type: 'revolving', paymentDue: '2026-03-10' },
        { accountId: 'card3', name: 'Amex Green', limit: 7000, balance: 2100, utilizationHistory: [0.28, 0.3], type: 'charge', paymentDue: '2026-03-12' }
    ];
    const options = { utilizationThreshold: 0.3 };

    it('should analyze account types', () => {
        const service = new CreditUtilizationAlertEngineService(creditAccounts, options);
        const types = service.analyzeAccountTypes();
        expect(types.revolving.count).toBeGreaterThanOrEqual(2);
        expect(types.charge.count).toBeGreaterThanOrEqual(1);
    });

    it('should forecast utilization for accounts', () => {
        const service = new CreditUtilizationAlertEngineService(creditAccounts, options);
        const forecast = service.forecastUtilization('card1');
        expect(forecast).toHaveProperty('forecastedUtilization');
    });

    it('should generate personalized alerts for approaching limit and payment due', () => {
        const service = new CreditUtilizationAlertEngineService(creditAccounts, options);
        const alerts = service.generatePersonalizedAlerts();
        expect(alerts.some(a => a.type === 'limit')).toBe(true);
        expect(alerts.some(a => a.type === 'payment')).toBe(true);
    });

    it('should segment users by risk', () => {
        const service = new CreditUtilizationAlertEngineService(creditAccounts, options);
        const segments = service.segmentUsers();
        expect(Array.isArray(segments.highRisk)).toBe(true);
        expect(Array.isArray(segments.moderateRisk)).toBe(true);
        expect(Array.isArray(segments.lowRisk)).toBe(true);
    });

    it('should predict user behavior for future utilization', () => {
        const service = new CreditUtilizationAlertEngineService(creditAccounts, options);
        const prediction = service.predictUserBehavior('card1');
        expect(prediction).toHaveProperty('predictedNextUtilization');
    });

    it('should track user milestones', () => {
        const service = new CreditUtilizationAlertEngineService(creditAccounts, options);
        const milestones = service.trackUserMilestones();
        expect(Array.isArray(milestones)).toBe(true);
    });

    it('should generate audit log for utilization checks', () => {
        const service = new CreditUtilizationAlertEngineService(creditAccounts, options);
        const log = service.generateAuditLog();
        expect(Array.isArray(log)).toBe(true);
        expect(log[0]).toHaveProperty('action', 'utilizationCheck');
    });

    it('should run ultimate analysis and return all advanced features', () => {
        const service = new CreditUtilizationAlertEngineService(creditAccounts, options);
        const result = service.runUltimateAnalysis();
        expect(result.userSegments).toBeDefined();
        expect(result.userPredictions).toBeDefined();
        expect(result.userMilestones).toBeDefined();
        expect(result.auditLog).toBeDefined();
    });
});
