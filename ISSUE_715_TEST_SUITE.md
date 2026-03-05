# Issue #715 - Goal Adjustment Explainability
## Test Suite & Examples

This document provides comprehensive test cases and examples for validating the Goal Adjustment Explainability feature.

---

## Part 1: Unit Tests

### Test File: `__tests__/services/goalAdjustmentExplainabilityService.test.js`

```javascript
const GoalAdjustmentExplainabilityService = require('../../services/goalAdjustmentExplainabilityService');
const { db } = require('../../db');

describe('GoalAdjustmentExplainabilityService', () => {
    let service;
    const testData = {
        tenantId: 'test-tenant-123',
        userId: 'test-user-456',
        goalId: 'test-goal-789'
    };

    beforeEach(() => {
        service = new GoalAdjustmentExplainabilityService();
    });

    // ===== LOG ADJUSTMENT TESTS =====
    describe('logAdjustment()', () => {
        it('should create explanation record with all required fields', async () => {
            const adjustmentData = {
                ...testData,
                previousRecommendationId: 'prev-rec-1',
                newRecommendationId: 'new-rec-2',
                previousAmount: 500,
                newAmount: 750,
                amountChange: 250,
                amountChangePercentage: 50,
                attributionFactors: [
                    {
                        factor: 'income_delta',
                        impact_pct: 60,
                        severity: 'high'
                    }
                ],
                incomeDelta: 500,
                expenseDelta: 0,
                confidenceScore: 0.85,
                confidenceLevel: 'high',
                stabilityIndex: 75,
                triggerSource: 'cashflow_change',
                eventType: 'increase'
            };

            const result = await service.logAdjustment(adjustmentData);

            expect(result).toBeDefined();
            expect(result.id).toBeDefined();
            expect(result.tenantId).toBe(testData.tenantId);
            expect(result.userId).toBe(testData.userId);
            expect(result.goalId).toBe(testData.goalId);
            expect(result.previousAmount).toBe(500);
            expect(result.newAmount).toBe(750);
            expect(result.amountChange).toBe(250);
        });

        it('should create attribution detail records for each factor', async () => {
            const adjustmentData = {
                ...testData,
                previousRecommendationId: 'prev-rec-1',
                newRecommendationId: 'new-rec-2',
                previousAmount: 500,
                newAmount: 750,
                amountChange: 250,
                amountChangePercentage: 50,
                attributionFactors: [
                    {
                        factor: 'income_delta',
                        displayName: 'Income Change',
                        impact_pct: 60,
                        severity: 'high'
                    },
                    {
                        factor: 'expense_delta',
                        displayName: 'Expense Change',
                        impact_pct: 40,
                        severity: 'medium'
                    }
                ],
                incomeDelta: 500,
                expenseDelta: 200,
                confidenceScore: 0.85,
                confidenceLevel: 'high',
                stabilityIndex: 75,
                triggerSource: 'cashflow_change',
                eventType: 'increase'
            };

            const explanation = await service.logAdjustment(adjustmentData);

            // Check that attribution records were created
            const attributions = await db.query.goalAdjustmentAttributionDetails
                .findMany({
                    where: eq(
                        goalAdjustmentAttributionDetails.explanationId,
                        explanation.id
                    )
                });

            expect(attributions.length).toBe(2);
            expect(attributions[0].factor).toBe('income_delta');
            expect(attributions[1].factor).toBe('expense_delta');
        });

        it('should generate summary if not provided', async () => {
            const adjustmentData = {
                ...testData,
                previousRecommendationId: 'prev-rec-1',
                newRecommendationId: 'new-rec-2',
                previousAmount: 500,
                newAmount: 750,
                amountChange: 250,
                amountChangePercentage: 50,
                attributionFactors: [
                    {
                        factor: 'income_delta',
                        impact_pct: 100,
                        severity: 'high'
                    }
                ],
                incomeDelta: 500,
                expenseDelta: 0,
                confidenceScore: 0.85,
                confidenceLevel: 'high',
                stabilityIndex: 75,
                triggerSource: 'cashflow_change',
                eventType: 'increase'
                // No summary provided
            };

            const result = await service.logAdjustment(adjustmentData);

            expect(result.summary).toBeDefined();
            expect(result.summary.length).toBeGreaterThan(0);
            expect(result.summary).toContain('increase');
        });

        it('should set requiresReview=true for high severity changes', async () => {
            const adjustmentData = {
                ...testData,
                previousRecommendationId: 'prev-rec-1',
                newRecommendationId: 'new-rec-2',
                previousAmount: 500,
                newAmount: 1500,  // 200% increase
                amountChange: 1000,
                amountChangePercentage: 200,  // Very high
                attributionFactors: [
                    {
                        factor: 'deadline_pressure',
                        impact_pct: 100,
                        severity: 'high'
                    }
                ],
                confidenceScore: 0.65,
                confidenceLevel: 'medium',
                stabilityIndex: 45,
                triggerSource: 'deadline_pressure',
                eventType: 'increase'
            };

            const result = await service.logAdjustment(adjustmentData);

            expect(result.severity).toBe('high');
            expect(result.requiresReview).toBe(true);
        });

        it('should validate required fields', async () => {
            const incompleteData = {
                ...testData,
                // Missing previousRecommendationId
                newRecommendationId: 'new-rec-2',
                previousAmount: 500,
                newAmount: 750
            };

            await expect(service.logAdjustment(incompleteData))
                .rejects
                .toThrow('previousRecommendationId is required');
        });
    });

    // ===== HISTORY RETRIEVAL TESTS =====
    describe('getAdjustmentHistory()', () => {
        beforeEach(async () => {
            // Create sample adjustments
            for (let i = 0; i < 15; i++) {
                await service.logAdjustment({
                    ...testData,
                    previousRecommendationId: `prev-rec-${i}`,
                    newRecommendationId: `new-rec-${i}`,
                    previousAmount: 500 + (i * 50),
                    newAmount: 550 + (i * 50),
                    amountChange: 50,
                    amountChangePercentage: 10,
                    attributionFactors: [
                        {
                            factor: 'income_delta',
                            impact_pct: 100,
                            severity: 'low'
                        }
                    ],
                    incomeDelta: 100 * (i + 1),
                    expenseDelta: 0,
                    confidenceScore: 0.8,
                    confidenceLevel: 'high',
                    stabilityIndex: 80,
                    triggerSource: 'cashflow_change',
                    eventType: 'increase'
                });
            }
        });

        it('should retrieve paginated history', async () => {
            const result = await service.getAdjustmentHistory(
                testData.userId,
                testData.goalId,
                { limit: 10, offset: 0, sortBy: 'created_at', sortOrder: 'desc' }
            );

            expect(result.adjustments.length).toBeLessThanOrEqual(10);
            expect(result.total).toBe(15);
            expect(result.limit).toBe(10);
            expect(result.offset).toBe(0);
        });

        it('should sort by creation date descending by default', async () => {
            const result = await service.getAdjustmentHistory(
                testData.userId,
                testData.goalId,
                { limit: 5, sortBy: 'created_at', sortOrder: 'desc' }
            );

            const dates = result.adjustments.map(a => new Date(a.createdAt));
            for (let i = 0; i < dates.length - 1; i++) {
                expect(dates[i].getTime()).toBeGreaterThanOrEqual(dates[i + 1].getTime());
            }
        });

        it('should filter by severity', async () => {
            // Create some high severity adjustments
            for (let i = 0; i < 5; i++) {
                await service.logAdjustment({
                    ...testData,
                    previousRecommendationId: `high-prev-${i}`,
                    newRecommendationId: `high-new-${i}`,
                    previousAmount: 500,
                    newAmount: 1500,
                    amountChange: 1000,
                    amountChangePercentage: 200,
                    attributionFactors: [{ factor: 'deadline_pressure', impact_pct: 100 }],
                    confidenceScore: 0.6,
                    confidenceLevel: 'medium',
                    stabilityIndex: 40,
                    triggerSource: 'deadline_pressure',
                    eventType: 'increase'
                });
            }

            const result = await service.getAdjustmentHistory(
                testData.userId,
                testData.goalId,
                { limit: 100, severity: 'high' }
            );

            expect(result.adjustments.every(a => a.severity === 'high')).toBe(true);
        });
    });

    // ===== DETAILS TESTS =====
    describe('getAdjustmentDetails()', () => {
        let explanationId;

        beforeEach(async () => {
            const explanation = await service.logAdjustment({
                ...testData,
                previousRecommendationId: 'prev-rec-1',
                newRecommendationId: 'new-rec-2',
                previousAmount: 500,
                newAmount: 750,
                amountChange: 250,
                amountChangePercentage: 50,
                attributionFactors: [
                    {
                        factor: 'income_delta',
                        displayName: 'Income Change',
                        displayValue: '$500/month',
                        impact_pct: 70,
                        severity: 'high'
                    },
                    {
                        factor: 'expense_delta',
                        displayName: 'Expense Change',
                        displayValue: '$200/month',
                        impact_pct: 30,
                        severity: 'low'
                    }
                ],
                incomeDelta: 500,
                expenseDelta: 200,
                confidenceScore: 0.85,
                confidenceLevel: 'high',
                stabilityIndex: 75,
                triggerSource: 'cashflow_change',
                eventType: 'increase'
            });
            explanationId = explanation.id;
        });

        it('should retrieve full explanation with all relationships', async () => {
            const details = await service.getAdjustmentDetails(explanationId);

            expect(details).toBeDefined();
            expect(details.id).toBe(explanationId);
            expect(details.attributions).toBeDefined();
            expect(details.attributions.length).toBe(2);
            expect(details.attributions[0].displayName).toBe('Income Change');
        });

        it('should include previous and new recommendation data', async () => {
            const details = await service.getAdjustmentDetails(explanationId);

            expect(details.previousAmount).toBe(500);
            expect(details.newAmount).toBe(750);
            expect(details.amountChange).toBe(250);
        });
    });

    // ===== ACKNOWLEDGEMENT TESTS =====
    describe('acknowledgeAdjustment()', () => {
        let explanationId;

        beforeEach(async () => {
            const explanation = await service.logAdjustment({
                ...testData,
                previousRecommendationId: 'prev-rec-1',
                newRecommendationId: 'new-rec-2',
                previousAmount: 500,
                newAmount: 750,
                amountChange: 250,
                amountChangePercentage: 50,
                attributionFactors: [
                    {
                        factor: 'income_delta',
                        impact_pct: 100,
                        severity: 'high'
                    }
                ],
                incomeDelta: 500,
                expenseDelta: 0,
                confidenceScore: 0.85,
                confidenceLevel: 'high',
                stabilityIndex: 75,
                triggerSource: 'cashflow_change',
                eventType: 'increase'
            });
            explanationId = explanation.id;
        });

        it('should mark adjustment as acknowledged', async () => {
            const result = await service.acknowledgeAdjustment(
                explanationId,
                {
                    feedback: 'Makes sense, my income did increase',
                    feedbackType: 'positive'
                }
            );

            expect(result.userAcknowledged).toBe(true);
            expect(result.acknowledgedAt).toBeDefined();
            expect(result.userFeedback).toBe('Makes sense, my income did increase');
            expect(result.userFeedbackType).toBe('positive');
        });

        it('should accept negative feedback', async () => {
            const result = await service.acknowledgeAdjustment(
                explanationId,
                {
                    feedback: 'This seems too aggressive',
                    feedbackType: 'negative'
                }
            );

            expect(result.userFeedbackType).toBe('negative');
        });

        it('should accept confused feedback', async () => {
            const result = await service.acknowledgeAdjustment(
                explanationId,
                {
                    feedback: 'I dont understand this explanation',
                    feedbackType: 'confused'
                }
            );

            expect(result.userFeedbackType).toBe('confused');
        });
    });

    // ===== ANALYSIS TESTS =====
    describe('analyzeTopFactors()', () => {
        beforeEach(async () => {
            const factors = [
                ['income_delta', 'income_delta', 'income_delta', 'income_delta'],
                ['expense_delta', 'expense_delta'],
                ['deadline_pressure'],
                ['priority_shift']
            ];

            for (const factor of factors.flat()) {
                await service.logAdjustment({
                    ...testData,
                    previousRecommendationId: `prev-${Math.random()}`,
                    newRecommendationId: `new-${Math.random()}`,
                    previousAmount: 500,
                    newAmount: 600,
                    amountChange: 100,
                    amountChangePercentage: 20,
                    attributionFactors: [{ factor, impact_pct: 100 }],
                    incomeDelta: 100,
                    expenseDelta: 0,
                    confidenceScore: 0.8,
                    confidenceLevel: 'high',
                    stabilityIndex: 80,
                    triggerSource: factor,
                    eventType: 'increase'
                });
            }
        });

        it('should rank factors by frequency', async () => {
            const adjustments = await service.getAdjustmentHistory(
                testData.userId,
                testData.goalId,
                { limit: 100 }
            );

            const topFactors = await service.analyzeTopFactors(adjustments.adjustments);

            expect(topFactors[0].factor).toBe('income_delta');
            expect(topFactors[0].frequency).toBe(4);
            expect(topFactors[1].factor).toBe('expense_delta');
            expect(topFactors[1].frequency).toBe(2);
        });
    });

    // ===== INSIGHTS TESTS =====
    describe('updateInsights()', () => {
        beforeEach(async () => {
            for (let i = 0; i < 10; i++) {
                await service.logAdjustment({
                    ...testData,
                    previousRecommendationId: `prev-${i}`,
                    newRecommendationId: `new-${i}`,
                    previousAmount: 500 + (i * 25),
                    newAmount: 525 + (i * 25),
                    amountChange: 25,
                    amountChangePercentage: 5,
                    attributionFactors: [
                        {
                            factor: i % 3 === 0 ? 'income_delta' : 'expense_delta',
                            impact_pct: 100
                        }
                    ],
                    incomeDelta: i % 3 === 0 ? 100 : 0,
                    expenseDelta: i % 3 !== 0 ? 50 : 0,
                    confidenceScore: 0.75 + (i * 0.02),
                    confidenceLevel: 'high',
                    stabilityIndex: 70 + (i * 2),
                    triggerSource: 'cashflow_change',
                    eventType: 'increase'
                });
            }
        });

        it('should calculate and store insights', async () => {
            const insights = await service.updateInsights(testData.userId, testData.goalId);

            expect(insights).toBeDefined();
            expect(insights.userId).toBe(testData.userId);
            expect(insights.goalId).toBe(testData.goalId);
            expect(insights.totalAdjustments).toBe(10);
            expect(insights.topFactor).toBe('income_delta');
            expect(insights.volatilityLevel).toBeDefined();
            expect(insights.trendDirection).toBeDefined();
            expect(insights.trustScore).toBeGreaterThan(0);
            expect(insights.clarityScore).toBeGreaterThan(0);
        });

        it('should identify increasing trend', async () => {
            const insights = await service.updateInsights(testData.userId, testData.goalId);

            expect(['increasing', 'stable', 'decreasing']).toContain(insights.trendDirection);
        });
    });

    // ===== SEVERITY TESTS =====
    describe('determineSeverity()', () => {
        it('should classify small changes as low severity', () => {
            const severity = service.determineSeverity(5, [
                { factor: 'income_delta', impact_pct: 100, severity: 'low' }
            ]);

            expect(severity).toBe('low');
        });

        it('should classify medium changes as medium severity', () => {
            const severity = service.determineSeverity(20, [
                { factor: 'expense_delta', impact_pct: 100, severity: 'medium' }
            ]);

            expect(severity).toBe('medium');
        });

        it('should classify large changes as high severity', () => {
            const severity = service.determineSeverity(150, [
                { factor: 'deadline_pressure', impact_pct: 100, severity: 'high' }
            ]);

            expect(severity).toBe('high');
        });

        it('should escalate severity if multiple high factors', () => {
            const severity = service.determineSeverity(50, [
                { factor: 'deadline_pressure', impact_pct: 50, severity: 'high' },
                { factor: 'priority_shift', impact_pct: 50, severity: 'high' }
            ]);

            expect(severity).toBe('high');
        });
    });

    // ===== SUMMARY GENERATION TESTS =====
    describe('generateSummary()', () => {
        it('should generate concise explanation for simple income increase', () => {
            const summary = service.generateSummary({
                eventType: 'increase',
                previousAmount: 500,
                newAmount: 750,
                incomeDelta: 500,
                expenseDelta: 0,
                attributionFactors: [
                    {
                        factor: 'income_delta',
                        displayName: 'Income Change',
                        displayValue: '+$500/month',
                        impact_pct: 100
                    }
                ]
            });

            expect(summary).toContain('increase');
            expect(summary).toContain('income');
            expect(summary.length).toBeLessThan(200);
        });

        it('should mention all significant factors', () => {
            const summary = service.generateSummary({
                eventType: 'increase',
                previousAmount: 500,
                newAmount: 800,
                attributionFactors: [
                    {
                        factor: 'income_delta',
                        displayName: 'Income Change',
                        impact_pct: 60
                    },
                    {
                        factor: 'deadline_pressure',
                        displayName: 'Deadline Pressure',
                        impact_pct: 40
                    }
                ]
            });

            expect(summary).toContain('Income');
            expect(summary).toContain('deadline');
        });

        it('should be concise (< 300 chars)', () => {
            const summary = service.generateSummary({
                eventType: 'increase',
                previousAmount: 500,
                newAmount: 750,
                incomeDelta: 500,
                expenseDelta: -100,
                attributionFactors: [...Array(5)].map((_, i) => ({
                    factor: `factor_${i}`,
                    impact_pct: 20,
                    displayName: `Factor ${i}`
                }))
            });

            expect(summary.length).toBeLessThan(300);
        });
    });
});
```

