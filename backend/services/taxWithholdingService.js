import db from '../config/db.js';
import { withholdingLedger, vaults, taxResidencyHistory } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import residencyEngine from './residencyEngine.js';
import treatyService from './treatyService.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Tax Withholding Service (L3)
 * Real-time calculation of estimated tax dues based on location-linked income streams.
 * Analyzes cross-border movements to determine withholding requirements.
 */
class TaxWithholdingService {
    /**
     * Estimate Withholding for an income event
     */
    async estimateWithholding(userId, vaultId, amount, type) {
        try {
            // 1. Determine Source (Vault Location) and Target (User Residency)
            const vault = await db.query.vaults.findFirst({
                where: eq(vaults.id, vaultId)
            });

            const sourceJurisdiction = vault?.metadata?.jurisdiction || 'US';
            const targetJurisdiction = await residencyEngine.getPrimaryJurisdiction(userId);

            // 2. Fetch Treaty Protected Rate
            const effectiveRate = await treatyService.getReducedRate(sourceJurisdiction, targetJurisdiction, type);
            const taxAmount = amount * (effectiveRate / 100);

            // 3. Log to Withholding Ledger
            const [entry] = await db.insert(withholdingLedger).values({
                userId,
                vaultId,
                amount: amount.toString(),
                taxAmount: taxAmount.toString(),
                sourceJurisdiction,
                targetJurisdiction,
                withholdingType: type,
                treatyApplied: effectiveRate < 30, // Assuming 30 is standard
                status: 'estimated'
            }).returning();

            logInfo(`[Withholding Service] Estimated ${taxAmount} withheld for ${type} income (${sourceJurisdiction}->${targetJurisdiction})`);

            return entry;
        } catch (error) {
            logError('[Withholding Service] Estimation failed:', error);
            throw error;
        }
    }

    /**
     * Get Aggregated Withholding Report for a user
     */
    async getWithholdingReport(userId) {
        const history = await db.query.withholdingLedger.findMany({
            where: eq(withholdingLedger.userId, userId),
            orderBy: (t, { desc }) => [desc(t.createdAt)]
        });

        const totalWithheld = history.reduce((sum, h) => sum + parseFloat(h.taxAmount), 0);

        return {
            totalWithheld,
            jurisdictionBreakdown: {}, // Map of country codes to total tax
            history
        };
    }
}

export default new TaxWithholdingService();
