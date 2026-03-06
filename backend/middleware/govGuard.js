import governanceEngine from '../services/governanceEngine.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { logInfo } from '../utils/logger.js';

/**
 * Governance Guard Middleware (#453)
 * Intercepts outbound transactions to enforce bylaw-driven spending locks.
 */
export const enforceInstitutionalGovernance = async (req, res, next) => {
    const userId = req.user.id;
    const { vaultId, amount } = req.body;

    // Only intercept routes that involve movement of funds
    if (!vaultId || !amount) return next();

    try {
        logInfo(`[Gov Guard] Inspecting transaction: ${amount} from vault ${vaultId}`);

        // This will throw an error if a resolution is triggered
        await governanceEngine.evaluateTransaction(userId, vaultId, amount);

        next();
    } catch (error) {
        if (error.message.includes('pending multi-sig')) {
            return res.status(202).json(new ApiResponse(202, null,
                `Transaction Intercepted: This amount triggers institutional governance protocols. ` +
                `A multi-sig resolution has been created for vault trustees.`
            ));
        }

        res.status(500).json(new ApiResponse(500, null, error.message));
    }
};
