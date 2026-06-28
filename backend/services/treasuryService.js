import db from '../config/db.js';
import { payrollBuckets, vaults, interCompanyTransfers } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';
import ledgerBalancer from './ledgerBalancer.js';

/**
 * Treasury Service (L3)
 * Liquidity-aware "Sweep" logic that pulls cash from revenue vaults to fund payroll buckets.
 */
class TreasuryService {
    /**
     * Execute Payroll Sweep
     * Moves required funds from a Revenue Vault (Source) to a Payroll Bucket (Target)
     */
    async executePayrollSweep(userId, bucketId) {
        try {
            const bucket = await db.query.payrollBuckets.findFirst({
                where: eq(payrollBuckets.id, bucketId)
            });

            if (!bucket || !bucket.isActive) throw new Error('Bucket not found or inactive');

            logInfo(`[Treasury Service] Starting sweep for payroll bucket: ${bucket.bucketName}`);

            // 1. Identify "Target" funding required (mock: sum of pending payroll)
            const fundingNeeded = 50000.00;

            // 2. Identify "Best" Revenue Vault to pull from
            const sourceVaults = await db.query.vaults.findMany({
                where: and(eq(vaults.ownerId, userId), eq(vaults.status, 'active'))
            });

            const bestSource = sourceVaults.sort((a, b) => b.balance - a.balance)[0];

            if (!bestSource || bestSource.balance < fundingNeeded) {
                throw new Error('Insufficient group liquidity for payroll sweep');
            }

            // 3. Coordinate with Ledger Balancer if crossing entity lines
            if (bestSource.entityId && bestSource.entityId !== bucket.entityId) {
                logInfo(`[Treasury Service] Sweep requires inter-company loan from ${bestSource.entityId} to ${bucket.entityId}`);

                await ledgerBalancer.proposeTransfer(userId, {
                    sourceEntityId: bestSource.entityId,
                    targetEntityId: bucket.entityId,
                    amount: fundingNeeded,
                    type: 'loan'
                });
            }

            // 4. Update bucket allocation
            await db.update(payrollBuckets)
                .set({ totalAllocated: sql`${payrollBuckets.totalAllocated} + ${fundingNeeded.toString()}` })
                .where(eq(payrollBuckets.id, bucketId));

            logInfo(`[Treasury Service] Sweep COMPLETED. Allocated $${fundingNeeded} to ${bucket.bucketName}`);

            return { success: true, amount: fundingNeeded };
        } catch (error) {
            logError('[Treasury Service] Sweep failed:', error);
            throw error;
        }
    }

    /**
     * Rebalance Liquidity across entities
     */
    async rebalanceEntityLiquidity(userId) {
        // Logic to move idle cash to high-use entities
        return { success: true };
    }
}

export default new TreasuryService();
