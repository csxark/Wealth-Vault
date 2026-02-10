import { db } from '../db/index.js';
import { vaultBalances, vaultMembers } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Validates that the user has permission to move funds from the source vault
 * and that the source vault has sufficient balance.
 */
export const validateSettlement = async (req, res, next) => {
    const { sourceVaultId, amount } = req.body;
    const userId = req.user.id;

    try {
        // 1. Check permissions (must be owner or have contributor role)
        const membership = await db.select()
            .from(vaultMembers)
            .where(and(
                eq(vaultMembers.vaultId, sourceVaultId),
                eq(vaultMembers.userId, userId)
            ))
            .limit(1);

        if (membership.length === 0) {
            // Check if user is owner
            const ownerCheck = await db.select()
                .from(vaultBalances)
                .where(and(
                    eq(vaultBalances.id, sourceVaultId),
                    eq(vaultBalances.userId, userId)
                ))
                .limit(1);

            if (membership.length === 0 && ownerCheck.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: "Access Denied: You do not have permission to settle from this vault."
                });
            }
        }

        // 2. Check sufficient funds
        const balanceRecord = await db.select()
            .from(vaultBalances)
            .where(eq(vaultBalances.id, sourceVaultId))
            .limit(1);

        if (balanceRecord.length === 0) {
            return res.status(404).json({ success: false, message: "Vault not found" });
        }

        if (parseFloat(balanceRecord[0].balance) < parseFloat(amount)) {
            return res.status(400).json({
                success: false,
                message: `Insufficient vault balance. Available: ${balanceRecord[0].balance}`
            });
        }

        next();
    } catch (error) {
        console.error('Settlement validation error:', error);
        res.status(500).json({ success: false, message: "Settlement validation failure" });
    }
};
