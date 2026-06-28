import db from '../config/db.js';
import { vaults, investments, bankAccounts, vaultConsolidationLogs } from '../db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Ledger Consolidator Service (#449)
 * Aggregates balances and asset distributions across multiple vaults.
 */
class LedgerConsolidator {
    /**
     * Consolidate a set of vaults for a user
     */
    async consolidateVaults(userId, vaultIds) {
        logInfo(`[Ledger Consolidator] Consolidating ${vaultIds.length} vaults for user ${userId}`);

        try {
            // 1. Fetch all assets from these vaults
            const allInvestments = await db.select().from(investments)
                .where(inArray(investments.vaultId, vaultIds));

            const allBankAccounts = await db.select().from(bankAccounts)
                .where(inArray(bankAccounts.vaultId, vaultIds));

            let totalBalance = 0;
            const distribution = {
                equity: 0,
                fixed_income: 0,
                commodity: 0,
                cash: 0,
                crypto: 0
            };

            // 2. Process Investments
            for (const inv of allInvestments) {
                const value = parseFloat(inv.currentPrice || 0) * parseFloat(inv.quantity || 0);
                totalBalance += value;

                const type = (inv.type || 'equity').toLowerCase();
                distribution[type] = (distribution[type] || 0) + value;
            }

            // 3. Process Cash
            for (const bank of allBankAccounts) {
                const value = parseFloat(bank.balance || 0);
                totalBalance += value;
                distribution.cash += value;
            }

            // 4. Calculate Weight Percentages
            const weights = {};
            if (totalBalance > 0) {
                for (const [type, value] of Object.entries(distribution)) {
                    weights[type] = (value / totalBalance).toFixed(4);
                }
            }

            // 5. Log Consolidation Event
            const [log] = await db.insert(vaultConsolidationLogs).values({
                userId,
                consolidatedBalance: totalBalance.toString(),
                vaultIds,
                assetDistribution: weights,
                metadata: {
                    raw_distribution: distribution,
                    consituent_count: allInvestments.length + allBankAccounts.length
                }
            }).returning();

            return {
                totalBalance,
                weights,
                logId: log.id
            };
        } catch (error) {
            logError(`[Ledger Consolidator] Consolidation failed:`, error);
            throw error;
        }
    }

    /**
     * Get Global User Allocation (All Vaults)
     */
    async getGlobalAllocation(userId) {
        const userVaults = await db.select({ id: vaults.id }).from(vaults).where(eq(vaults.userId, userId));
        const ids = userVaults.map(v => v.id);

        if (ids.length === 0) return { totalBalance: 0, weights: {} };

        return await this.consolidateVaults(userId, ids);
    }
}

export default new LedgerConsolidator();
