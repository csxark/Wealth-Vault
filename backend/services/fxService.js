import db from '../config/db.js';
import { ledgerAccounts, ledgerEntries, fxValuationSnapshots } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import currencyService from './currencyService.js';
import ledgerService from './ledgerService.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * FX Revaluation Service (L3)
 * Tracks and triggers FX Delta revaluations across the global ledger.
 */
class FXService {
    /**
     * Revalue a specific account and record the delta snapshot
     */
    async revalueAccount(userId, accountId) {
        try {
            const reval = await ledgerService.getReconstructedBalance(accountId, userId);

            // Record valuation snapshot
            const [snapshot] = await db.insert(fxValuationSnapshots).values({
                userId,
                accountId,
                bookValueBase: reval.costBasisUSD.toString(),
                marketValueBase: reval.marketValueUSD.toString(),
                unrealizedGainLoss: reval.unrealizedFXGainUSD.toString(),
                valuationDate: new Date()
            }).returning();

            logInfo(`[FX Service] Revalued account ${accountId}. Delta: ${reval.unrealizedFXGainUSD} USD`);
            return {
                ...reval,
                snapshotId: snapshot.id
            };
        } catch (error) {
            logError(`[FX Service] Revaluation failed for account ${accountId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Trigger recursive ledger revaluation (L3)
     * To be called when major currency rates shift.
     */
    async triggerGlobalRevaluation(userId) {
        logInfo(`[FX Service] Initiating global ledger revaluation for user ${userId}`);
        const accounts = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.userId, userId));

        const results = [];
        for (const account of accounts) {
            const res = await this.revalueAccount(userId, account.id);
            results.push(res);
        }

        return results;
    }

    /**
     * Calculate revaluation delta for a set of accounts (e.g. for a specific vault)
     */
    async getVaultRevaluationDelta(userId, vaultId) {
        const accounts = await db.select().from(ledgerAccounts)
            .where(and(eq(ledgerAccounts.userId, userId), eq(ledgerAccounts.vaultId, vaultId)));

        let totalUnrealizedGain = 0;
        for (const account of accounts) {
            const reval = await ledgerService.getReconstructedBalance(account.id, userId);
            totalUnrealizedGain += reval.unrealizedFXGainUSD;
        }

        return {
            vaultId,
            totalUnrealizedFXGainUSD: totalUnrealizedGain,
            timestamp: new Date()
        };
    }
}

export default new FXService();
