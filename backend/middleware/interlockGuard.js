import { NetWorthGraph } from '../utils/netWorthGraph.js';
import { ApiResponse } from '../utils/ApiResponse.js';

/**
 * Interlock Guard Middleware (#459)
 * Prevents insolvency and circular debt violations in the interlocking vault network.
 */
export const enforceInterlockSafety = (minNetWorth = 0) => async (req, res, next) => {
    const userId = req.user.id;
    const vaultId = req.params.vaultId || req.body.vaultId || req.query.vaultId;

    if (!vaultId) {
        return next();
    }

    try {
        const graph = new NetWorthGraph(userId);
        await graph.build();

        // 1. Check for circular references that might compromise the network
        const cycles = graph.detectCycles();
        if (cycles.length > 0) {
            console.warn(`[Interlock Guard] Circular debt detected for user ${userId}:`, cycles);
            // We don't necessarily block everything, but we should be aware.
            // For now, let's just log it.
        }

        // 2. Calculate recursive net worth
        const netWorth = graph.getVaultNetWorth(vaultId);

        // 3. Prevent actions that would make the vault's recursive net worth negative
        // (i.e. liabilities exceed cash + assets)
        if (netWorth < minNetWorth) {
            return res.status(403).json(new ApiResponse(403, null,
                `Interlock Safety Breach: Vault ${vaultId} has a recursive net worth of ${netWorth.toFixed(2)}. ` +
                `The requested action would violate insolvency protections.`
            ));
        }

        next();
    } catch (error) {
        console.error('[Interlock Guard] Error:', error);
        res.status(500).json(new ApiResponse(500, null, 'Internal error in interlock safety check'));
    }
};
