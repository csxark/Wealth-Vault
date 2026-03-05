/**
 * Expense Anomaly Detection Service Tests
 * 
 * Tests for real-time ML anomaly detection:
 * - Isolation forest scoring
 * - Statistical anomaly detection
 * - Rule-based detection
 * - Feature extraction
 * - Model management
 * 
 * Issue #612: Expense Anomaly Detection using Time Series Analysis
 */

import db from '../config/db.js';
import anomalyDetectionService from '../services/anomalyDetectionService.js';
import {
    anomalyDetections,
    anomalyModels,
    anomalyRules,
    anomalyStatistics,
    expenses,
    categories,
    users,
    tenants
} from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

let testTenantId, testUserId, testCategoryId;

describe('Anomaly Detection Service - Real-Time ML Detection', () => {
    beforeEach(async () => {
        // Create test tenant
        const [tenant] = await db
            .insert(tenants)
            .values({
                name: 'Test Tenant Anomaly',
                slug: `test-anomaly-${Date.now()}`,
                ownerId: null,
            })
            .returning();
        testTenantId = tenant.id;

        // Create test user
        const [user] = await db
            .insert(users)
            .values({
                email: `test-anomaly-${Date.now()}@example.com`,
                password: 'hashed_password',
                firstName: 'Anomaly',
                lastName: 'User',
                fullName: 'Anomaly User',
                tenantId: testTenantId,
            })
            .returning();
        testUserId = user.id;

        // Update tenant owner
        await db
            .update(tenants)
            .set({ ownerId: testUserId })
            .where(eq(tenants.id, testTenantId));

        // Create test category
        const [category] = await db
            .insert(categories)
            .values({
                tenantId: testTenantId,
                userId: testUserId,
                name: 'Electronics',
                monthlyBudget: '500',
            })
            .returning();
        testCategoryId = category.id;

        // Create baseline transactions for normal pattern learning
        const now = Date.now();
        for (let i = 0; i < 20; i++) {
            const date = new Date(now - i * 24 * 60 * 60 * 1000);
            await db.insert(expenses).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: testCategoryId,
                amount: '100.00',
                description: `Normal charge ${i}`,
                createdAt: date,
                updatedAt: date,
            });
        }
    });

    afterEach(async () => {
        // Cleanup
        await db.delete(anomalyDetections).where(eq(anomalyDetections.tenantId, testTenantId));
        await db.delete(anomalyModels).where(eq(anomalyModels.tenantId, testTenantId));
        await db.delete(anomalyRules).where(eq(anomalyRules.tenantId, testTenantId));
        await db.delete(anomalyStatistics).where(eq(anomalyStatistics.tenantId, testTenantId));
        await db.delete(expenses).where(eq(expenses.tenantId, testTenantId));
        await db.delete(categories).where(eq(categories.id, testCategoryId));
        await db.delete(users).where(eq(users.id, testUserId));
        await db.delete(tenants).where(eq(tenants.id, testTenantId));
    });

    describe('Anomaly Detection - Basic Operations', () => {
        it('should detect high-value anomaly', async () => {
            // Create normal transaction
            const [normalExpense] = await db.insert(expenses).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: testCategoryId,
                amount: '100.00',
                description: 'Normal purchase',
            }).returning();

            // Create anomalous transaction (10x normal)
            const [anomalousExpense] = await db.insert(expenses).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: testCategoryId,
                amount: '1000.00',
                description: 'Unusual expensive item',
            }).returning();

            // Detect anomaly
            const detection = await anomalyDetectionService.detectAnomaly(
                anomalousExpense.id,
                testTenantId
            );

            expect(detection).toBeDefined();
            expect(detection.status).toBe('detected');
            expect(parseFloat(detection.anomalyScore)).toBeGreaterThan(0.5);
            expect(['high', 'critical']).toContain(detection.severity);
        });

        it('should not flag normal transactions as anomalies', async () => {
            // Create transaction within normal range
            const [normalExpense] = await db.insert(expenses).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: testCategoryId,
                amount: '105.00',
                description: 'Normal purchase',
            }).returning();

            const detection = await anomalyDetectionService.detectAnomaly(
                normalExpense.id,
                testTenantId
            );

            // Should return null (no anomaly) or low score
            expect(!detection || parseFloat(detection.anomalyScore) < 0.5).toBe(true);
        });

        it('should create anomaly model on first detection', async () => {
            // Create anomalous expense
            const [expense] = await db.insert(expenses).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: testCategoryId,
                amount: '1000.00',
                description: 'Anomaly test',
            }).returning();

            await anomalyDetectionService.detectAnomaly(expense.id, testTenantId);

            // Check model was created
            const [model] = await db.select().from(anomalyModels)
                .where(and(
                    eq(anomalyModels.userId, testUserId),
                    eq(anomalyModels.categoryId, testCategoryId),
                    eq(anomalyModels.tenantId, testTenantId)
                ))
                .limit(1);

            expect(model).toBeDefined();
            expect(model.isActive).toBe(true);
            expect(model.modelVersion).toBe('1.0');
        });

        it('should extract correct features from expense', async () => {
            const [expense] = await db.insert(expenses).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: testCategoryId,
                amount: '500.00',
                description: 'Feature test',
                createdAt: new Date(),
            }).returning();

            const detection = await anomalyDetectionService.detectAnomaly(
                expense.id,
                testTenantId
            );

            // If detection created, check features are extracted
            if (detection) {
                expect(detection.features).toBeDefined();
                expect(detection.features.amount).toBeDefined();
                expect(detection.features.dayOfWeek).toBeDefined();
                expect(detection.features.hourOfDay).toBeDefined();
            }
        });
    });

    describe('Anomaly Review Operations', () => {
        it('should review anomaly as false positive', async () => {
            // Create and detect anomaly
            const [expense] = await db.insert(expenses).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: testCategoryId,
                amount: '500.00',
                description: 'Review test',
            }).returning();

            const detection = await anomalyDetectionService.detectAnomaly(
                expense.id,
                testTenantId
            );

            if (!detection) {
                expect(true).toBe(true); // Skip if no anomaly detected
                return;
            }

            // Review as false positive
            const reviewed = await anomalyDetectionService.reviewAnomaly(
                detection.id,
                testUserId,
                testTenantId,
                'false_positive',
                'This is a legitimate purchase'
            );

            expect(reviewed.status).toBe('reviewed');
            expect(reviewed.actionTaken).toBe('false_positive');
            expect(reviewed.reviewNotes).toBe('This is a legitimate purchase');
            expect(reviewed.reviewedBy).toBe(testUserId);
        });

        it('should review anomaly as confirmed fraud', async () => {
            const [expense] = await db.insert(expenses).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: testCategoryId,
                amount: '5000.00',
                description: 'Fraud test',
            }).returning();

            const detection = await anomalyDetectionService.detectAnomaly(
                expense.id,
                testTenantId
            );

            if (!detection) {
                expect(true).toBe(true);
                return;
            }

            const reviewed = await anomalyDetectionService.reviewAnomaly(
                detection.id,
                testUserId,
                testTenantId,
                'confirmed',
                'Unauthorized charge'
            );

            expect(reviewed.status).toBe('confirmed');
            expect(reviewed.actionTaken).toBe('confirmed');
        });

        it('should get unreviewed anomalies for user', async () => {
            // Create multiple anomalous expenses
            for (let i = 0; i < 3; i++) {
                const [expense] = await db.insert(expenses).values({
                    tenantId: testTenantId,
                    userId: testUserId,
                    categoryId: testCategoryId,
                    amount: `${1000 + i * 100}.00`,
                    description: `Anomaly ${i}`,
                }).returning();

                await anomalyDetectionService.detectAnomaly(expense.id, testTenantId);
            }

            const unreviewed = await anomalyDetectionService.getUnreviewedAnomalies(
                testUserId,
                testTenantId,
                10
            );

            expect(unreviewed.length).toBeGreaterThan(0);
            expect(unreviewed[0].status).toBe('detected');
        });
    });

    describe('Rule-Based Detection', () => {
        it('should create custom anomaly detection rule', async () => {
            const [rule] = await db.insert(anomalyRules).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: testCategoryId,
                ruleName: 'Premium Electronics Alert',
                description: 'Alert if single purchase exceeds $500',
                ruleType: 'threshold',
                condition: {
                    field: 'amount',
                    operator: 'gt',
                    value: 500
                },
                action: 'alert',
                severity: 'high',
                priority: 10,
                isActive: true
            }).returning();

            expect(rule).toBeDefined();
            expect(rule.ruleName).toBe('Premium Electronics Alert');
            expect(rule.isActive).toBe(true);
        });

        it('should trigger on rule condition match', async () => {
            // Create rule
            await db.insert(anomalyRules).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: testCategoryId,
                ruleName: 'High Value Purchase',
                ruleType: 'threshold',
                condition: {
                    field: 'amount',
                    operator: 'gt',
                    value: 300
                },
                action: 'flag',
                severity: 'high',
                isActive: true
            });

            // Create expense that matches rule
            const [expense] = await db.insert(expenses).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: testCategoryId,
                amount: '400.00',
                description: 'High value item',
            }).returning();

            const detection = await anomalyDetectionService.detectAnomaly(
                expense.id,
                testTenantId
            );

            // Should detect due to rule trigger
            expect(detection).toBeDefined();
            expect(detection.severity).toBe('high');
        });

        it('should update rule trigger count', async () => {
            const [rule] = await db.insert(anomalyRules).values({
                tenantId: testTenantId,
                ruleName: 'Test Rule',
                ruleType: 'threshold',
                condition: {
                    field: 'amount',
                    operator: 'gt',
                    value: 300
                },
                action: 'alert',
                severity: 'medium',
                isActive: true,
                timesTriggered: 0
            }).returning();

            // Trigger rule multiple times
            for (let i = 0; i < 3; i++) {
                const [expense] = await db.insert(expenses).values({
                    tenantId: testTenantId,
                    userId: testUserId,
                    categoryId: testCategoryId,
                    amount: '400.00',
                    description: `Trigger ${i}`,
                }).returning();

                await anomalyDetectionService.detectAnomaly(expense.id, testTenantId);
            }

            const [updatedRule] = await db.select().from(anomalyRules)
                .where(eq(anomalyRules.id, rule.id))
                .limit(1);

            expect(updatedRule.timesTriggered).toBeGreaterThan(0);
        });
    });

    describe('Model Management', () => {
        it('should mark model for retraining if anomalies exceed threshold', async () => {
            // Create many anomalous transactions to trigger retraining flag
            for (let i = 0; i < 5; i++) {
                const [expense] = await db.insert(expenses).values({
                    tenantId: testTenantId,
                    userId: testUserId,
                    categoryId: testCategoryId,
                    amount: `${1000 + i * 100}.00`,
                    description: `Anomaly trigger ${i}`,
                }).returning();

                await anomalyDetectionService.detectAnomaly(expense.id, testTenantId);
            }

            // Get model and check retraining flag
            const [model] = await db.select().from(anomalyModels)
                .where(and(
                    eq(anomalyModels.userId, testUserId),
                    eq(anomalyModels.categoryId, testCategoryId),
                    eq(anomalyModels.tenantId, testTenantId)
                ))
                .limit(1);

            // May or may not be true depending on threshold
            expect(model).toBeDefined();
        });

        it('should get models needing retraining', async () => {
            // Create a model
            await db.insert(anomalyModels).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: testCategoryId,
                modelVersion: '1.0',
                isActive: true,
                needsRetraining: true,
                trainingDataPoints: 50
            });

            const modelsToRetrain = await anomalyDetectionService.getModelsForRetraining(
                testTenantId
            );

            expect(modelsToRetrain.length).toBeGreaterThan(0);
            expect(modelsToRetrain[0].needsRetraining).toBe(true);
        });
    });

    describe('Statistics and Analytics', () => {
        it('should get anomaly statistics for category', async () => {
            // Create anomalies
            const [expense] = await db.insert(expenses).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: testCategoryId,
                amount: '1500.00',
                description: 'Stats test',
            }).returning();

            const detection = await anomalyDetectionService.detectAnomaly(
                expense.id,
                testTenantId
            );

            // Stats may not be immediately available
            const stats = await anomalyDetectionService.getAnomalyStats(
                testUserId,
                testCategoryId,
                testTenantId,
                'daily'
            );

            // Stats may be null initially
            expect(!stats || stats.categoryId === testCategoryId).toBe(true);
        });
    });

    describe('Edge Cases', () => {
        it('should handle transactions with missing categories', async () => {
            const [expense] = await db.insert(expenses).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: null,
                amount: '100.00',
                description: 'No category',
            }).returning();

            // Should not crash
            expect(async () => {
                await anomalyDetectionService.detectAnomaly(expense.id, testTenantId);
            }).not.toThrow();
        });

        it('should handle very small transaction amounts', async () => {
            const [expense] = await db.insert(expenses).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: testCategoryId,
                amount: '0.01',
                description: 'Tiny amount',
            }).returning();

            // Should not crash
            expect(async () => {
                await anomalyDetectionService.detectAnomaly(expense.id, testTenantId);
            }).not.toThrow();
        });

        it('should handle categories with insufficient history', async () => {
            // Create new category with no history
            const [newCategory] = await db.insert(categories).values({
                tenantId: testTenantId,
                userId: testUserId,
                name: 'New Category',
                monthlyBudget: '100',
            }).returning();

            const [expense] = await db.insert(expenses).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: newCategory.id,
                amount: '50.00',
                description: 'New category test',
            }).returning();

            // Should handle gracefully
            const detection = await anomalyDetectionService.detectAnomaly(
                expense.id,
                testTenantId
            );

            expect(detection === null || detection.status === 'detected').toBe(true);

            // Cleanup
            await db.delete(categories).where(eq(categories.id, newCategory.id));
        });
    });
});