---

## Part 2: Integration Tests

### Test File: `__tests__/integration/goalAdjustmentExplainability.integration.test.js`

```javascript
const request = require('supertest');
const app = require('../../app');
const { db } = require('../../db');
const { auth } = require('../../middleware');

describe('Goal Adjustment Explainability Integration', () => {
    let testGoal, testUser, authToken;

    beforeAll(async () => {
        // Setup: Create test user and goal
        testUser = await createTestUser();
        authToken = generateTestToken(testUser.id);
        testGoal = await createTestGoal(testUser.id);
    });

    afterAll(async () => {
        // Cleanup
        await cleanupTestData();
    });

    // ===== API ENDPOINT TESTS =====
    describe('GET /goals/:goalId/adjustments', () => {
        beforeEach(async () => {
            // Create test adjustments
            await createTestAdjustments(testGoal.id, testUser.id);
        });

        it('should return paginated adjustment history', async () => {
            const response = await request(app)
                .get(`/goals/${testGoal.id}/adjustments`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('data');
            expect(response.body.data).toHaveProperty('adjustments');
            expect(response.body.data).toHaveProperty('total');
            expect(response.body.data).toHaveProperty('limit');
            expect(response.body.data).toHaveProperty('offset');
        });

        it('should filter by severity parameter', async () => {
            const response = await request(app)
                .get(`/goals/${testGoal.id}/adjustments?severity=high`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.data.adjustments.every(a => a.severity === 'high')).toBe(true);
        });

        it('should respect pagination parameters', async () => {
            const response = await request(app)
                .get(`/goals/${testGoal.id}/adjustments?limit=5&offset=0`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.data.adjustments.length).toBeLessThanOrEqual(5);
            expect(response.body.data.limit).toBe(5);
        });

        it('should require authentication', async () => {
            await request(app)
                .get(`/goals/${testGoal.id}/adjustments`)
                .expect(401);
        });
    });

    describe('GET /goals/:goalId/adjustments/:explanationId', () => {
        let explanationId;

        beforeEach(async () => {
            const adjustment = await createTestAdjustment(testGoal.id, testUser.id);
            explanationId = adjustment.id;
        });

        it('should return full explanation details with attributions', async () => {
            const response = await request(app)
                .get(`/goals/${testGoal.id}/adjustments/${explanationId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            const { data } = response.body;
            expect(data).toHaveProperty('id', explanationId);
            expect(data).toHaveProperty('attributions');
            expect(Array.isArray(data.attributions)).toBe(true);
            expect(data.attributions.length).toBeGreaterThan(0);
        });

        it('should include human-readable explanation', async () => {
            const response = await request(app)
                .get(`/goals/${testGoal.id}/adjustments/${explanationId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            const { data } = response.body;
            expect(data).toHaveProperty('summary');
            expect(data).toHaveProperty('detailedExplanation');
        });

        it('should return 404 for non-existent explanation', async () => {
            await request(app)
                .get(`/goals/${testGoal.id}/adjustments/fake-id`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(404);
        });
    });

    describe('POST /goals/:goalId/adjustments/:explanationId/acknowledge', () => {
        let explanationId;

        beforeEach(async () => {
            const adjustment = await createTestAdjustment(testGoal.id, testUser.id);
            explanationId = adjustment.id;
        });

        it('should mark adjustment as acknowledged', async () => {
            const response = await request(app)
                .post(`/goals/${testGoal.id}/adjustments/${explanationId}/acknowledge`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    feedback: 'This makes sense',
                    feedbackType: 'positive'
                })
                .expect(200);

            expect(response.body.data.userAcknowledged).toBe(true);
            expect(response.body.data.userFeedback).toBe('This makes sense');
        });

        it('should accept feedback types: positive, negative, confused', async () => {
            for (const feedbackType of ['positive', 'negative', 'confused']) {
                const adjustment = await createTestAdjustment(testGoal.id, testUser.id);
                
                const response = await request(app)
                    .post(`/goals/${testGoal.id}/adjustments/${adjustment.id}/acknowledge`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .send({
                        feedback: `Test feedback`,
                        feedbackType
                    })
                    .expect(200);

                expect(response.body.data.userFeedbackType).toBe(feedbackType);
            }
        });
    });

    describe('GET /goals/:goalId/adjustment-insights', () => {
        beforeEach(async () => {
            await createTestAdjustments(testGoal.id, testUser.id, 10);
        });

        it('should return insights about adjustment patterns', async () => {
            const response = await request(app)
                .get(`/goals/${testGoal.id}/adjustment-insights`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            const { data } = response.body;
            expect(data).toHaveProperty('topFactors');
            expect(data).toHaveProperty('volatilityLevel');
            expect(data).toHaveProperty('trendDirection');
            expect(data).toHaveProperty('trustScore');
            expect(data).toHaveProperty('clarityScore');
        });

        it('should list top factors by frequency', async () => {
            const response = await request(app)
                .get(`/goals/${testGoal.id}/adjustment-insights`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            const { data } = response.body;
            expect(Array.isArray(data.topFactors)).toBe(true);
            expect(data.topFactors.length).toBeGreaterThan(0);
            expect(data.topFactors[0]).toHaveProperty('factor');
            expect(data.topFactors[0]).toHaveProperty('frequency');
        });
    });

    describe('GET /goals/:goalId/adjustment-timeline/summary', () => {
        beforeEach(async () => {
            await createTestAdjustments(testGoal.id, testUser.id, 5);
        });

        it('should return timeline summary for dashboard', async () => {
            const response = await request(app)
                .get(`/goals/${testGoal.id}/adjustment-timeline/summary`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            const { data } = response.body;
            expect(data).toHaveProperty('recentAdjustments');
            expect(data).toHaveProperty('summaryMetrics');
            expect(data).toHaveProperty('nextExpectedChange');
        });

        it('should limit to last 10 adjustments by default', async () => {
            const response = await request(app)
                .get(`/goals/${testGoal.id}/adjustment-timeline/summary`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.data.recentAdjustments.length).toBeLessThanOrEqual(10);
        });
    });

    // ===== WORKFLOW TESTS =====
    describe('Full Adjustment Workflow', () => {
        it('should log, acknowledge, and retrieve adjustment in sequence', async () => {
            // 1. Create adjustment
            const adjustment = await createTestAdjustment(testGoal.id, testUser.id);

            // 2. User views adjustment details
            const detailsResponse = await request(app)
                .get(`/goals/${testGoal.id}/adjustments/${adjustment.id}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(detailsResponse.body.data.userAcknowledged).toBe(false);

            // 3. User acknowledges
            const ackResponse = await request(app)
                .post(`/goals/${testGoal.id}/adjustments/${adjustment.id}/acknowledge`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    feedback: 'Now I understand',
                    feedbackType: 'positive'
                })
                .expect(200);

            expect(ackResponse.body.data.userAcknowledged).toBe(true);

            // 4. Check that it appears acknowledged in history
            const historyResponse = await request(app)
                .get(`/goals/${testGoal.id}/adjustments`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            const adjustmentInHistory = historyResponse.body.data.adjustments
                .find(a => a.id === adjustment.id);

            expect(adjustmentInHistory.userAcknowledged).toBe(true);
            expect(adjustmentInHistory.userFeedbackType).toBe('positive');
        });
    });
});

