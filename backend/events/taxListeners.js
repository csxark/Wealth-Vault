import eventBus from './eventBus.js';
import taxService from '../services/taxService.js';
import taxScoutAI from '../services/taxScoutAI.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Tax Event Listeners (L3)
 * Maintains the Global Wash-Sale Prevention Matrix in real-time.
 */
export const initializeTaxListeners = () => {
    // Triggered whenever a transaction is finalized
    eventBus.on('INVESTMENT_TRANSACTION_CREATED', async (data) => {
        const { userId, investmentId, type, price, quantity, symbol } = data;

        if (type === 'sell') {
            logInfo(`[Tax Listeners] Sale detected: ${symbol}. Recalculating harvesting potential.`);
            // After a sale, we check if it was a loss and if it creates a wash-sale risk for future buys
            await taxScoutAI.scanForOpportunities(userId);
        }

        if (type === 'buy') {
            logInfo(`[Tax Listeners] Purchase detected: ${symbol}. Checking for wash-sale violations.`);
            // A purchase might violate a loss-sale that happened in the last 30 days
            const hasRecentLoss = await taxService.checkWashSaleRisk(userId, symbol);
            if (hasRecentLoss) {
                logInfo(`[Tax Listeners] Potential Wash-Sale violation triggered for ${symbol} by user ${userId}`);
                // In a full implementation, we would increment the cost basis of this new lot
            }
        }
    });

    logInfo('✅ Tax Real-Time Monitor listeners initialized');
};

export default initializeTaxListeners;
