import { ApiResponse } from '../utils/ApiResponse.js';
import db from '../config/db.js';
import { vaults } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * routeValidator - Validates liquidity transfer requests (#476)
 */
export const validateRouteRequest = async (req, res, next) => {
    const userId = req.user.id;
    const { sourceVaultId, destVaultId, amount } = req.body;

    if (!sourceVaultId || !destVaultId || !amount) {
        return res.status(400).json(new ApiResponse(400, null, 'Source, destination, and amount are required.'));
    }

    try {
        // 1. Ownership Check
        const [srcVault, destVault] = await Promise.all([
            db.select().from(vaults).where(and(eq(vaults.id, sourceVaultId), eq(vaults.ownerId, userId))),
            db.select().from(vaults).where(and(eq(vaults.id, destVaultId), eq(vaults.ownerId, userId)))
        ]);

        if (srcVault.length === 0) {
            return res.status(404).json(new ApiResponse(404, null, 'Source vault not found or access denied.'));
        }
        if (destVault.length === 0) {
            return res.status(404).json(new ApiResponse(404, null, 'Destination vault not found or access denied.'));
        }

        // 2. Logic Check
        if (sourceVaultId === destVaultId) {
            return res.status(400).json(new ApiResponse(400, null, 'Source and destination vaults must be different.'));
        }

        if (parseFloat(amount) <= 0) {
            return res.status(400).json(new ApiResponse(400, null, 'Transfer amount must be positive.'));
        }

        // Inject objects for downstream use
        req.sourceVault = srcVault[0];
        req.destVault = destVault[0];

        next();
    } catch (error) {
        res.status(500).json(new ApiResponse(500, null, error.message));
    }
};