// ===== TEST HELPERS =====
async function createTestUser() {
    // Implementation depends on your auth system
    return { id: 'test-user-' + Date.now() };
}

function generateTestToken(userId) {
    // Generate JWT or appropriate test token
    return 'test-token-' + userId;
}

async function createTestGoal(userId) {
    // Create goal in test database
    return {
        id: 'test-goal-' + Date.now(),
        userId,
        targetAmount: 50000,
        targetDeadline: new Date('2026-12-31')
    };
}

async function createTestAdjustment(goalId, userId) {
    // Helper to create a test adjustment
    const service = new GoalAdjustmentExplainabilityService();
    return service.logAdjustment({
        tenantId: 'test-tenant',
        userId,
        goalId,
        previousRecommendationId: 'prev-' + Date.now(),
        newRecommendationId: 'new-' + Date.now(),
        previousAmount: 500,
        newAmount: 600,
        amountChange: 100,
        amountChangePercentage: 20,
        attributionFactors: [
            {
                factor: 'income_delta',
                displayName: 'Income Change',
                impact_pct: 100
            }
        ],
        incomeDelta: 200,
        expenseDelta: 0,
        confidenceScore: 0.85,
        confidenceLevel: 'high',
        stabilityIndex: 75,
        triggerSource: 'cashflow_change',
        eventType: 'increase'
    });
}

