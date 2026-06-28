import logSnapshotService from '../services/logSnapshotService.js';
import { logInfo, logError, logWarn } from '../utils/logger.js';

class LogSnapshotJob {
    constructor() {
        this.isRunning = false;
        this.pendingSnapshots = new Map(); // snapshotId -> options
    }

    /**
     * Initialize the job
     */
    async initialize() {
        try {
            logInfo('Initializing Log Snapshot Job...');

            // Start the processing loop
            this.startProcessingLoop();

            logInfo('Log Snapshot Job initialized successfully');
        } catch (error) {
            logError('Failed to initialize Log Snapshot Job', { error: error.message });
            throw error;
        }
    }

    /**
     * Queue a snapshot for generation
     */
    async queueSnapshot(snapshotId, tenantId, options) {
        logInfo('Queueing log snapshot for generation', { snapshotId, tenantId });

        this.pendingSnapshots.set(snapshotId, {
            tenantId,
            options,
            queuedAt: new Date()
        });
    }

    /**
     * Start the processing loop
     */
    startProcessingLoop() {
        setInterval(async () => {
            if (this.isRunning || this.pendingSnapshots.size === 0) {
                return;
            }

            this.isRunning = true;

            try {
                // Process one snapshot at a time
                const [snapshotId, snapshotData] = this.pendingSnapshots.entries().next().value;
                this.pendingSnapshots.delete(snapshotId);

                await this.processSnapshot(snapshotId, snapshotData.tenantId, snapshotData.options);

            } catch (error) {
                logError('Error in snapshot processing loop', { error: error.message });
            } finally {
                this.isRunning = false;
            }
        }, 5000); // Check every 5 seconds
    }

    /**
     * Process a single snapshot
     */
    async processSnapshot(snapshotId, tenantId, options) {
        try {
            logInfo('Processing log snapshot', { snapshotId, tenantId });

            await logSnapshotService.processSnapshot(snapshotId, tenantId, options);

            logInfo('Log snapshot processed successfully', { snapshotId, tenantId });

        } catch (error) {
            logError('Failed to process log snapshot', {
                snapshotId,
                tenantId,
                error: error.message
            });

            // The service already handles error recording in the database
        }
    }

    /**
     * Get job health status
     */
    async getHealthStatus() {
        return {
            job: 'LogSnapshotJob',
            status: 'healthy',
            isRunning: this.isRunning,
            pendingSnapshots: this.pendingSnapshots.size,
            uptime: process.uptime()
        };
    }

    /**
     * Stop the job
     */
    async stop() {
        logInfo('Stopping Log Snapshot Job...');

        // Clear pending snapshots
        this.pendingSnapshots.clear();

        this.isRunning = false;
        logInfo('Log Snapshot Job stopped');
    }
}

// Export singleton instance
const logSnapshotJob = new LogSnapshotJob();

export default logSnapshotJob;

// Export for direct execution if needed
export { LogSnapshotJob };