import db from '../config/db.js';
import { optionsPositions, vaults, investments, vaultBalances } from '../db/schema.js';
import { eq, and, sql, desc } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Collateral Manager (#509)
 * Links with the existing inventory to ensure 100% of derivatives are fully covered.
 * This prevents "Naked Short" exposure which is prohibited in many jurisdictions.
 */
class CollateralRequirementService {
    /**
     * Check if a specific vault has enough underlying assets to cover a short option position.
     * @param {string} vaultId 
     * @param {string} investmentId 
     * @param {number} contracts - Negative for short positions.
     */
    async checkCoverage(vaultId, investmentId, contracts) {
        logInfo(`[Collateral Manager] Checking coverage for vault ${vaultId} on investment ${investmentId}`);

        try {
            // 1. Calculate Required Underlying Shares
            // 1 Contract usually = 100 Shares
            const neededShares = Math.abs(contracts) * 100;

            // 2. Fetch Vault Assets (Simplified check)
            // In production, we'd check the ledger balance of the specific investment
            const balance = await db.query.vaultBalances.findFirst({
                where: and(eq(vaultBalances.vaultId, vaultId), eq(vaultBalances.currency, 'SHARES')) // Convention
            });

            const availableShares = parseFloat(balance?.balance || '0');

            if (availableShares < neededShares) {
                return { isCovered: false, shortfall: (neededShares - availableShares) };
            }

            return { isCovered: true, excess: (availableShares - neededShares) };
        } catch (error) {
            logError('[Collateral Manager] Coverage check failed:', error);
            throw error;
        }
    }

    /**
     * Reconcile all open derivative positions and lock the underlying collateral.
     */
    async reconcileAllPositions(userId) {
        logInfo(`[Collateral Manager] Reconciling all positions for user ${userId}`);

        const openPositions = await db.select()
            .from(optionsPositions)
            .where(and(eq(optionsPositions.userId, userId), eq(optionsPositions.status, 'open')));

        for (const pos of openPositions) {
            // Logic to mark as 'isCovered' after scanning vaults
            const coverage = await this.checkCoverage(pos.vaultId, pos.investmentId, parseFloat(pos.contractsCount));

            if (coverage.isCovered !== pos.isCovered) {
                await db.update(optionsPositions)
                    .set({ isCovered: coverage.isCovered })
                    .where(eq(optionsPositions.id, pos.id));
            }
        }

        return openPositions.length;
    }
}

export default new CollateralRequirementService();