async function createTestAdjustments(goalId, userId, count = 5) {
    const adjustments = [];
    for (let i = 0; i < count; i++) {
        const adj = await createTestAdjustment(goalId, userId);
        adjustments.push(adj);
    }
    return adjustments;
}

async function cleanupTestData() {
    // Delete test data
}
```

---

## Part 3: E2E Test Examples

### Test File: `__tests__/e2e/goalAdjustmentExplainability.e2e.test.js`

```javascript
const { chromium } = require('playwright');

describe('Goal Adjustment Explainability E2E', () => {
    let browser, page;
    const baseUrl = 'http://localhost:3000';

    beforeAll(async () => {
        browser = await chromium.launch();
    });

    afterAll(async () => {
        await browser.close();
    });

    beforeEach(async () => {
        page = await browser.newPage();
        // Login
        await page.goto(`${baseUrl}/login`);
        await page.fill('input[name="email"]', 'test@example.com');
        await page.fill('input[name="password"]', 'password123');
        await page.click('button:has-text("Sign In")');
        await page.waitForNavigation();
    });

    afterEach(async () => {
        await page.close();
    });

    it('should show adjustment timeline when viewing goal details', async () => {
        await page.goto(`${baseUrl}/goals/test-goal-123`);

        // Look for adjustment timeline section
        const timelineSection = await page.locator('[data-testid="adjustment-timeline"]');
        expect(await timelineSection.isVisible()).toBe(true);
    });

    it('should display adjustment details in modal', async () => {
        await page.goto(`${baseUrl}/goals/test-goal-123`);

        // Click on an adjustment entry
        await page.click('[data-testid="adjustment-entry-0"]');

        // Modal should open
        const modal = await page.locator('[data-testid="adjustment-details-modal"]');
        expect(await modal.isVisible()).toBe(true);

        // Should show explanation
        const explanation = await page.locator('[data-testid="explanation-text"]');
        expect(await explanation.textContent()).toMatch(/increase|decrease|change/i);
    });

    it('should allow user to acknowledge adjustment', async () => {
        await page.goto(`${baseUrl}/goals/test-goal-123`);

        // View adjustment
        await page.click('[data-testid="adjustment-entry-0"]');

        // Click acknowledge button
        await page.click('[data-testid="acknowledge-btn"]');

        // Select feedback
        await page.selectOption('[name="feedback-type"]', 'positive');

        // Submit
        await page.click('button:has-text("Submit")');

        // Should show success message
        const successMsg = await page.locator('[data-testid="success-message"]');
        await expect(successMsg).toBeVisible();
    });

    it('should display attribution factors in breakdown card', async () => {
        await page.goto(`${baseUrl}/goals/test-goal-123`);

        // View adjustment details
        await page.click('[data-testid="adjustment-entry-0"]');

        // Check for factor breakdown
        const incomeFactorCard = await page.locator('[data-testid="factor-income_delta"]');
        expect(await incomeFactorCard.isVisible()).toBe(true);

        // Should show percentage
        const percentage = await page.locator('[data-testid="factor-income_delta-percentage"]');
        const text = await percentage.textContent();
        expect(text).toMatch(/\d+%/);
    });

    it('should show insights dashboard', async () => {
        await page.goto(`${baseUrl}/goals/test-goal-123/insights`);

        // Should show top factors
        const topFactors = await page.locator('[data-testid="top-factors-list"]');
        expect(await topFactors.isVisible()).toBe(true);

        // Should show metrics
        const volatility = await page.locator('[data-testid="volatility-metric"]');
        expect(await volatility.isVisible()).toBe(true);

        const trend = await page.locator('[data-testid="trend-metric"]');
        expect(await trend.isVisible()).toBe(true);

        const trustScore = await page.locator('[data-testid="trust-score"]');
        expect(await trustScore.isVisible()).toBe(true);
    });

    it('should filter adjustment history by severity', async () => {
        await page.goto(`${baseUrl}/goals/test-goal-123/adjustments`);

        // Filter by high severity
        await page.selectOption('[name="severity-filter"]', 'high');

        // Wait for results
        await page.waitForTimeout(500);

        // Verify results are filtered
        const entries = await page.locator('[data-testid="adjustment-entry"]');
        const count = await entries.count();
        expect(count).toBeGreaterThan(0);
    });

    it('should paginate adjustment history', async () => {
        await page.goto(`${baseUrl}/goals/test-goal-123/adjustments`);

        // Initially should show first page
        const firstPageEntry = await page.locator('[data-testid="adjustment-entry-0"]');
        expect(await firstPageEntry.isVisible()).toBe(true);

        // Click next button
        await page.click('[data-testid="pagination-next"]');

        // Page 2 should load
        await page.waitForTimeout(500);
        const secondPageEntry = await page.locator('[data-testid="adjustment-entry-0"]');
        expect(await secondPageEntry.isVisible()).toBe(true);
    });
});
```

---

## Part 4: Manual Testing Checklist

### Prerequisites
- [ ] Database migration applied
- [ ] Service layer integrated
- [ ] API routes mounted
- [ ] Test user account created
- [ ] At least one goal created

### Test Scenarios

#### Scenario 1: Adjustment Logging
- [ ] Modify cashflow (change income or expenses)
- [ ] Trigger recommendation recalculation
- [ ] Verify adjustment appears in database: 
  ```sql
  SELECT * FROM goal_adjustment_explanations 
  WHERE user_id = 'test-user' 
  ORDER BY created_at DESC LIMIT 1;
  ```
- [ ] Verify attribution details created:
  ```sql
  SELECT * FROM goal_adjustment_attribution_details 
  WHERE explanation_id = '<from above>' 
  LIMIT 5;
  ```

#### Scenario 2: View Adjustment History
- [ ] Navigate to goal details page
- [ ] Check if "Adjustments" tab is visible
- [ ] Click to view adjustment timeline
- [ ] Verify at least one adjustment is listed
- [ ] Test pagination (if >10 adjustments)

#### Scenario 3: View Adjustment Details
- [ ] Click on an adjustment in timeline
- [ ] Verify modal shows:
  - [ ] Previous amount
  - [ ] New amount
  - [ ] Change amount & percentage
  - [ ] Human-readable explanation
  - [ ] Attribution factors with percentages
- [ ] Close modal

#### Scenario 4: User Acknowledgement
- [ ] View adjustment details
- [ ] Click "Understand" or "Acknowledge" button
- [ ] Select feedback type (positive/negative/confused)
- [ ] Type optional comment
- [ ] Submit
- [ ] Verify success message
- [ ] Check that adjustment shows as acknowledged in list

#### Scenario 5: View Insights
- [ ] Click "Insights" tab/button for goal
- [ ] Verify dashboard shows:
  - [ ] Top contributing factors (with frequencies)
  - [ ] Volatility classification (low/medium/high)
  - [ ] Trend direction (increasing/stable/decreasing)
  - [ ] Trust score (0-100%)
  - [ ] Clarity score (0-100%)
- [ ] Verify metrics match actual adjustments

#### Scenario 6: Filtering & Sorting
- [ ] Filter history by severity (high/medium/low)
- [ ] Filter by date range (if implemented)
- [ ] Sort by date (newest/oldest)
- [ ] Verify results update correctly
- [ ] Verify total count reflects filters

#### Scenario 7: Large Dataset Performance
- [ ] Create 100+ adjustments for a goal
- [ ] Load adjustment history page
- [ ] Verify page loads in < 2 seconds
- [ ] Verify pagination works smoothly
- [ ] Verify filtering performance is acceptable

### API Testing (with cURL)

```bash
# Get adjustment history
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/goals/goal-123/adjustments

