import db from '../config/db.js';
import { charitableTrusts, crtProjections } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * CRT Optimizer Service (#535)
 * Mathematically models Charitable Remainder Trusts (CRAT/CRUT).
 * Ensures compliance with the IRS "10% Remainder" Rule.
 */
class CRTOptimizer {
    /**
     * Calculates the Present Value (PV) of the remainder interest.
     * @param {number} initialValue - Initial contribution FMV.
     * @param {number} payoutRate - Annual payout % (e.g., 0.05).
     * @param {number} term - Years (e.g., 20).
     * @param {number} irsRate - Section 7520 rate (e.g., 0.054).
     * @param {string} type - 'CRAT' or 'CRUT'.
     */
    calculateRemainderPV(initialValue, payoutRate, term, irsRate, type = 'CRAT') {
        if (type === 'CRAT') {
            // PV of Annuity Factor = (1 - (1 + r)^-n) / r
            const annualPayout = initialValue * payoutRate;
            const annuityFactor = (1 - Math.pow(1 + irsRate, -term)) / irsRate;
            const pvOfPayouts = annualPayout * annuityFactor;
            const remainderPV = initialValue - pvOfPayouts;
            return remainderPV;
        } else {
            // CRUT Remainder PV = InitialValue * (1 - PayoutRate)^Term
            // This is a simplified Unitrust model. Actual IRS tables use Adjusted Payout Rates.
            const remainderPV = initialValue * Math.pow(1 - payoutRate, term);
            return remainderPV;
        }
    }

    /**
     * Models a CRT and verifies compliance.
     */
    async modelCRT(params) {
        const { initialValue, payoutRate, term, irsRate, type } = params;

        // 1. Check 5% Minimum Payout Rule
        if (payoutRate < 0.05) {
            return { compliant: false, reason: 'IRS requires a minimum payout rate of 5%.' };
        }

        // 2. Calculate Remainder PV
        const remainderPV = this.calculateRemainderPV(initialValue, payoutRate, term, irsRate, type);
        const remainderPercentage = remainderPV / initialValue;

        // 3. Check 10% Remainder Rule
        const isCompliant = remainderPercentage >= 0.10;

        return {
            initialValue,
            payoutRate,
            term,
            irsRate,
            type,
            remainderPV: remainderPV.toFixed(2),
            remainderPercentage: (remainderPercentage * 100).toFixed(2) + '%',
            isCompliant,
            reason: isCompliant ? 'Compliant with IRS 10% rule.' : 'FAILED: Remainder must be at least 10% of initial FMV.'
        };
    }

    /**
     * Optimized Search: Find the Maximum allowable payout rate.
     */
    async findMaxPayoutRate(initialValue, term, irsRate, type = 'CRAT') {
        let low = 0.05;
        let high = 0.50; // IRS Cap
        let maxRate = low;

        for (let i = 0; i < 20; i++) { // Binary search for precision
            let mid = (low + high) / 2;
            const model = await this.modelCRT({ initialValue, payoutRate: mid, term, irsRate, type });

            if (model.isCompliant) {
                maxRate = mid;
                low = mid;
            } else {
                high = mid;
            }
        }

        return maxRate;
    }
}

export default new CRTOptimizer();
