import distributedTransactionService from '../services/distributedTransactionService.js';
import logger from '../utils/logger.js';

class FinancialReconciliationJob {
    constructor() {
        this.intervalId = null;
        this.isRunning = false;
        this.intervalMs = Number(process.env.FINANCIAL_RECONCILIATION_INTERVAL_MS || 60000);
    }

    start() {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;
        this.intervalId = setInterval(() => {
            this.run().catch((error) => {
                logger.error('Financial reconciliation iteration failed', {
                    error: error.message
                });
            });
        }, this.intervalMs);

        logger.info('Financial reconciliation job started', {
            intervalMs: this.intervalMs
        });
    }

    stop() {
        if (!this.isRunning) {
            return;
        }

        clearInterval(this.intervalId);
        this.intervalId = null;
        this.isRunning = false;

        logger.info('Financial reconciliation job stopped');
    }

    async run() {
        const timedOutCount = await distributedTransactionService.markTimedOutTransactions();
        const inconsistencies = await distributedTransactionService.getRecoverableInconsistencies(200);

        for (const txLog of inconsistencies) {
            logger.warn('Recoverable distributed transaction inconsistency detected', {
                transactionLogId: txLog.id,
                transactionType: txLog.transactionType,
                status: txLog.status,
                operationKey: txLog.operationKey,
                timeoutAt: txLog.timeoutAt,
                lastError: txLog.lastError
            });

            await distributedTransactionService.markRecovered(txLog.id, {
                reconciliationCheckedAt: new Date().toISOString(),
                reconciliationStatus: 'flagged_for_manual_or_async_recovery'
            });
        }

        if (timedOutCount > 0 || inconsistencies.length > 0) {
            logger.info('Financial reconciliation summary', {
                timedOutCount,
                inconsistencies: inconsistencies.length
            });
        }
    }
}

export default new FinancialReconciliationJob();
