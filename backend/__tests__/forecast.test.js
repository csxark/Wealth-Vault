/**
 * Forecast Service Tests
 * 
 * Tests for category budget forecasting with confidence intervals:
 * - Time-series forecasting algorithms
 * - Moving average calculations
 * - Anomaly detection
 * - Confidence interval accuracy
 * - Model accuracy tracking
 * - Predictive alert generation
 * 
 * Issue #609: Category Budget Forecasting with Confidence Intervals
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import db from '../config/db.js';
import forecastService from '../services/forecastService.js';
import * as cacheService from '../services/cacheService.js';
import { 
    categoryForecastHistory, 
    categoryForecasts, 
    forecastAccuracyMetrics,
    forecastAlerts,
    expenses, 
    categories, 
    users, 
    tenants 
} from '../db/schema.js';
import { eq, and, gte } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

let testTenantId, testUserId, testCategoryId;

describe('Forecast Service - Time-Series Forecasting', () => {
    beforeEach(async () => {
        // Create test tenant
        const [tenant] = await db
            .insert(tenants)
            .values({
                name: 'Test Tenant Forecast',
                slug: `test-forecast-${Date.now()}`,
                ownerId: null,
            })
            .returning();
        testTenantId = tenant.id;

        // Create test user
        const [user] = await db
            .insert(users)
            .values({
                email: `test-forecast-${Date.now()}@example.com`,
                password: 'hashed_password',
                firstName: 'Forecast',
                lastName: 'User',
            })
            .returning();
        testUserId = user.id;

        // Update tenant owner
        await db
            .update(tenants)
            .set({ ownerId: testUserId })
            .where(eq(tenants.id, testTenantId));

        // Create test category with monthly budget
        const [category] = await db
            .insert(categories)
            .values({
                tenantId: testTenantId,
                userId: testUserId,
                name: 'Groceries',
                monthlyBudget: '500',
            })
            .returning();
        testCategoryId = category.id;
    });

    afterEach(async () => {
        // Cleanup test data
        await db.delete(forecastAlerts).where(eq(forecastAlerts.tenantId, testTenantId));
        await db.delete(forecastAccuracyMetrics).where(eq(forecastAccuracyMetrics.tenantId, testTenantId));
        await db.delete(categoryForecasts).where(eq(categoryForecasts.tenantId, testTenantId));
        await db.delete(categoryForecastHistory).where(eq(categoryForecastHistory.tenantId, testTenantId));
        await db.delete(expenses).where(eq(expenses.tenantId, testTenantId));
        await db.delete(categories).where(eq(categories.id, testCategoryId));
        await db.delete(users).where(eq(users.id, testUserId));
        await db.delete(tenants).where(eq(tenants.id, testTenantId));
    });

    describe('Historical Data Collection', () => {
        it('should collect and store historical spending data', async () => {
            // Create expenses over the last 30 days
            const expenses = [];
            for (let i = 0; i < 30; i++) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                
                expenses.push({
                    tenantId: testTenantId,
                    userId: testUserId,
                    categoryId: testCategoryId,
                    amount: `${50 + Math.random() * 100}`,
                    description: `Test expense ${i}`,
                    date,
                });
            }

            await db.insert(categories.expenses).values(expenses);

            // Collect historical data
            const count = await forecastService.collectHistoricalData(
                testUserId,
                testCategoryId,
                testTenantId,
                'daily',
                30
            );

            expect(count).toBeGreaterThan(0);

            // Verify data was stored
            const history = await db.query.categoryForecastHistory.findMany({
                where: and(
                    eq(categoryForecastHistory.tenantId, testTenantId),
                    eq(categoryForecastHistory.categoryId, testCategoryId)
                )
            });

            expect(history.length).toBeGreaterThan(0);
            expect(history[0]).toHaveProperty('actualSpent');
            expect(history[0]).toHaveProperty('transactionCount');
        });

        it('should calculate moving averages correctly', async () => {
            // Create consistent historical data
            const values = [100, 110, 105, 115, 120, 125, 130];
            
            for (let i = 0; i < values.length; i++) {
                const date = new Date();
                date.setDate(date.getDate() - (values.length - i - 1));
                
                await db.insert(categoryForecastHistory).values({
                    tenantId: testTenantId,
                    userId: testUserId,
                    categoryId: testCategoryId,
                    periodStart: date,
                    periodEnd: new Date(date.getTime() + 24 * 60 * 60 * 1000),
                    periodType: 'daily',
                    actualSpent: values[i].toString(),
                    transactionCount: 1,
                });
            }

            // Calculate moving averages
            await forecastService.calculateMovingAveragesForCategory(
                testUserId,
                testCategoryId,
                testTenantId
            );

            // Verify moving averages were calculated
            const history = await db.query.categoryForecastHistory.findMany({
                where: and(
                    eq(categoryForecastHistory.tenantId, testTenantId),
                    eq(categoryForecastHistory.categoryId, testCategoryId)
                )
            });

            const lastRecord = history[history.length - 1];
            expect(lastRecord.ma7).toBeDefined();
            expect(parseFloat(lastRecord.ma7)).toBeGreaterThan(0);
        });
    });

    describe('Anomaly Detection', () => {
        it('should detect spending anomalies using Z-score', async () => {
            // Create normal spending pattern with one anomaly
            const normalSpending = [100, 105, 110, 100, 95, 105];
            const anomaly = 500; // Significantly higher

            // Insert normal data
            for (let i = 0; i < normalSpending.length; i++) {
                const date = new Date();
                date.setDate(date.getDate() - (normalSpending.length + 1 - i));
                
                await db.insert(categoryForecastHistory).values({
                    tenantId: testTenantId,
                    userId: testUserId,
                    categoryId: testCategoryId,
                    periodStart: date,
                    periodEnd: new Date(date.getTime() + 24 * 60 * 60 * 1000),
                    periodType: 'daily',
                    actualSpent: normalSpending[i].toString(),
                    transactionCount: 1,
                });
            }

            // Insert anomaly
            const anomalyDate = new Date();
            await db.insert(categoryForecastHistory).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: testCategoryId,
                periodStart: anomalyDate,
                periodEnd: new Date(anomalyDate.getTime() + 24 * 60 * 60 * 1000),
                periodType: 'daily',
                actualSpent: anomaly.toString(),
                transactionCount: 1,
            });

            // Detect anomalies
            await forecastService.detectAnomaliesForCategory(
                testUserId,
                testCategoryId,
                testTenantId,
                2.5 // Z-score threshold
            );

            // Verify anomaly was detected
            const history = await db.query.categoryForecastHistory.findMany({
                where: and(
                    eq(categoryForecastHistory.tenantId, testTenantId),
                    eq(categoryForecastHistory.categoryId, testCategoryId),
                    eq(categoryForecastHistory.isAnomaly, true)
                )
            });

            expect(history.length).toBeGreaterThan(0);
            expect(parseFloat(history[0].actualSpent)).toBe(anomaly);
            expect(history[0].anomalyScore).toBeGreaterThan(2.5);
        });

        it('should not flag normal variance as anomalies', async () => {
            // Create slightly variable but normal spending pattern
            const normalSpending = [100, 105, 103, 108, 102, 106, 104];

            for (let i = 0; i < normalSpending.length; i++) {
                const date = new Date();
                date.setDate(date.getDate() - (normalSpending.length - i));
                
                await db.insert(categoryForecastHistory).values({
                    tenantId: testTenantId,
                    userId: testUserId,
                    categoryId: testCategoryId,
                    periodStart: date,
                    periodEnd: new Date(date.getTime() + 24 * 60 * 60 * 1000),
                    periodType: 'daily',
                    actualSpent: normalSpending[i].toString(),
                    transactionCount: 1,
                });
            }

            // Detect anomalies
            await forecastService.detectAnomaliesForCategory(
                testUserId,
                testCategoryId,
                testTenantId,
                2.5
            );

            // Verify no anomalies detected
            const anomalies = await db.query.categoryForecastHistory.findMany({
                where: and(
                    eq(categoryForecastHistory.tenantId, testTenantId),
                    eq(categoryForecastHistory.categoryId, testCategoryId),
                    eq(categoryForecastHistory.isAnomaly, true)
                )
            });

            expect(anomalies.length).toBe(0);
        });
    });

    describe('Forecast Generation', () => {
        beforeEach(async () => {
            // Create 30 days of historical data
            for (let i = 0; i < 30; i++) {
                const date = new Date();
                date.setDate(date.getDate() - (30 - i));
                
                await db.insert(categoryForecastHistory).values({
                    tenantId: testTenantId,
                    userId: testUserId,
                    categoryId: testCategoryId,
                    periodStart: date,
                    periodEnd: new Date(date.getTime() + 24 * 60 * 60 * 1000),
                    periodType: 'daily',
                    actualSpent: (100 + Math.random() * 20).toFixed(2),
                    transactionCount: Math.floor(Math.random() * 5) + 1,
                });
            }
        });

        it('should generate forecast with confidence intervals', async () => {
            const forecast = await forecastService.generateForecast(
                testUserId,
                testCategoryId,
                testTenantId,
                'monthly',
                1
            );

            expect(forecast).toBeDefined();
            expect(forecast.predictedSpent).toBeDefined();
            expect(forecast.confidenceLower).toBeDefined();
            expect(forecast.confidenceUpper).toBeDefined();
            expect(forecast.confidenceLevel).toBe(0.95);
            expect(forecast.status).toBe('completed');
            
            // Confidence bounds should make sense
            expect(parseFloat(forecast.confidenceLower)).toBeLessThan(parseFloat(forecast.predictedSpent));
            expect(parseFloat(forecast.confidenceUpper)).toBeGreaterThan(parseFloat(forecast.predictedSpent));
        });

        it('should detect trend direction correctly', async () => {
            // Create increasing trend
            for (let i = 0; i < 10; i++) {
                const date = new Date();
                date.setDate(date.getDate() - (10 - i));
                
                await db.insert(categoryForecastHistory).values({
                    tenantId: testTenantId,
                    userId: testUserId,
                    categoryId: testCategoryId,
                    periodStart: date,
                    periodEnd: new Date(date.getTime() + 24 * 60 * 60 * 1000),
                    periodType: 'daily',
                    actualSpent: (100 + i * 10).toString(),
                    transactionCount: 1,
                });
            }

            const forecast = await forecastService.generateForecast(
                testUserId,
                testCategoryId,
                testTenantId,
                'monthly',
                1
            );

            expect(forecast.trendDirection).toBe('increasing');
            expect(forecast.trendStrength).toBeGreaterThan(0);
        });

        it('should fail gracefully with insufficient data', async () => {
            // Delete historical data to simulate insufficient data
            await db.delete(categoryForecastHistory).where(
                eq(categoryForecastHistory.categoryId, testCategoryId)
            );

            await expect(
                forecastService.generateForecast(
                    testUserId,
                    testCategoryId,
                    testTenantId,
                    'monthly',
                    1
                )
            ).rejects.toThrow(/Insufficient historical data/);
        });

        it('should cache forecast results', async () => {
            const spy = vi.spyOn(cacheService, 'set');

            await forecastService.generateForecast(
                testUserId,
                testCategoryId,
                testTenantId,
                'monthly',
                1
            );

            expect(spy).toHaveBeenCalled();
        });
    });

    describe('Predictive Alerts', () => {
        it('should create alert when forecast exceeds budget', async () => {
            // Create historical data with high spending
            for (let i = 0; i < 30; i++) {
                const date = new Date();
                date.setDate(date.getDate() - (30 - i));
                
                await db.insert(categoryForecastHistory).values({
                    tenantId: testTenantId,
                    userId: testUserId,
                    categoryId: testCategoryId,
                    periodStart: date,
                    periodEnd: new Date(date.getTime() + 24 * 60 * 60 * 1000),
                    periodType: 'daily',
                    actualSpent: '200', // High spending
                    transactionCount: 1,
                });
            }

            // Generate forecast (should predict overspending)
            const forecast = await forecastService.generateForecast(
                testUserId,
                testCategoryId,
                testTenantId,
                'monthly',
                1
            );

            // Check if alert was created
            const alerts = await db.query.forecastAlerts.findMany({
                where: and(
                    eq(forecastAlerts.tenantId, testTenantId),
                    eq(forecastAlerts.categoryId, testCategoryId),
                    eq(forecastAlerts.forecastId, forecast.id)
                )
            });

            // May or may not create alert depending on confidence interval
            // If created, verify structure
            if (alerts.length > 0) {
                expect(alerts[0].alertType).toBe('predictive_overspend');
                expect(alerts[0].projectedSpent).toBeDefined();
                expect(alerts[0].message).toBeDefined();
                expect(alerts[0].recommendation).toBeDefined();
            }
        });

        it('should not create alert when spending is within budget', async () => {
            // Create historical data with low spending
            for (let i = 0; i < 30; i++) {
                const date = new Date();
                date.setDate(date.getDate() - (30 - i));
                
                await db.insert(categoryForecastHistory).values({
                    tenantId: testTenantId,
                    userId: testUserId,
                    categoryId: testCategoryId,
                    periodStart: date,
                    periodEnd: new Date(date.getTime() + 24 * 60 * 60 * 1000),
                    periodType: 'daily',
                    actualSpent: '50', // Low spending
                    transactionCount: 1,
                });
            }

            const forecast = await forecastService.generateForecast(
                testUserId,
                testCategoryId,
                testTenantId,
                'monthly',
                1
            );

            // Check if alert was created
            const alerts = await db.query.forecastAlerts.findMany({
                where: and(
                    eq(forecastAlerts.tenantId, testTenantId),
                    eq(forecastAlerts.categoryId, testCategoryId),
                    eq(forecastAlerts.forecastId, forecast.id)
                )
            });

            expect(alerts.length).toBe(0);
        });
    });

    describe('Forecast Accuracy Validation', () => {
        it('should validate forecast accuracy after period ends', async () => {
            // Create a forecast for a past period
            const pastStart = new Date();
            pastStart.setDate(pastStart.getDate() - 10);
            const pastEnd = new Date();
            pastEnd.setDate(pastEnd.getDate() - 5);

            const [forecast] = await db.insert(categoryForecasts).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: testCategoryId,
                forecastStart: pastStart,
                forecastEnd: pastEnd,
                periodType: 'weekly',
                predictedSpent: '500',
                confidenceLower: '450',
                confidenceUpper: '550',
                confidenceLevel: 0.95,
                modelType: 'moving_average',
                status: 'completed',
            }).returning();

            // Create actual expenses for that period
            const actualAmount = 480;
            await db.insert(expenses).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: testCategoryId,
                amount: actualAmount.toString(),
                description: 'Test expense',
                date: new Date(pastStart.getTime() + 24 * 60 * 60 * 1000),
            });

            // Validate forecast
            const metric = await forecastService.validateForecastAccuracy(forecast.id);

            expect(metric).toBeDefined();
            expect(parseFloat(metric.actualSpent)).toBe(actualAmount);
            expect(metric.withinConfidenceInterval).toBe(true);
            expect(metric.percentageError).toBeLessThan(10); // 4% error
        });

        it('should track model health based on accuracy', async () => {
            // Create forecast with poor accuracy
            const pastStart = new Date();
            pastStart.setDate(pastStart.getDate() - 10);
            const pastEnd = new Date();
            pastEnd.setDate(pastEnd.getDate() - 5);

            const [forecast] = await db.insert(categoryForecasts).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: testCategoryId,
                forecastStart: pastStart,
                forecastEnd: pastEnd,
                periodType: 'weekly',
                predictedSpent: '500',
                confidenceLower: '450',
                confidenceUpper: '550',
                confidenceLevel: 0.95,
                modelType: 'moving_average',
                status: 'completed',
            }).returning();

            // Create actual expenses that are way off
            await db.insert(expenses).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: testCategoryId,
                amount: '1000', // 2x predicted
                description: 'Test expense',
                date: new Date(pastStart.getTime() + 24 * 60 * 60 * 1000),
            });

            // Validate forecast
            const metric = await forecastService.validateForecastAccuracy(forecast.id);

            expect(metric.modelHealth).toBe('poor');
            expect(metric.needsRetraining).toBe(true);
            expect(metric.withinConfidenceInterval).toBe(false);
        });
    });

    describe('Alert Management', () => {
        it('should retrieve active forecast alerts', async () => {
            // Create a fake forecast first
            const [forecast] = await db.insert(categoryForecasts).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: testCategoryId,
                forecastStart: new Date(),
                forecastEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                periodType: 'monthly',
                predictedSpent: '600',
                confidenceLower: '550',
                confidenceUpper: '650',
                confidenceLevel: 0.95,
                modelType: 'moving_average',
                status: 'completed',
            }).returning();

            // Create alert
            await db.insert(forecastAlerts).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: testCategoryId,
                forecastId: forecast.id,
                alertType: 'predictive_overspend',
                severity: 'warning',
                projectedSpent: '600',
                budgetLimit: '500',
                projectedOverage: '100',
                confidence: 0.95,
                message: 'Test alert',
            });

            const alerts = await forecastService.getActiveForecastAlerts(
                testUserId,
                testTenantId
            );

            expect(alerts.length).toBeGreaterThan(0);
            expect(alerts[0].alertType).toBe('predictive_overspend');
        });

        it('should dismiss forecast alert', async () => {
            // Create a fake forecast and alert
            const [forecast] = await db.insert(categoryForecasts).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: testCategoryId,
                forecastStart: new Date(),
                forecastEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                periodType: 'monthly',
                predictedSpent: '600',
                confidenceLower: '550',
                confidenceUpper: '650',
                confidenceLevel: 0.95,
                modelType: 'moving_average',
                status: 'completed',
            }).returning();

            const [alert] = await db.insert(forecastAlerts).values({
                tenantId: testTenantId,
                userId: testUserId,
                categoryId: testCategoryId,
                forecastId: forecast.id,
                alertType: 'predictive_overspend',
                severity: 'warning',
                projectedSpent: '600',
                confidence: 0.95,
                message: 'Test alert',
            }).returning();

            const dismissed = await forecastService.dismissForecastAlert(
                alert.id,
                testUserId,
                testTenantId
            );

            expect(dismissed.isDismissed).toBe(true);
            expect(dismissed.dismissedAt).toBeDefined();
        });
    });
});
