import { logInfo } from '../utils/logger.js';

/**
 * TaxStrategyEngine - Advanced logic for inter-entity friction (#476)
 * Handles OECD-compliant withholding and gift tax simulations.
 */
class TaxStrategyEngine {
    constructor() {
        this.treatyRates = {
            'US-UK': 0.0,
            'US-CA': 0.15,
            'UK-EU': 0.05
        };
    }

    /**
     * Calculate the tax friction for a transfer between two entities
     */
    calculateFriction(fromEntity, toEntity) {
        if (!fromEntity || !toEntity) return 0.02; // Default conservative friction
        if (fromEntity.id === toEntity.id) return 0.0;

        // 1. Corporate to Personal (Dividends/Draws)
        if (toEntity.type === 'personal') {
            return this.getDistributionTax(fromEntity);
        }

        // 2. Inter-Company (Lending vs Contribution)
        if (fromEntity.type === 'corp' && toEntity.type === 'corp') {
            return 0.10; // Corporate income tax shift
        }

        // 3. Trust distributions
        if (fromEntity.type === 'trust') {
            return 0.01; // Processing friction, usually pass-through
        }

        // 4. Default Friction
        return 0.03;
    }

    getDistributionTax(entity) {
        switch (entity.type) {
            case 'corp': return 0.238; // Federal Dividend + NIIT
            case 'llc': return 0.153;  // Self-Employment Tax equivalent
            case 'trust': return 0.37; // Top marginal rate if not distributed properly
            default: return 0.20;
        }
    }

    /**
     * Jurisdictional Transfer Fees
     */
    getJurisdictionFee(fromCountry = 'US', toCountry = 'US') {
        if (fromCountry === toCountry) return 0.001; // Internal wire

        const key = `${fromCountry}-${toCountry}`;
        return this.treatyRates[key] || 0.05; // 5% default cross-border friction
    }

    /**
     * Estimated Time of Arrival (Impacts liquidity cost)
     */
    getEstimatedDelayDays(type) {
        const delays = {
            'direct_transfer': 3,
            'debt_repayment': 1,
            'asset_sale': 5,
            'crypto_bridge': 0.1
        };
        return delays[type] || 2;
    }
}

export default new TaxStrategyEngine();
export { TaxStrategyEngine };
