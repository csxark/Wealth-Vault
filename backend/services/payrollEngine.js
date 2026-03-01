import db from '../config/db.js';
import { taxDeductionLedger, payrollBuckets } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Payroll Engine (L3)
 * Automated calculation of net-pay, social security, and tax withholdings.
 */
class PayrollEngine {
    /**
     * Calculate Paycheck Breakdown
     */
    async calculatePaycheck(grossAmount, jurisdiction = 'US-CA') {
        // Mocked Simplified Tax Logic
        const federalIncomeTax = grossAmount * 0.15;
        const socialSecurity = grossAmount * 0.062;
        const medicare = grossAmount * 0.0145;
        const stateTax = grossAmount * 0.05;

        const totalDeductions = federalIncomeTax + socialSecurity + medicare + stateTax;
        const netPay = grossAmount - totalDeductions;

        return {
            grossAmount,
            deductions: {
                federalIncomeTax,
                socialSecurity,
                medicare,
                stateTax
            },
            totalDeductions,
            netPay,
            jurisdiction
        };
    }

    /**
     * Record Withholdings to Ledger
     */
    async recordWithholdings(userId, entityId, breakdown) {
        logInfo(`[Payroll Engine] Recording tax withholdings for entity ${entityId}`);

        const entries = [
            { type: 'federal_income_tax', amount: breakdown.deductions.federalIncomeTax },
            { type: 'social_security', amount: breakdown.deductions.socialSecurity },
            { type: 'medicare', amount: breakdown.deductions.medicare },
            { type: 'state_tax', amount: breakdown.deductions.stateTax }
        ];

        for (const entry of entries) {
            await db.insert(taxDeductionLedger).values({
                userId,
                entityId,
                taxType: entry.type,
                amount: entry.amount.toString(),
                jurisdiction: breakdown.jurisdiction,
                status: 'pending_filing',
                filingDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days out
            });
        }
    }

    /**
     * Get Aggregated Tax Liability
     */
    async getPendingTaxLiability(entityId) {
        const pending = await db.query.taxDeductionLedger.findMany({
            where: eq(taxDeductionLedger.entityId, entityId)
        });

        return pending.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    }
}

export default new PayrollEngine();
