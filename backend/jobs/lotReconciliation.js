import cron from 'node-cron';
import db from '../config/db.js';
import { investments, taxLotInventory, taxLotHistory, harvestOpportunities } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { findLotDiscrepancies, calculateNetHarvestBenefit } from '../utils/taxMath.js';
import { logInfo, logError, logWarn } from '../utils/logger.js';

/**
 * Lot Reconciliation Job (#448 + #460)
 *
 * Nightly at 3 AM:
 *  1. Reconciles main investment ledger quantities vs tax lot inventory
 *  2. Scans for G/L discrepancies > 5% (harvest candidates)
 *  3. Surfaces new harvest opportunities to the `harvestOpportunities` table
 *  4. Logs any inventory/ledger mismatches for manual review
 */
const scheduleLotReconciliation = () => {
    cron.schedule('0 3 * * *', async () => {
        logInfo('[LotReconciliation] Starting nightly audit & opportunity scan...');

        try {
            // ── 1. Reconcile ledger vs lot inventory ─────────────────────────
            const assetAggregates = await db.select({
                userId: investments.userId,
                investmentId: investments.id,
                symbol: investments.symbol,
                currentPrice: investments.currentPrice,
                ledgerQuantity: investments.quantity
            }).from(investments);

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

            let discrepancies = 0;
            for (const asset of assetAggregates) {
                const ledgerQty = parseFloat(asset.ledgerQuantity || 0);
                const lotQty = lotMap[`${asset.userId}_${asset.investmentId}`] ?? 0;
                const diff = Math.abs(ledgerQty - lotQty);

                if (diff > 0.000001) {
                    discrepancies++;
                    logError(`[LotReconciliation] DISCREPANCY: user=${asset.userId} asset=${asset.symbol ?? asset.investmentId} ledger=${ledgerQty} lots=${lotQty} diff=${diff}`);
                }
            }

            logInfo(`[LotReconciliation] Ledger reconciliation complete. Discrepancies found: ${discrepancies}`);

            // ── 2. Scan taxLotHistory for harvest opportunities (#460) ────────
            const allOpenLots = await db.select().from(taxLotHistory)
                .where(eq(taxLotHistory.status, 'open'));

            // Group open lots by userId+investmentId
            const lotsByAsset = {};
            allOpenLots.forEach(lot => {
                const key = `${lot.userId}__${lot.investmentId}`;
                if (!lotsByAsset[key]) {
                    lotsByAsset[key] = { userId: lot.userId, investmentId: lot.investmentId, lots: [] };
                }
                lotsByAsset[key].lots.push(lot);
            });

            // Build a quick price lookup from investments
            const priceMap = {};
            assetAggregates.forEach(inv => {
                priceMap[inv.investmentId] = parseFloat(inv.currentPrice ?? 0);
            });

            let opportunitiesUpserted = 0;

            for (const [key, group] of Object.entries(lotsByAsset)) {
                const marketPrice = priceMap[group.investmentId] ?? 0;
                if (marketPrice <= 0) continue;

                const discrepancyLots = findLotDiscrepancies(group.lots, marketPrice, 5);
                const lossLots = discrepancyLots.filter(l => l.isLoss);

                if (lossLots.length === 0) continue;

                const totalUnrealizedLoss = lossLots.reduce((sum, l) => sum + Math.abs(l.unrealizedGL), 0);

                if (totalUnrealizedLoss < 100) continue; // Skip trivial amounts

                const netBenefitCalc = calculateNetHarvestBenefit(
                    -totalUnrealizedLoss,
                    'US',      // TODO: pull from user profile
                    'short_term'
                );

                if (!netBenefitCalc.isWorthwhile) {
                    logInfo(`[LotReconciliation] Skipping opportunity for ${group.investmentId}: net harvest benefit not worthwhile ($${netBenefitCalc.netBenefit.toFixed(2)})`);
                    continue;
                }

                // Upsert into harvestOpportunities (detect or re-detect)
                await db.insert(harvestOpportunities).values({
                    userId: group.userId,
                    investmentId: group.investmentId,
                    unrealizedLoss: totalUnrealizedLoss.toFixed(2),
                    estimatedSavings: netBenefitCalc.taxSavings.toFixed(2),
                    status: 'detected',
                    metadata: {
                        eligibleLotCount: lossLots.length,
                        netBenefit: netBenefitCalc.netBenefit.toFixed(4),
                        marketPrice,
                        detectedBy: 'lotReconciliation'
                    }
                }).onConflictDoNothing().catch(err =>
                    logWarn(`[LotReconciliation] Opportunity insert skipped (may already exist): ${err.message}`)
                );

                opportunitiesUpserted++;

                logInfo(`[LotReconciliation] Harvest opportunity detected: user=${group.userId} asset=${group.investmentId} loss=$${totalUnrealizedLoss.toFixed(2)} savings=$${netBenefitCalc.taxSavings.toFixed(2)}`);
            }

            logInfo(`[LotReconciliation] Opportunity scan complete. New opportunities surfaced: ${opportunitiesUpserted}`);

        } catch (error) {
            logError('[LotReconciliation] Job failed:', error);
        }
    });
};

export default scheduleLotReconciliation;
