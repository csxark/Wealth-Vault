import db from '../config/db.js';
import { vaults, vaultBalances, cashDragMetrics } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Vault Service (L3)
 * Logic for institutional vault management, including freezing assets and staging vaults.
 */
class VaultService {
    /**
     * Freeze a vault to prevent withdrawals during governance or succession
     */
    async freezeVault(vaultId) {
        const [vault] = await db.update(vaults)
            .set({ status: 'frozen', updatedAt: new Date() })
            .where(eq(vaults.id, vaultId))
            .returning();

        console.log(`[Vault Service] Vault ${vaultId} has been FROZEN`);
        return vault;
    }

    /**
     * Unfreeze a vault after consensus or manual override
     */
    async unfreezeVault(vaultId) {
        const [vault] = await db.update(vaults)
            .set({ status: 'active', updatedAt: new Date() })
            .where(eq(vaults.id, vaultId))
            .returning();

        console.log(`[Vault Service] Vault ${vaultId} has been ACTIVATED`);
        return vault;
    }

    /**
     * Check if a vault is frozen
     */
    async isVaultFrozen(vaultId) {
        const vault = await db.query.vaults.findFirst({
            where: eq(vaults.id, vaultId)
        });
        return vault?.status === 'frozen';
    }

    /**
     * Create or get staging vault for cash aggregation (L3)
     * Staging vaults hold cash before it reaches rebalance threshold
     */
    async getOrCreateStagingVault(userId) {
        // Check if staging vault exists
        let stagingVault = await db.query.vaults.findFirst({
            where: and(
                eq(vaults.ownerId, userId),
                eq(vaults.vaultType, 'staging')
            )
        });

        if (!stagingVault) {
            const [newVault] = await db.insert(vaults).values({
                ownerId: userId,
                name: 'Cash Staging Vault',
                vaultType: 'staging',
                currency: 'USD',
                status: 'active',
                metadata: {
                    purpose: 'Temporary holding for dividend/interest cash before rebalancing',
                    autoCreated: true
                }
            }).returning();

            stagingVault = newVault;
            logInfo(`[Vault Service] Created staging vault for user ${userId}`);
        }

        return stagingVault;
    }

    /**
     * Get current cash balance in a vault
     */
    async getVaultCashBalance(vaultId) {
        const balance = await db.query.vaultBalances.findFirst({
            where: and(
                eq(vaultBalances.vaultId, vaultId),
                eq(vaultBalances.currency, 'USD')
            )
        });

        return parseFloat(balance?.balance || '0');
    }

    /**
     * Calculate cash drag for a vault (L3)
     * Measures opportunity cost of holding idle cash
     */
    async calculateCashDrag(userId, vaultId, targetYield = 0.05) {
        const cashBalance = await this.getVaultCashBalance(vaultId);

        // Get vault configuration to determine target cash reserve
        const vault = await db.query.vaults.findFirst({
            where: eq(vaults.id, vaultId)
        });

        const targetCashReserve = parseFloat(vault?.metadata?.targetCashReserve || '1000');
        const excessCash = Math.max(0, cashBalance - targetCashReserve);

        // Calculate opportunity cost
        // Assuming target yield is annual, convert to daily
        const dailyYield = targetYield / 365;
        const opportunityCostDaily = excessCash * dailyYield;

        // Get days idle (simplified - in production, track actual idle time)
        const daysIdle = 7; // Mock value

        const totalDragCost = opportunityCostDaily * daysIdle;

        // Record metrics
        const [metric] = await db.insert(cashDragMetrics).values({
            userId,
            vaultId,
            idleCashBalance: cashBalance.toString(),
            targetCashReserve: targetCashReserve.toString(),
            excessCash: excessCash.toString(),
            opportunityCostDaily: opportunityCostDaily.toString(),
            daysIdle,
            totalDragCost: totalDragCost.toString(),
            metadata: { targetYield }
        }).returning();

        return {
            cashBalance,
            targetCashReserve,
            excessCash,
            opportunityCostDaily: parseFloat(opportunityCostDaily.toFixed(4)),
            daysIdle,
            totalDragCost: parseFloat(totalDragCost.toFixed(2)),
            annualizedDragCost: parseFloat((opportunityCostDaily * 365).toFixed(2))
        };
    }

    /**
     * Sweep excess cash from staging vault to target vault (L3)
     */
    async sweepCashToTarget(userId, stagingVaultId, targetVaultId, amount) {
        try {
            return await db.transaction(async (tx) => {
                // Deduct from staging vault
                await tx.execute(sql`
                    UPDATE vault_balances 
                    SET balance = balance - ${amount}
                    WHERE vault_id = ${stagingVaultId} AND currency = 'USD'
                `);

                // Add to target vault
                await tx.execute(sql`
                    INSERT INTO vault_balances (vault_id, currency, balance)
                    VALUES (${targetVaultId}, 'USD', ${amount})
                    ON CONFLICT (vault_id, currency) 
                    DO UPDATE SET balance = vault_balances.balance + ${amount}
                `);

                logInfo(`[Vault Service] Swept $${amount} from staging to vault ${targetVaultId}`);

                return {
                    success: true,
                    amount,
                    from: stagingVaultId,
                    to: targetVaultId
                };
            });
        } catch (error) {
            logError('[Vault Service] Cash sweep failed:', error);
            throw error;
        }
    }

    /**
     * Get all vaults with excess cash (L3)
     */
    async getVaultsWithExcessCash(userId, minExcess = 1000) {
        const userVaults = await db.query.vaults.findMany({
            where: and(
                eq(vaults.ownerId, userId),
                eq(vaults.status, 'active')
            )
        });

        const vaultsWithExcess = [];

        for (const vault of userVaults) {
            const dragMetrics = await this.calculateCashDrag(userId, vault.id);

            if (dragMetrics.excessCash >= minExcess) {
                vaultsWithExcess.push({
                    vaultId: vault.id,
                    vaultName: vault.name,
                    ...dragMetrics
                });
            }
        }

        return vaultsWithExcess;
    }
}

export default new VaultService();
