import hedgingOrchestrator from '../services/hedgingOrchestrator.js';
import anomalyScanner from '../services/anomalyScanner.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { logInfo } from '../utils/logger.js';

/**
 * Risk Interceptor Middleware (L3)
 * Real-time transaction filtering that blocks high-risk operations during active hedge executions.
 */
export const riskInterceptor = async (req, res, next) => {
    const userId = req.user.id;
    const { vaultId, type } = req.body;

    // 1. Check if the system is in a global Red Alert state (optional check)
    const systemStatus = anomalyScanner.getSystemStatus();
    if (systemStatus.state === 'CRITICAL' && (type === 'withdrawal' || type === 'transfer')) {
        logInfo(`[Risk Interceptor] Global CRITICAL state active. Reviewing transaction for user ${userId}.`);
    }

    // 2. Check if the specific vault is locked due to an active hedge
    if (vaultId) {
        const isLocked = await hedgingOrchestrator.IsVaultLocked(vaultId);

        if (isLocked) {
            logInfo(`[Risk Interceptor] Transaction BLOCKED for vault ${vaultId}. Vault is currently under Hedging Lock.`);

            return res.status(403).json(new ApiResponse(403, null,
                "Transaction blocked. This vault is currently frozen due to an active market anomaly protection (Black-Swan Hedging). Please wait for the cooldown period or contact governance executors."
            ));
        }
    }

    // 3. Prevent outgoing transfers during high-volatility if they exceed safety bounds
    if (type === 'withdrawal' && systemStatus.state === 'CRITICAL') {
        const amount = parseFloat(req.body.amount || 0);
        // Soft limit during crisis: No single withdrawal > 5000 without manual override
        if (amount > 5000) {
            return res.status(403).json(new ApiResponse(403, null,
                "Emergency Limit Exceeded: Large withdrawals are restricted during high market volatility to prevent capital flight."
            ));
        }
    }

    next();
};
