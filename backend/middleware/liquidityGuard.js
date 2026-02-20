import projectionEngine from '../services/projectionEngine.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { logInfo } from '../utils/logger.js';

/**
 * Liquidity Guard Middleware (L3)
 * Warning system that blocks or alerts on transactions that would cause "Liquidity Shortfall" within 30 days.
 */
export const liquidityGuard = async (req, res, next) => {
    const userId = req.user.id;
    const { amount, type } = req.body;

    if (type !== 'expense' && type !== 'outflow') {
        return next();
    }

    try {
        const outflowAmount = parseFloat(amount);

        // 1. Get 30-day projection
        const forecasts = await projectionEngine.getForecastSummary(userId);
        if (!forecasts.length) return next(); // No forecast data yet

        const thirtyDayForecast = forecasts[0]; // Assuming first reflects next month
        const currentProjectedBalance = parseFloat(thirtyDayForecast.projectedBalance);
        const lowerBound = parseFloat(thirtyDayForecast.confidenceLow);

        // 2. Check impact
        const postTransactionBalance = currentProjectedBalance - outflowAmount;
        const postTransactionLowerBound = lowerBound - outflowAmount;

        // 3. Evaluate criteria
        // If lower bound of confidence interval (95%) drops below 0 within 30 days
        if (postTransactionLowerBound < 0) {
            logInfo(`[Liquidity Guard] Transaction BLOCKED for user ${userId}. Potential shortfall detected within 30 days.`);

            return res.status(403).json(new ApiResponse(403, null,
                "Transaction would jeopardize liquidity stability. Forecasted shortfall within 30 days exceeds confidence safety limits."
            ));
        }

        // 4. Soft Warning for moderate risk (lower bound < 10% of total)
        if (postTransactionLowerBound < (currentProjectedBalance * 0.1)) {
            logInfo(`[Liquidity Guard] Warning issued for user ${userId}. Tight liquidity window.`);
            res.setHeader('X-Liquidity-Warning', 'Low safety margin detected for next 30 days.');
        }

        next();
    } catch (error) {
        // Fail-safe: if guard errors, allow next but log
        console.error('[Liquidity Guard] Error in check:', error);
        next();
    }
};
