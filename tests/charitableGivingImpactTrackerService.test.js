/**
 * Charitable Giving Impact Tracker Service Test Suite
 * Uses Jest for unit testing
 */

const CharitableGivingImpactTrackerService = require('../backend/services/charitableGivingImpactTrackerService');

describe('CharitableGivingImpactTrackerService', () => {
    const donationData = [
        { donationId: 'd1', orgId: 'o1', orgName: 'Charity A', category: 'Health', amount: 500, date: '2025-12-01' },
        { donationId: 'd2', orgId: 'o2', orgName: 'Charity B', category: 'Education', amount: 300, date: '2026-01-15' },
        { donationId: 'd3', orgId: 'o1', orgName: 'Charity A', category: 'Health', amount: 200, date: '2026-02-10' }
    ];
    const userProfile = { agi: 10000, taxRate: 0.22 };
    const orgData = {
        o1: { name: 'Charity A', impactFactor: 1.5, matchingAvailable: true },
        o2: { name: 'Charity B', impactFactor: 1.2, matchingAvailable: false }
    };

    it('should aggregate donations by org, category, and year', () => {
        const service = new CharitableGivingImpactTrackerService(donationData, userProfile, orgData);
        const agg = service.aggregateDonations();
        expect(Object.keys(agg.byOrg).length).toBe(2);
        expect(Object.keys(agg.byCategory).length).toBe(2);
        expect(Object.keys(agg.byYear).length).toBeGreaterThanOrEqual(1);
    });

    it('should simulate tax benefits', () => {
        const service = new CharitableGivingImpactTrackerService(donationData, userProfile, orgData);
        const tax = service.simulateTaxBenefits();
        expect(tax.totalDonated).toBe(1000);
        expect(tax.taxSavings).toBeGreaterThan(0);
    });

    it('should calculate social impact metrics', () => {
        const service = new CharitableGivingImpactTrackerService(donationData, userProfile, orgData);
        const impact = service.calculateSocialImpact();
        expect(impact.totalImpact).toBeGreaterThan(0);
    });

    it('should recommend giving strategies', () => {
        const service = new CharitableGivingImpactTrackerService(donationData, userProfile, orgData);
        service.aggregatedDonations = service.aggregateDonations();
        service.taxSimulation = service.simulateTaxBenefits();
        const recs = service.recommendGivingStrategies();
        expect(Array.isArray(recs)).toBe(true);
    });

    it('should generate matching alerts', () => {
        const service = new CharitableGivingImpactTrackerService(donationData, userProfile, orgData);
        const alerts = service.generateMatchingAlerts();
        expect(alerts.some(a => a.message.includes('Matching donation opportunity'))).toBe(true);
    });

    it('should generate visualization data', () => {
        const service = new CharitableGivingImpactTrackerService(donationData, userProfile, orgData);
        service.aggregatedDonations = service.aggregateDonations();
        service.socialImpactMetrics = service.calculateSocialImpact();
        const viz = service.generateVisualizationData();
        expect(Array.isArray(viz.trend)).toBe(true);
        expect(Array.isArray(viz.impact)).toBe(true);
    });

    it('should run full analysis and return summary', () => {
        const service = new CharitableGivingImpactTrackerService(donationData, userProfile, orgData);
        const result = service.runAnalysis();
        expect(result.aggregatedDonations).toBeDefined();
        expect(result.taxSimulation).toBeDefined();
        expect(result.socialImpactMetrics).toBeDefined();
        expect(result.givingRecommendations).toBeDefined();
        expect(result.matchingAlerts).toBeDefined();
        expect(result.visualization).toBeDefined();
        expect(result.summary.totalDonated).toBe(1000);
    });
});
