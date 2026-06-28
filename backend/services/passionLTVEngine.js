import db from '../config/db.js';
import { passionAssets, passionLoanContracts, vaults } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';
import passionAppraiser from './passionAppraiser.js';

/**
 * Passion LTV Engine (#536)
 * Calculates Loan-to-Value ratios and manages collateralized lending
 * against illiquid luxury assets.
 */
class PassionLTVEngine {
    /**
     * Get maximum allowable loan for an asset based on its category.
     */
    getMaxLTV(category) {
        const ltvLimits = {
            'art': 0.40,      // Art is highly illiquid, 40% LTV max
            'car': 0.65,      // Blue-chip cars are more liquid, 65% LTV
            'watch': 0.70,    // High-end watches have active secondary markets, 70% LTV
            'wine': 0.30,     // Storage risk is high, 30% LTV
            'collectible': 0.25 // General collectibles, 25% LTV
        };
        return ltvLimits[category] || 0.20;
    }

    /**
     * Model a loan against a passion asset.
     */
    async modelLoan(assetId, requestedAmount = null) {
        const asset = await db.query.passionAssets.findFirst({
            where: eq(passionAssets.id, assetId)
        });

        if (!asset) throw new Error('Asset not found');

        const currentVal = parseFloat(asset.currentEstimatedValue || 0);
        if (currentVal <= 0) throw new Error('Asset has no valuation data');

        const maxLTV = this.getMaxLTV(asset.assetCategory);
        const maxLoan = currentVal * maxLTV;

        const effectiveLoan = requestedAmount ? Math.min(requestedAmount, maxLoan) : maxLoan;
        const interestRate = 0.045 + (1 - maxLTV) * 0.05; // Risk-adjusted rate (base 4.5% + LTV kicker)

        return {
            assetId: asset.id,
            assetName: asset.name,
            currentValue: currentVal,
            maxLTV,
            maxLoanAmount: maxLoan,
            proposedLoan: effectiveLoan,
            interestRate: interestRate.toFixed(4),
            monthlyInterest: ((effectiveLoan * interestRate) / 12).toFixed(2),
            isViable: effectiveLoan > 0
        };
    }

    /**
     * Execute and fund a loan against an asset.
     */
    async originateLoan(userId, assetId, loanAmount, vaultId) {
        logInfo(`[Passion LTV] Originating $${loanAmount} loan against asset ${assetId}`);

        const model = await this.modelLoan(assetId, loanAmount);

        return await db.transaction(async (tx) => {
            // 1. Create the loan contract
            const [contract] = await tx.insert(passionLoanContracts).values({
                userId,
                assetId,
                loanAmount: loanAmount.toString(),
                interestRate: model.interestRate,
                ltvRatio: (loanAmount / model.currentValue).toFixed(4),
                vaultId, // Where the capital is originates from
                status: 'active',
                expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1-year term
            }).returning();

            // 2. Mark asset as collateralized (lock it from sale/transfer)
            await tx.update(passionAssets)
                .set({ status: 'collateralized' })
                .where(eq(passionAssets.id, assetId));

            // 3. In a real system, move funds to user's liquidity vault
            // This would involve ledgerService.postLedgerEntry(...)

            return contract;
        });
    }

    /**
     * Check for Margin Calls on passion assets.
     */
    async checkMarginStatus(assetId) {
        const asset = await db.query.passionAssets.findFirst({
            where: eq(passionAssets.id, assetId),
            with: { loans: true }
        });

        if (!asset || !asset.loans || asset.loans.length === 0) return { status: 'safe' };

        const activeLoan = asset.loans.find(l => l.status === 'active');
        if (!activeLoan) return { status: 'safe' };

        const currentVal = parseFloat(asset.currentEstimatedValue);
        const currentLTV = parseFloat(activeLoan.loanAmount) / currentVal;
        const limitLTV = this.getMaxLTV(asset.assetCategory) + 0.10; // 10% buffer before liquidation

        if (currentLTV > limitLTV) {
            return { status: 'margin_call', currentLTV, limitLTV };
        }

        return { status: 'safe', currentLTV };
    }
}

export default new PassionLTVEngine();