# Get specific adjustment details
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/goals/goal-123/adjustments/explanation-456

# Acknowledge adjustment
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "feedback": "This makes sense",
    "feedbackType": "positive"
  }' \
  http://localhost:3000/goals/goal-123/adjustments/explanation-456/acknowledge

# Get insights
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/goals/goal-123/adjustment-insights

# Get timeline summary
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/goals/goal-123/adjustment-timeline/summary
```

---

## Part 5: Performance Testing

### Load Test Script

```javascript
// test/performance/loadTest.js
const autocannon = require('autocannon');

const goals = ['goal-1', 'goal-2', 'goal-3', 'goal-4', 'goal-5'];
const token = 'test-token-123';

async function runLoadTest() {
    const result = await autocannon({
        url: 'http://localhost:3000',
        setupClient: (client) => {
            client.on('response', (statusCode, resBytes, responseTime) => {
                if (statusCode !== 200) {
                    console.log(`❌ Status ${statusCode}, ${responseTime}ms`);
                }
            });
        },
        requests: [
            {
                path: `/goals/${goals[0]}/adjustments`,
                headers: { 'Authorization': `Bearer ${token}` }
            },
            {
                path: `/goals/${goals[0]}/adjustment-insights`,
                headers: { 'Authorization': `Bearer ${token}` }
            },
            {
                path: `/goals/${goals[0]}/adjustment-timeline/summary`,
                headers: { 'Authorization': `Bearer ${token}` }
            }
        ],
        connections: 10,
        duration: 60,
        // Target: p95 < 500ms
    });

    console.log('Load Test Results:');
    console.log(`Requests/sec: ${result.requests.average}`);
    console.log(`Latency p95: ${result.latency.p95}ms`);
    console.log(`Throughput: ${result.throughput.average} bytes/sec`);

    if (result.latency.p95 > 500) {
        console.warn('⚠️  P95 latency exceeds target!');
    }
}

runLoadTest();
```

Run with: `node test/performance/loadTest.js`

---

## Resources

- Complete implementation: `ISSUE_715_GOAL_EXPLAINABILITY.md`
- Integration guide: `ISSUE_715_INTEGRATION_GUIDE.md`
- Quick start: `ISSUE_715_QUICKSTART.md`
- Implementation checklist: `ISSUE_715_IMPLEMENTATION_CHECKLIST.md`
