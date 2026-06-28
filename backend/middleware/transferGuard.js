import { ApiResponse } from '../utils/ApiResponse.js';
import liquidityOptimizerService from '../services/liquidityOptimizerService.js';

/**
 * TransferGuard Middleware (#476)
 * Intercepts manual transfer requests. If a significantly cheaper
 * path exists via the MILP optimizer, it returns a 409 Conflict with
 * the suggested path, allowing the user to save fees.
 */
export const transferOptimizerGuard = async (req, res, next) => {
    const { amountUSD, destinationVaultId, bypassOptimization } = req.body;

    // Only nudge for large transfers (> $10k)
    if (amountUSD > 10000 && !bypassOptimization) {
        try {
            const result = await liquidityOptimizerService.findOptimalPath(req.user.id, destinationVaultId, amountUSD);

            // If manual fee (mocked as 2%) is > 2x the optimized fee, nudge user
            const manualFeeEst = amountUSD * 0.02;
            if (manualFeeEst > (parseFloat(result.run.totalEstimatedFeeUSD) * 2)) {
                return new ApiResponse(409, {
                    suggestedPath: result.path,
                    estimatedSavings: manualFeeEst - result.totalCost,
                    message: "A mathematically superior transfer path was found. Use /api/liquidity/optimize to execute."
                }, 'Efficiency Nudge').send(res);
            }
        } catch (err) {
            // If optimizer fails, proceed with manual
            next();
        }
    }

    next();
};
