import db from '../config/db.js';
import { trustStructures, beneficiaryClasses, vaults } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import vaultService from './vaultService.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Beneficiary Distribution Engine (#511)
 * Manages the allocation and actual movement of assets from trusts to heirs.
 * Focuses on:
 * - Multi-generational fairness.
 * - Generation-Skipping Transfer (GST) tax compliance.
 * - Automated waterfall distribution logic.
 */
class BeneficiaryDistributionEngine {
    /**
     * Set up a multi-generational distribution waterfall.
     */
    async calculateWaterfall(trustId, distributionAmount) {
        logInfo(`[Distribution Engine] Calculating waterfall for trust ${trustId} ($${distributionAmount})`);

        try {
            // 1. Load All Beneficiary Classes
            const heirs = await db.select().from(beneficiaryClasses).where(eq(beneficiaryClasses.trustId, trustId));

            if (!heirs.length) return { success: false, reason: 'No beneficiaries defined' };

            const distributions = heirs.map(h => {
                const amount = distributionAmount * parseFloat(h.allocationPrc);

                // GST Check: Skip Persons (Grandchildren and below)
                const isSkipPerson = h.generation > 1;
                const gstPotential = isSkipPerson ? (amount * 0.40) : 0; // Standard 40% GST tax

                return {
                    beneficiaryName: h.beneficiaryName,
                    generation: h.generation,
                    amountRequested: parseFloat(amount.toFixed(2)),
                    gstTaxEstimate: parseFloat(gstPotential.toFixed(2)),
                    netAmount: parseFloat((amount - gstPotential).toFixed(2)),
                    vaultId: h.vaultId,
                    isSkipPerson
                };
            });

            return {
                totalDistribution: distributionAmount,
                breakdown: distributions,
                totalGstLeakage: distributions.reduce((sum, d) => sum + d.gstTaxEstimate, 0)
            };
        } catch (error) {
            logError('[Distribution Engine] Waterfall calculation failed:', error);
            throw error;
        }
    }

    /**
     * Execute the distribution from the trust source vault to all beneficiary vaults.
     */
    async executeDistribution(userId, trustId, amount) {
        logInfo(`[Distribution Engine] Executing $${amount} distribution for ${trustId}`);

        try {
            const trust = await db.query.trustStructures.findFirst({ where: eq(trustStructures.id, trustId) });
            const waterfall = await this.calculateWaterfall(trustId, amount);

            for (const item of waterfall.breakdown) {
                if (item.vaultId && trust.annuityPayerVaultId) {
                    await vaultService.sweepCashToTarget(
                        userId,
                        trust.annuityPayerVaultId,
                        item.vaultId,
                        item.netAmount
                    );
                    logInfo(`[Distribution Engine] Moved $${item.netAmount} to ${item.beneficiaryName}'s vault`);
                }
            }

            return waterfall;
        } catch (error) {
            logError('[Distribution Engine] Execution failed:', error);
            throw error;
        }
    }
}

export default new BeneficiaryDistributionEngine();
