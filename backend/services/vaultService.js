import db from '../config/db.js';
import { vaults } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Vault Service (L3)
 * Logic for institutional vault management, including freezing assets.
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
}

export default new VaultService();
