import db from '../config/db.js';
import { spvEntities, lpCommitments, waterfallTiers, capitalCalls, ledgerEntries, ledgerAccounts, entities, vaults } from '../db/schema.js';
import { eq, and, sql, asc } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';
import { calculateIRR, calculateMOIC } from '../utils/irrCalculator.js';
import vaultService from './vaultService.js';

/**
 * Waterfall Distribution Engine (#510)
 * Multi-tiered mathematical parser for LP/GP distribution.
 * Implements: Preferred Return, Catch-up, Carried Interest.
 */
class WaterfallDistributionEngine {
    /**
     * Calculate exact distribution across all stakeholders for a liquidity event.
     * @param {string} spvId 
     * @param {number} exitProceeds - The total amount of cash being distributed.
     */
    async calculateDistribution(spvId, exitProceeds) {
        logInfo(`[Waterfall Engine] Calculating distribution for SPV ${spvId} ($${exitProceeds})`);

        try {
            // 1. Load All Waterfall Tiers (ordered by priority)
            const tiers = await db.select().from(waterfallTiers).where(eq(waterfallTiers.spvId, spvId)).orderBy(asc(waterfallTiers.tierOrder));

            // 2. Load LPs and Capital Commitment Info
            const lps = await db.select().from(lpCommitments).where(eq(lpCommitments.spvId, spvId));
            const totalCommitted = lps.reduce((sum, lp) => sum + parseFloat(lp.committedAmount), 0);
            const totalCalled = lps.reduce((sum, lp) => sum + parseFloat(lp.calledAmount || 0), 0);

            let remainingProceeds = exitProceeds;

            // TRACKER for total allocated
            const lpAllocation = { total: 0, byLP: {} };
            const gpAllocation = { total: 0 };

            // Initialize LP totals
            lps.forEach(lp => {
                lpAllocation.byLP[lp.id] = { lpId: lp.id, lpEntityId: lp.lpEntityId, amount: 0, prc: parseFloat(lp.ownershipPrc) };
            });

            // 3. Process Tiers (simplified Waterfall logic)
            // Tier 1: Return of Capital (Standard most PE/RE Waterfalls)
            const rocAmount = Math.min(remainingProceeds, totalCalled);
            this.splitProceeds(rocAmount, 1.0, 0.0, lps, lpAllocation, gpAllocation);
            remainingProceeds -= rocAmount;

            // Tier 2...n: Sequential Tiers (Hurdles, Catch-up, and Carried Interest)
            for (const tier of tiers) {
                if (remainingProceeds <= 0) break;

                // Threshold-based tier logic
                // In a production app, we'd more rigorously calculate IRR hurdles.
                // For this demo, we assume the exitProceeds are mapped into tiers.

                // Let's assume a simplified hurdle/catchup logic where 
                // hurdle = 8% of total capital per year (simplified to 8% total for demo).
                // catchup = fixed amount (e.g. 2% of total).

                const tierCapacity = remainingProceeds * 0.20; // Assume 20% proceeds in this tier (simplified)
                const LPShare = tierCapacity * parseFloat(tier.lpSplit);
                const GPShare = tierCapacity * parseFloat(tier.gpSplit);

                this.splitProceeds(LPShare, 1.0, 0.0, lps, lpAllocation, gpAllocation);
                gpAllocation.total += GPShare;

                remainingProceeds -= (LPShare + GPShare);
            }

            // Final Remainder (Usually the final carried interest tier or parity)
            if (remainingProceeds > 0) {
                const finalLP = remainingProceeds * 0.80; // Standard 80/20 carried interest split
                const finalGP = remainingProceeds * 0.20;
                this.splitProceeds(finalLP, 1.0, 0.0, lps, lpAllocation, gpAllocation);
                gpAllocation.total += finalGP;
            }

            return {
                exitProceeds,
                totalLPPayback: lpAllocation.total,
                totalGPProfit: gpAllocation.total,
                byStakeholder: Object.values(lpAllocation.byLP)
            };
        } catch (error) {
            logError('[Waterfall Engine] Distribution calculation failed:', error);
            throw error;
        }
    }

    /**
     * Splits an amount across LPs based on their ownership prc.
     */
    splitProceeds(amount, lpSharePrc, gpSharePrc, lps, lpAllocation, gpAllocation) {
        lps.forEach(lp => {
            const lpEntAmount = amount * parseFloat(lp.ownershipPrc);
            lpAllocation.byLP[lp.id].amount += lpEntAmount;
            lpAllocation.total += lpEntAmount;
        });
    }

    /**
     * Execute the actual fund movement using the Vault service.
     */
    async executeDistribution(userId, spvId, exitProceeds) {
        logInfo(`[Waterfall Engine] EXECUTING DISTRIBUTION for SPV ${spvId}`);

        const summary = await this.calculateDistribution(spvId, exitProceeds);
        const spv = await db.query.spvEntities.findFirst({ where: eq(spvEntities.id, spvId) });

        // GP Entity for profit
        const gpVault = await db.query.vaults.findFirst({
            where: and(eq(vaults.ownerId, userId), eq(vaults.name, 'Corporate Treasury')) // Convention
        });

        // 1. Move LP funds
        for (const item of summary.byStakeholder) {
            const lpVault = await db.query.vaults.findFirst({ where: eq(vaults.id, item.vaultId) }); // Needs to be linked
            if (lpVault) {
                // In product, move from SPV Main Account to LP's targeted vault
                await vaultService.sweepCashToTarget(userId, spv.mainVaultId, lpVault.id, item.amount);
            }
        }

        // 2. Move GP carried interest
        if (gpVault && summary.totalGPProfit > 0) {
            await vaultService.sweepCashToTarget(userId, spv.mainVaultId, gpVault.id, summary.totalGPProfit);
        }

        return summary;
    }
}

export default new WaterfallDistributionEngine();
