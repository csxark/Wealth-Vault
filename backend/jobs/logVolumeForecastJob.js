// backend/jobs/logVolumeForecastJob.js
// Issue #649: Log Volume Forecasting Background Job

import { logger } from '../utils/logger.js';
import { generateLogVolumeForecast, getAllTenants } from '../services/logVolumeForecastService.js';
import { sendCapacityAlert } from '../services/notificationService.js';
import { redis } from '../config/redis.js';

class LogVolumeForecastJob {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
        this.jobName = 'log-volume-forecast';
        this.scheduleInterval = 60 * 60 * 1000; // 1 hour
        this.alertThresholds = {
            storage_warning: 0.85, // 85% capacity
            storage_critical: 0.95, // 95% capacity
            growth_rate_warning: 0.1, // 10% daily growth rate
            growth_rate_critical: 0.2  // 20% daily growth rate
        };
    }

    /**
     * Initialize the forecasting job
     */
    async initialize() {
        try {
            logger.info('Initializing Log Volume Forecast Job');

            // Check if job is already running
            const isRunning = await redis.get(`${this.jobName}:running`);
            if (isRunning) {
                logger.warn('Log Volume Forecast Job already running, skipping initialization');
                return;
            }

            // Mark job as running
            await redis.set(`${this.jobName}:running`, 'true', 'EX', 3600); // 1 hour expiry

            this.isRunning = true;
            logger.info('Log Volume Forecast Job initialized successfully');

        } catch (error) {
            logger.error('Failed to initialize Log Volume Forecast Job', error);
            throw error;
        }
    }

    /**
     * Execute the forecasting job
     */
    async execute() {
        try {
            logger.info('Starting Log Volume Forecast Job execution');

            const tenants = await getAllTenants();
            const results = {
                processed: 0,
                errors: 0,
                alerts_sent: 0
            };

            for (const tenant of tenants) {
                try {
                    // Generate forecast for each tenant
                    const forecast = await generateLogVolumeForecast(tenant.id, {
                        historical_days: 90,
                        force_refresh: true
                    });

                    results.processed++;

                    // Check for capacity alerts
                    const alerts = await this.checkCapacityAlerts(tenant.id, forecast);
                    results.alerts_sent += alerts.length;

                    logger.info(`Processed forecast for tenant ${tenant.id}`, {
                        tenantId: tenant.id,
                        alertsTriggered: alerts.length
                    });

                } catch (error) {
                    logger.error(`Error processing forecast for tenant ${tenant.id}`, error);
                    results.errors++;
                }
            }

            logger.info('Log Volume Forecast Job completed', results);
            return results;

        } catch (error) {
            logger.error('Log Volume Forecast Job execution failed', error);
            throw error;
        }
    }

    /**
     * Check for capacity alerts based on forecast data
     */
    async checkCapacityAlerts(tenantId, forecast) {
        const alerts = [];

        try {
            const { capacity_planning, predictions } = forecast;

            // Check storage capacity thresholds
            const currentUsage = capacity_planning.current_usage_percent;
            const predictedUsage = capacity_planning.predicted_usage_percent;

            if (predictedUsage >= this.alertThresholds.storage_critical) {
                alerts.push({
                    type: 'storage_critical',
                    message: `Critical: Predicted storage usage will reach ${Math.round(predictedUsage * 100)}% within ${forecast.forecast_horizon_days} days`,
                    severity: 'critical',
                    data: { currentUsage, predictedUsage, days: forecast.forecast_horizon_days }
                });
            } else if (predictedUsage >= this.alertThresholds.storage_warning) {
                alerts.push({
                    type: 'storage_warning',
                    message: `Warning: Predicted storage usage will reach ${Math.round(predictedUsage * 100)}% within ${forecast.forecast_horizon_days} days`,
                    severity: 'warning',
                    data: { currentUsage, predictedUsage, days: forecast.forecast_horizon_days }
                });
            }

            // Check growth rate thresholds
            const avgGrowthRate = predictions.reduce((sum, pred) => sum + pred.growth_rate, 0) / predictions.length;

            if (avgGrowthRate >= this.alertThresholds.growth_rate_critical) {
                alerts.push({
                    type: 'growth_rate_critical',
                    message: `Critical: Average daily log growth rate is ${Math.round(avgGrowthRate * 100)}%`,
                    severity: 'critical',
                    data: { avgGrowthRate }
                });
            } else if (avgGrowthRate >= this.alertThresholds.growth_rate_warning) {
                alerts.push({
                    type: 'growth_rate_warning',
                    message: `Warning: Average daily log growth rate is ${Math.round(avgGrowthRate * 100)}%`,
                    severity: 'warning',
                    data: { avgGrowthRate }
                });
            }

            // Send alerts if any
            for (const alert of alerts) {
                await this.sendAlert(tenantId, alert);
            }

        } catch (error) {
            logger.error(`Error checking capacity alerts for tenant ${tenantId}`, error);
        }

        return alerts;
    }

    /**
     * Send capacity alert notification
     */
    async sendAlert(tenantId, alert) {
        try {
            await sendCapacityAlert(tenantId, {
                type: alert.type,
                severity: alert.severity,
                message: alert.message,
                data: alert.data,
                timestamp: new Date().toISOString()
            });

            logger.info(`Capacity alert sent for tenant ${tenantId}`, alert);

        } catch (error) {
            logger.error(`Failed to send capacity alert for tenant ${tenantId}`, error);
        }
    }

    /**
     * Start scheduled execution
     */
    startScheduledExecution() {
        if (this.intervalId) {
            logger.warn('Scheduled execution already running');
            return;
        }

        logger.info(`Starting scheduled Log Volume Forecast Job (every ${this.scheduleInterval / 1000 / 60} minutes)`);

        this.intervalId = setInterval(async () => {
            try {
                if (!this.isRunning) {
                    await this.initialize();
                }
                await this.execute();
            } catch (error) {
                logger.error('Scheduled Log Volume Forecast Job failed', error);
            }
        }, this.scheduleInterval);
    }

    /**
     * Stop the job
     */
    async stop() {
        try {
            logger.info('Stopping Log Volume Forecast Job');

            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }

            this.isRunning = false;
            await redis.del(`${this.jobName}:running`);

            logger.info('Log Volume Forecast Job stopped successfully');

        } catch (error) {
            logger.error('Error stopping Log Volume Forecast Job', error);
            throw error;
        }
    }

    /**
     * Get job health status
     */
    async getHealthStatus() {
        try {
            const isRunning = await redis.get(`${this.jobName}:running`);
            const lastExecution = await redis.get(`${this.jobName}:last_execution`);
            const lastError = await redis.get(`${this.jobName}:last_error`);

            return {
                jobName: this.jobName,
                isRunning: this.isRunning && isRunning === 'true',
                lastExecution: lastExecution ? new Date(lastExecution) : null,
                lastError: lastError || null,
                scheduleInterval: this.scheduleInterval,
                alertThresholds: this.alertThresholds
            };

        } catch (error) {
            logger.error('Error getting job health status', error);
            return {
                jobName: this.jobName,
                error: error.message
            };
        }
    }

    /**
     * Manual trigger for testing
     */
    async triggerManual(tenantId = null) {
        try {
            logger.info('Manually triggering Log Volume Forecast Job', { tenantId });

            if (tenantId) {
                // Process single tenant
                const forecast = await generateLogVolumeForecast(tenantId, {
                    historical_days: 90,
                    force_refresh: true
                });

                const alerts = await this.checkCapacityAlerts(tenantId, forecast);

                return {
                    success: true,
                    tenantId,
                    alertsTriggered: alerts.length
                };
            } else {
                // Process all tenants
                return await this.execute();
            }

        } catch (error) {
            logger.error('Manual trigger failed', error);
            throw error;
        }
    }
}

// Export singleton instance
const logVolumeForecastJob = new LogVolumeForecastJob();

export default logVolumeForecastJob;