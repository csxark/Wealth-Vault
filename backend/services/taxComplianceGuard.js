import washSaleTracker from './washSaleTracker.js';
import taxAnalytics from '../utils/taxAnalytics.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * TaxComplianceGuard (#482)
 * Sentinel service that intercepts purchase intents to enforce tax policy.
 */
class TaxComplianceGuard {
    /**
     * Evaluates if a purchase is safe from a tax compliance perspective.
     * @param {string} userId - User initiating purchase.
     * @param {string} assetSymbol - Asset to purchase.
     * @param {string} vaultId - Target entity vault.
     */
    async evaluatePurchaseSafe(userId, assetSymbol, vaultId) {
        logInfo(`🛡️ Guarding purchase: ${assetSymbol} in Vault ${vaultId}`);

        // 1. Check for basic Wash-Sale violation on the exact asset
        const directViolation = await washSaleTracker.checkViolation(userId, assetSymbol, vaultId);
        if (directViolation.isViolation) {
            return {
                allowed: false,
                reason: 'WASH_SALE_RESTRICTION',
                message: `Purchase of ${assetSymbol} is blocked due to recent tax-loss harvesting.`,
                restrictionExpires: directViolation.expiresAt
            };
        }

        // 2. Check for "Substantially Identical" violations (Proxies)
        // If they just harvested SPY, they shouldn't buy VOO in another vault.
        const activeWindows = await this.getActiveWindows(userId);
        for (const window of activeWindows) {
            if (taxAnalytics.areAssetsSubstantiallyIdentical(assetSymbol, window.assetSymbol)) {
                return {
                    allowed: false,
                    reason: 'SUBSTANTIALLY_IDENTICAL_RESTRICTION',
                    message: `Purchase of ${assetSymbol} is blocked because you recently harvested ${window.assetSymbol}, which is substantially identical.`,
                    restrictionExpires: window.windowEnd
                };
            }
        }

        return { allowed: true };
    }

    /**
     * Helper to get active restriction windows.
     */
    async getActiveWindows(userId) {
        // In real app, this calls db.select() from washSaleWindows
        return [];
    }
}

export default new TaxComplianceGuard();
