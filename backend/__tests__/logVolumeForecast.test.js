// backend/__tests__/logVolumeForecast.test.js
// Issue #649: Log Volume Forecasting Tests

import { jest } from '@jest/globals';
import {
    generateLogVolumeForecast,
    getTenantForecast,
    clearTenantForecastCache,
    getAllTenantsForecastSummary,
    calculateCapacityNeeds,
    prepareDashboardData,
    MODEL_TYPES,
    FORECAST_HORIZON_DAYS,
    MIN_DATA_POINTS
} from '../services/logVolumeForecastService.js';
import { db } from '../config/database.js';
import { redis } from '../config/redis.js';

// Mock dependencies
jest.mock('../config/database.js');
jest.mock('../config/redis.js');
jest.mock('../utils/logger.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
    }
}));

describe('Log Volume Forecast Service', () => {
    const mockTenantId = '550e8400-e29b-41d4-a716-446655440000';
    const mockUserId = '660e8400-e29b-41d4-a716-446655440001';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('generateLogVolumeForecast', () => {
        it('should generate forecast with valid historical data', async () => {
            // Mock historical data
            const mockHistoricalData = Array.from({ length: 100 }, (_, i) => ({
                date: new Date(Date.now() - (100 - i) * 24 * 60 * 60 * 1000),
                totalRecords: 1000 + i * 10,
                totalSizeBytes: 1000000 + i * 10000
            }));

            db.select.mockReturnValue({
                from: jest.fn().mockReturnValue({
                    where: jest.fn().mockReturnValue({
                        orderBy: jest.fn().mockResolvedValue(mockHistoricalData)
                    })
                })
            });

            db.insert.mockReturnValue({
                values: jest.fn().mockReturnValue({
                    returning: jest.fn().mockResolvedValue([{
                        id: 'forecast-id',
                        predictions: [],
                        capacityPlanning: {},
                        dashboard: {}
                    }])
                })
            });

            const result = await generateLogVolumeForecast(mockTenantId, {
                historical_days: 90,
                force_refresh: false
            });

            expect(result).toHaveProperty('predictions');
            expect(result).toHaveProperty('capacityPlanning');
            expect(result).toHaveProperty('dashboard');
            expect(result.forecast_horizon_days).toBe(FORECAST_HORIZON_DAYS);
        });

        it('should throw error with insufficient historical data', async () => {
            const mockHistoricalData = Array.from({ length: 10 }, (_, i) => ({
                date: new Date(Date.now() - (10 - i) * 24 * 60 * 60 * 1000),
                totalRecords: 1000 + i * 10,
                totalSizeBytes: 1000000 + i * 10000
            }));

            db.select.mockReturnValue({
                from: jest.fn().mockReturnValue({
                    where: jest.fn().mockReturnValue({
                        orderBy: jest.fn().mockResolvedValue(mockHistoricalData)
                    })
                })
            });

            await expect(generateLogVolumeForecast(mockTenantId))
                .rejects
                .toThrow(`Insufficient historical data. Need at least ${MIN_DATA_POINTS} days`);
        });

        it('should handle different model types', async () => {
            const mockHistoricalData = Array.from({ length: 100 }, (_, i) => ({
                date: new Date(Date.now() - (100 - i) * 24 * 60 * 60 * 1000),
                totalRecords: 1000 + i * 10,
                totalSizeBytes: 1000000 + i * 10000
            }));

            db.select.mockReturnValue({
                from: jest.fn().mockReturnValue({
                    where: jest.fn().mockReturnValue({
                        orderBy: jest.fn().mockResolvedValue(mockHistoricalData)
                    })
                })
            });

            db.insert.mockReturnValue({
                values: jest.fn().mockReturnValue({
                    returning: jest.fn().mockResolvedValue([{
                        id: 'forecast-id',
                        predictions: [],
                        capacityPlanning: {},
                        dashboard: {}
                    }])
                })
            });

            for (const modelType of Object.values(MODEL_TYPES)) {
                const result = await generateLogVolumeForecast(mockTenantId, {
                    model_type: modelType
                });
                expect(result.model_type).toBe(modelType);
            }
        });
    });

    describe('calculateCapacityNeeds', () => {
        it('should calculate capacity needs correctly', () => {
            const predictions = [
                { date: '2024-01-01', volume: 1000, size_bytes: 1000000 },
                { date: '2024-01-02', volume: 1100, size_bytes: 1100000 }
            ];

            const currentStorage = {
                total_bytes: 10000000,
                used_bytes: 5000000
            };

            const result = calculateCapacityNeeds(predictions, currentStorage);

            expect(result).toHaveProperty('current_usage_percent');
            expect(result).toHaveProperty('predicted_usage_percent');
            expect(result).toHaveProperty('recommended_scaling');
            expect(result).toHaveProperty('time_to_capacity');
        });

        it('should recommend scaling when capacity is critical', () => {
            const predictions = [
                { date: '2024-01-01', volume: 1000, size_bytes: 9500000 }
            ];

            const currentStorage = {
                total_bytes: 10000000,
                used_bytes: 9500000
            };

            const result = calculateCapacityNeeds(predictions, currentStorage);

            expect(result.recommended_scaling).toBeDefined();
            expect(result.time_to_capacity).toBeLessThan(7); // Less than a week
        });
    });

    describe('prepareDashboardData', () => {
        it('should prepare dashboard data with charts and metrics', () => {
            const predictions = Array.from({ length: 30 }, (_, i) => ({
                date: `2024-01-${String(i + 1).padStart(2, '0')}`,
                volume: 1000 + i * 50,
                size_bytes: 1000000 + i * 50000,
                growth_rate: 0.05
            }));

            const capacityPlanning = {
                current_usage_percent: 0.6,
                predicted_usage_percent: 0.8,
                time_to_capacity: 45
            };

            const result = prepareDashboardData(predictions, capacityPlanning);

            expect(result).toHaveProperty('charts');
            expect(result).toHaveProperty('metrics');
            expect(result).toHaveProperty('alerts');
            expect(result.charts).toHaveProperty('volume_trend');
            expect(result.charts).toHaveProperty('growth_rate');
            expect(result.metrics).toHaveProperty('avg_daily_growth');
            expect(result.metrics).toHaveProperty('predicted_peak_volume');
        });
    });

    describe('getTenantForecast', () => {
        it('should return cached forecast if available', async () => {
            const mockForecast = {
                id: 'forecast-id',
                predictions: [],
                capacityPlanning: {},
                dashboard: {},
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // Not expired
            };

            db.select.mockReturnValue({
                from: jest.fn().mockReturnValue({
                    where: jest.fn().mockReturnValue({
                        orderBy: jest.fn().mockResolvedValue([mockForecast])
                    })
                })
            });

            const result = await getTenantForecast(mockTenantId);

            expect(result).toEqual(mockForecast);
        });

        it('should return null if no forecast exists', async () => {
            db.select.mockReturnValue({
                from: jest.fn().mockReturnValue({
                    where: jest.fn().mockReturnValue({
                        orderBy: jest.fn().mockResolvedValue([])
                    })
                })
            });

            const result = await getTenantForecast(mockTenantId);

            expect(result).toBeNull();
        });
    });

    describe('clearTenantForecastCache', () => {
        it('should clear forecast cache successfully', async () => {
            redis.del.mockResolvedValue(1);

            await expect(clearTenantForecastCache(mockTenantId))
                .resolves
                .not
                .toThrow();
        });
    });

    describe('getAllTenantsForecastSummary', () => {
        it('should return summary for all tenants', async () => {
            const mockTenants = [
                { id: 'tenant-1', name: 'Tenant 1' },
                { id: 'tenant-2', name: 'Tenant 2' }
            ];

            const mockForecasts = [
                { tenant_id: 'tenant-1', predictions: [], capacityPlanning: {} },
                { tenant_id: 'tenant-2', predictions: [], capacityPlanning: {} }
            ];

            db.select.mockReturnValueOnce({
                from: jest.fn().mockReturnValue({
                    select: jest.fn().mockResolvedValue(mockTenants)
                })
            });

            db.select.mockReturnValueOnce({
                from: jest.fn().mockReturnValue({
                    where: jest.fn().mockReturnValue({
                        orderBy: jest.fn().mockResolvedValue([mockForecasts[0]])
                    })
                })
            });

            db.select.mockReturnValueOnce({
                from: jest.fn().mockReturnValue({
                    where: jest.fn().mockReturnValue({
                        orderBy: jest.fn().mockResolvedValue([mockForecasts[1]])
                    })
                })
            });

            const result = await getAllTenantsForecastSummary();

            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(2);
        });
    });
});