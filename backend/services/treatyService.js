import db from '../config/db.js';
import { jurisdictionTaxRules } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { logInfo } from '../utils/logger.js';

/**
 * Treaty Service (L3)
 * Implementation of Double Taxation Avoidance Agreement (DTAA) logic.
 * Minimizes withholding tax on cross-border interest/dividends based on source-target treaties.
 */
class TreatyService {
    /**
     * Get reduced withholding rate based on DTAA
     * @param {string} sourceCountry - Where the income is generated
     * @param {string} targetCountry - Where the recipient is a tax resident
     * @param {string} incomeType - 'dividend' or 'interest'
     */
    async getReducedRate(sourceCountry, targetCountry, incomeType) {
        try {
            if (sourceCountry === targetCountry) return 0; // Local treatment

            const sourceRule = await db.query.jurisdictionTaxRules.findFirst({
                where: eq(jurisdictionTaxRules.jurisdictionCode, sourceCountry)
            });

            if (!sourceRule || !sourceRule.treatyNetwork) {
                // Return standard rate if no treaty exists
                return incomeType === 'dividend'
                    ? parseFloat(sourceRule?.dividendWithholdingRate || 30)
                    : parseFloat(sourceRule?.interestWithholdingRate || 30);
            }

            // Check if treaty exists for target country
            const treatyRates = sourceRule.treatyNetwork;
            const reducedRate = treatyRates[targetCountry]?.[incomeType];

            if (reducedRate !== undefined) {
                logInfo(`[Treaty Service] DTAA Found: ${sourceCountry}->${targetCountry}. Reduced ${incomeType} rate: ${reducedRate}%`);
                return parseFloat(reducedRate);
            }

            // Fallback to standard
            return incomeType === 'dividend'
                ? parseFloat(sourceRule.dividendWithholdingRate)
                : parseFloat(sourceRule.interestWithholdingRate);
        } catch (error) {
            return 30; // Maximum safety fallback
        }
    }

    /**
     * Map DTAA Network (Admin helper)
     */
    async seedDTAANetwork(jurisdiction, networkMap) {
        await db.update(jurisdictionTaxRules)
            .set({ treatyNetwork: networkMap })
            .where(eq(jurisdictionTaxRules.jurisdictionCode, jurisdiction));
    }
}

export default new TreatyService();
