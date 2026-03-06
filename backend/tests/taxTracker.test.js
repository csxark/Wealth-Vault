// Unit Tests for Tax Optimization Tracker
const { TaxUser, TaxTransaction, Investment } = require('../models/taxUserData');
const { detectTaxOpportunities, generateTaxRecommendations } = require('../utils/taxUtils');
const TaxOptimizationTracker = require('../services/taxOptimizationTrackerService');
const assert = require('assert');

describe('Tax Utils', () => {
    it('should detect tax opportunities', () => {
        const transactions = [
            new TaxTransaction(1, 1, 12000, 'insurance', new Date('2023-01-01')),
            new TaxTransaction(2, 1, 16000, 'medical', new Date('2023-02-01'))
        ];
        const investments = [
            new Investment(1, 1, 'ELSS', 50000, new Date('2023-03-01')),
            new Investment(2, 1, 'PPF', 100000, new Date('2023-04-01'))
        ];
        const opportunities = detectTaxOpportunities(transactions, investments);
        assert(opportunities.length >= 1);
    });

    it('should generate tax recommendations', () => {
        const opportunities = [
            { type: 'Section 80C', description: 'ELSS investment eligible for 80C deduction.' }
        ];
        const recommendations = generateTaxRecommendations(opportunities);
        assert(recommendations.length === opportunities.length);
    });
});

describe('TaxOptimizationTracker', () => {
    it('should analyze tax opportunities', async () => {
        // Mock data loading
        const tracker = new TaxOptimizationTracker(1);
        tracker.transactions = [
            new TaxTransaction(1, 1, 12000, 'insurance', new Date('2023-01-01')),
            new TaxTransaction(2, 1, 16000, 'medical', new Date('2023-02-01'))
        ];
        tracker.investments = [
            new Investment(1, 1, 'ELSS', 50000, new Date('2023-03-01')),
            new Investment(2, 1, 'PPF', 100000, new Date('2023-04-01'))
        ];
        const result = await tracker.analyzeTaxOpportunities();
        assert(result.opportunities.length > 0);
        assert(result.recommendations.length > 0);
    });
});
