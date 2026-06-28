import crtOptimizer from './crtOptimizer.js';
import { logInfo } from '../utils/logger.js';

/**
 * Tax Deduction Calculator (#535)
 * Projects the immediate charitable income tax deduction for a CRT contribution.
 */
class TaxDeductionCalculator {
    /**
     * Projects the deduction based on the present value of the future gift.
     */
    async projectDeduction(params) {
        const { initialValue, payoutRate, term, irsRate, type, marginalTaxRate = 0.37 } = params;

        logInfo(`[Tax Calculator] Projecting deduction for CRT: $${initialValue} at ${payoutRate * 100}%`);

        const model = await crtOptimizer.modelCRT({
            initialValue,
            payoutRate,
            term,
            irsRate,
            type
        });

        if (!model.isCompliant) {
            return {
                isCompliant: false,
                reason: model.reason
            };
        }

        const deductionAmount = parseFloat(model.remainderPV);
        const taxSavings = deductionAmount * marginalTaxRate;

        return {
            isCompliant: true,
            deductionAmount,
            taxSavings,
            marginalRate: marginalTaxRate,
            explanation: `Based on a Section 7520 rate of ${irsRate * 100}%, your immediate charitable deduction is $${deductionAmount.toLocaleString()}.`
        };
    }
}

export default new TaxDeductionCalculator();
