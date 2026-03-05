/**
 * Log Lifecycle Automation Job
 *
 * Scheduled job that runs log lifecycle automation to migrate logs
 * between storage tiers based on age thresholds.
 */

import LogLifecycleAutomation from '../services/logLifecycleAutomation.js';
import { logInfo, logError, logWarn } from '../utils/logger.js';

class LogLifecycleJob {
    constructor() {
        this.lifecycleService = null;
        this.isRunning = false;
    }

    /**
     * Initialize the job
     */
    async initialize() {
        try {
            logInfo('Initializing Log Lifecycle Job...');

            // Initialize the lifecycle automation service
            this.lifecycleService = new LogLifecycleAutomation();
            await this.lifecycleService.initialize();

            logInfo('Log Lifecycle Job initialized successfully');
        } catch (error) {
            logError('Failed to initialize Log Lifecycle Job', { error: error.message });
            throw error;
        }
    }

    /**
     * Run the log lifecycle automation
     */
    async execute() {
        if (this.isRunning) {
            logWarn('Log Lifecycle Job is already running, skipping execution');
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            logInfo('Starting Log Lifecycle Job execution...');

            // Run a migration cycle
            await this.lifecycleService.runMigrationCycle();

            // Run monitoring cycle
            await this.lifecycleService.runMonitoringCycle();

            const duration = Date.now() - startTime;
            logInfo('Log Lifecycle Job completed successfully', { durationMs: duration });

        } catch (error) {
            logError('Log Lifecycle Job execution failed', {
                error: error.message,
                durationMs: Date.now() - startTime
            });
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Get job health status
     */
    async getHealthStatus() {
        return {
            job: 'LogLifecycleJob',
            status: 'healthy',
            isRunning: this.isRunning,
            serviceHealth: this.lifecycleService ? await this.lifecycleService.getHealthStatus() : null
        };
    }

    /**
     * Stop the job
     */
    async stop() {
        logInfo('Stopping Log Lifecycle Job...');

        if (this.lifecycleService) {
            await this.lifecycleService.stop();
        }

        this.isRunning = false;
        logInfo('Log Lifecycle Job stopped');
    }
}

// Export singleton instance
const logLifecycleJob = new LogLifecycleJob();

export default logLifecycleJob;

// Export for direct execution if needed
export { LogLifecycleJob };