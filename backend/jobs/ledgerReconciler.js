import cron from 'node-cron';
import { db } from '../db/index.js';
import { vaultBalances, internalLedger } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import ledgerTracker from '../services/ledgerTracker.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Ledger Reconciler Job - Runs daily at Midnight
 * Compares current vault balances with historical ledger reconstruction
 * to ensure no data corruption or drift.
 */
class LedgerReconcilerJob {
    constructor() {
        this.schedule = '0 0 * * *'; // Midnight Daily
    }

    start() {
        logInfo('Initializing Ledger Reconciler Job...');
        cron.schedule(this.schedule, async () => {
            logInfo('Running Scheduled Ledger Reconciliation...');

            try {
                // Get all vaults with a balance > 0
                const allVaults = await db.select().from(vaultBalances);

                for (const vault of allVaults) {
                    try {
                        const ledgerSum = await ledgerTracker.reconstructBalance(vault.vaultId);
                        const currentBalance = parseFloat(vault.balance);

                        if (Math.abs(ledgerSum - currentBalance) > 0.01) {
                            logError(`CRITICAL: Ledger Mismatch detected for Vault ${vault.vaultId}. Ledger Sum: ${ledgerSum}, Recorded Balance: ${currentBalance}`);
                            // In a production app, we would fire a critical alert or auto-correct
                        }
                    } catch (vaultError) {
                        logError(`Failed reconciliation for vault ${vault.vaultId}:`, vaultError);
                    }
                }

                logInfo('Scheduled Ledger Reconciliation Completed.');
            } catch (error) {
                logError('Global Ledger Reconciler Job Failure:', error);
            }
        });
    }
}

export default new LedgerReconcilerJob();
