import cron from 'node-cron';
import db from '../config/db.js';
import { investments, taxLotInventory } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Lot Reconciliation Job (#448)
 * Bridging the main ledger with the tax lot inventory to catch accounting mismatches.
 */
const scheduleLotReconciliation = () => {
    // Run nightly at 3 AM
    cron.schedule('0 3 * * *', async () => {
        logInfo('[Lot Reconciliation] Starting nightly audit...');

        try {
            // 1. Get aggregate totals from the main investments table
            const assetAggregates = await db.select({
                userId: investments.userId,
                investmentId: investments.id,
                ledgerQuantity: investments.quantity
            }).from(investments);

            // 2. Get aggregate totals from tax lot inventory
            const lotAggregates = await db.select({
                userId: taxLotInventory.userId,
                investmentId: taxLotInventory.investmentId,
                lotQuantity: sql`SUM(CAST(remaining_quantity AS NUMERIC))`
            }).from(taxLotInventory)
                .where(eq(taxLotInventory.lotStatus, 'open'))
                .groupBy(taxLotInventory.userId, taxLotInventory.investmentId);

            const lotMap = {};
            lotAggregates.forEach(l => {
                lotMap[`${l.userId}_${l.investmentId}`] = parseFloat(l.lotQuantity || 0);
            });

            // 3. Compare and Log Discrepancies
            for (const asset of assetAggregates) {
                const ledgerQty = parseFloat(asset.ledgerQuantity);
                const lotQty = lotMap[`${asset.userId}_${asset.investmentId}`] || 0;

                const diff = Math.abs(ledgerQty - lotQty);

                if (diff > 0.00000001) {
                    logError(`[Lot Reconciliation] DISCREPANCY DETECTED: User ${asset.userId}, Asset ${asset.investmentId}. Ledger: ${ledgerQty}, Lots: ${lotQty}. Diff: ${diff}`);
                    // In a production system, we'd trigger an automated adjustment or freeze the account
                }
            }

            logInfo('[Lot Reconciliation] Audit complete.');
        } catch (error) {
            logError('[Lot Reconciliation] Job failed:', error);
        }
    });
};

export default scheduleLotReconciliation;
