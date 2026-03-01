import irsRateTracker from './irsRateTracker.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * GRAT Calculator (#511)
 * Models Grantor Retained Annuity Trusts, focusing on "Zeroed-Out" structures.
 * This is used to pass asset growth to heirs tax-free by setting the 
 * taxable gift value to near zero.
 */
class GRATCalculator {
    /**
     * Calculate the required annual annuity for a Zeroed-Out GRAT.
     * @param {number} principal - Starting asset value.
     * @param {number} termYears - Duration of the GRAT (typically 2-10 years).
     * @param {number} hurdleRate - Section 7520 rate (decimal).
     * @param {number} growthPct - Percent increasing payments (e.g. 0.20 for 20% max allowed).
     */
    async calculateZeroedOutAnnuity(principal, termYears, hurdleRate = null, growthPct = 0) {
        logInfo(`[GRAT Calculator] Calculating zeroed-out annuity for $${principal} over ${termYears} years`);

        const r = hurdleRate || await irsRateTracker.getCurrentRate();
        const n = termYears;

        if (growthPct === 0) {
            // Level Annuity Payment Formula:
            // PMT = (P * r) / (1 - (1 + r)^-n)
            const annuity = (principal * r) / (1 - Math.pow(1 + r, -n));
            return {
                annualPayment: parseFloat(annuity.toFixed(2)),
                totalPayments: parseFloat((annuity * n).toFixed(2)),
                hurdleRate: r,
                isEscalating: false
            };
        } else {
            // Escalating Annuity (Section 2702 allows up to 20% increase each year)
            // PMT1 = PV / sum[(1 + g)^(i-1) / (1 + r)^i] for i = 1 to n
            let discountSum = 0;
            for (let i = 1; i <= n; i++) {
                discountSum += Math.pow(1 + growthPct, i - 1) / Math.pow(1 + r, i);
            }

            const pmt1 = principal / discountSum;
            const payments = [];
            let total = 0;

            for (let i = 0; i < n; i++) {
                const stepPayment = pmt1 * Math.pow(1 + growthPct, i);
                payments.push(parseFloat(stepPayment.toFixed(2)));
                total += stepPayment;
            }

            return {
                firstYearAnnuity: parseFloat(pmt1.toFixed(2)),
                annualIncrease: growthPct,
                paymentSchedule: payments,
                totalPayments: parseFloat(total.toFixed(2)),
                hurdleRate: r,
                isEscalating: true
            };
        }
    }

    /**
     * Project the "Excess Return" that passes tax-free to beneficiaries.
     * @param {number} principal 
     * @param {number} actualAssetReturn - Expected annual asset growth (e.g. 0.10 for 10%).
     * @param {object} annuityParams - From calculateZeroedOutAnnuity.
     */
    projectTaxFreeTransfer(principal, actualAssetReturn, annuityParams) {
        let currentBalance = principal;
        const n = annuityParams.isEscalating ? annuityParams.paymentSchedule.length : (annuityParams.totalPayments / annuityParams.annualPayment);
        const results = [];

        for (let year = 1; year <= n; year++) {
            const growth = currentBalance * actualAssetReturn;
            const payment = annuityParams.isEscalating ? annuityParams.paymentSchedule[year - 1] : annuityParams.annualPayment;

            const starting = currentBalance;
            currentBalance = (currentBalance + growth) - payment;

            results.push({
                year,
                startingValue: starting,
                growthGenerated: growth,
                annuityPaidBackToGrantor: payment,
                endingValue: Math.max(0, currentBalance)
            });
        }

        const taxFreeTransfer = Math.max(0, currentBalance);
        return {
            projection: results,
            finalTaxFreeTransfer: parseFloat(taxFreeTransfer.toFixed(2)),
            assetEfficiency: (taxFreeTransfer / principal).toFixed(2)
        };
    }
}

export default new GRATCalculator();
