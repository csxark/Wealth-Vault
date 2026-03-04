/**
 * Credit Utilization Alert Engine Service Test Suite
 * Uses Jest for unit testing
 */

const CreditUtilizationAlertEngineService = require('../backend/services/creditUtilizationAlertEngineService');

describe('CreditUtilizationAlertEngineService', () => {
    const creditAccounts = [
        { accountId: 'card1', name: 'Visa Platinum', limit: 5000, balance: 2500, utilizationHistory: [0.45, 0.5] },
        { accountId: 'card2', name: 'MasterCard Gold', limit: 3000, balance: 900, utilizationHistory: [0.25, 0.3] },
        { accountId: 'card3', name: 'Amex Green', limit: 7000, balance: 2100, utilizationHistory: [0.28, 0.3] }
    ];
    const options = { utilizationThreshold: 0.3 };

    it('should analyze utilization rates and overall utilization', () => {
        const service = new CreditUtilizationAlertEngineService(creditAccounts, options);
        const analysis = service.analyzeUtilization();
        expect(analysis.accounts.length).toBe(3);
        expect(analysis.overallUtilization).toBeGreaterThan(0);
    });

    it('should simulate score impact', () => {
        const service = new CreditUtilizationAlertEngineService(creditAccounts, options);
        service.analysisResults = service.analyzeUtilization();
        const simulation = service.simulateScoreImpact();
        expect(simulation.length).toBe(3);
        expect(simulation[0]).toHaveProperty('scoreImpact');
    });

    it('should generate alerts for high utilization', () => {
        const service = new CreditUtilizationAlertEngineService(creditAccounts, options);
        service.analysisResults = service.analyzeUtilization();
        const alerts = service.generateAlerts();
        expect(Array.isArray(alerts)).toBe(true);
    });

    it('should recommend paydown strategies', () => {
        const service = new CreditUtilizationAlertEngineService(creditAccounts, options);
        service.analysisResults = service.analyzeUtilization();
        const recs = service.recommendPaydownStrategies();
        expect(Array.isArray(recs)).toBe(true);
    });

    it('should recommend usage optimization tips', () => {
        const service = new CreditUtilizationAlertEngineService(creditAccounts, options);
        service.analysisResults = service.analyzeUtilization();
        const tips = service.recommendUsageOptimization();
        expect(Array.isArray(tips)).toBe(true);
    });

    it('should generate trend data', () => {
        const service = new CreditUtilizationAlertEngineService(creditAccounts, options);
        const trends = service.generateTrendData();
        expect(trends.length).toBe(3);
        expect(trends[0].utilizationTrend.length).toBe(6);
    });

    it('should run complete analysis and return summary', () => {
        const service = new CreditUtilizationAlertEngineService(creditAccounts, options);
        const result = service.runCompleteAnalysis();
        expect(result.analysis).toBeDefined();
        expect(result.scoreSimulation).toBeDefined();
        expect(result.alerts).toBeDefined();
        expect(result.paydownRecommendations).toBeDefined();
        expect(result.usageOptimizationTips).toBeDefined();
        expect(result.trends).toBeDefined();
        expect(result.report).toBeDefined();
        expect(result.summary.totalAccounts).toBe(3);
    });
});
