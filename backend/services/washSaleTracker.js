import db from '../config/db.js';
import { washSaleWindows, taxLots, vaults, users } from '../db/schema.js';
import { eq, and, gt, lt, sql, or, inArray } from 'drizzle-orm';

/**
 * WashSaleTracker (#482)
 * Prevents "substantially identical" asset purchases across all user entities (Personal, Trust, LLC)
 * for 30 days before/after a loss is harvested.
 */
class WashSaleTracker {
    /**
     * Registers a new wash-sale window after a loss harvest.
     * Overarching protection across all legal entities.
     */
    async registerHarvestEvent(userId, assetSymbol, harvestDate = new Date()) {
        const windowStart = new Date(harvestDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        const windowEnd = new Date(harvestDate.getTime() + 30 * 24 * 60 * 60 * 1000);

        // Fetch all user vaults (Personal + Corporate/Trust entities they own)
        const userVaults = await db.select({ id: vaults.id }).from(vaults).where(eq(vaults.ownerId, userId));
        const allVaultIds = userVaults.map(v => v.id);

        const [window] = await db.insert(washSaleWindows).values({
            userId,
            assetSymbol,
            windowStart,
            windowEnd,
            restrictedVaultIds: allVaultIds,
            reason: `Global Tax Loss Harvest Restriction: ${assetSymbol}`
        }).returning();

        return window;
    }

    /**
     * Checks if a proposed purchase would trigger a wash-sale violation.
     */
    async checkViolation(userId, assetSymbol, vaultId, purchaseDate = new Date()) {
        const activeWindows = await db.select()
            .from(washSaleWindows)
            .where(and(
                eq(washSaleWindows.userId, userId),
                eq(washSaleWindows.assetSymbol, assetSymbol),
                eq(washSaleWindows.isActive, true),
                lt(washSaleWindows.windowStart, purchaseDate),
                gt(washSaleWindows.windowEnd, purchaseDate)
            ));

        if (activeWindows.length > 0) {
            // Check if specifically this vault is restricted (usually all are)
            const restrictedVaults = activeWindows[0].restrictedVaultIds || [];
            if (restrictedVaults.includes(vaultId)) {
                return {
                    isViolation: true,
                    reason: activeWindows[0].reason,
                    expiresAt: activeWindows[0].windowEnd
                };
            }
        }

        return { isViolation: false };
    }

    /**
     * Aggressive Audit: Scans for cross-entity violations that already occurred.
     * Important for catching manual trades made outside the platform.
     */
    async auditCrossEntityViolations(userId) {
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;

        // 1. Get all loss-sales in the last 60 days
        const lossSales = await db.select().from(taxLots)
            .where(and(
                eq(taxLots.userId, userId),
                eq(taxLots.isSold, true),
                sql`${taxLots.soldPrice} < ${taxLots.purchasePrice}`
            ));

        const violations = [];

        for (const sale of lossSales) {
            const saleDate = new Date(sale.soldDate);
            const windowStart = new Date(saleDate.getTime() - thirtyDays);
            const windowEnd = new Date(saleDate.getTime() + thirtyDays);

            // 2. Find any purchases of the same asset in the 61-day window around the sale
            const purchases = await db.select().from(taxLots)
                .where(and(
                    eq(taxLots.userId, userId),
                    eq(taxLots.assetSymbol, sale.assetSymbol),
                    eq(taxLots.isSold, false), // currently holding or sold later
                    gt(taxLots.purchaseDate, windowStart),
                    lt(taxLots.purchaseDate, windowEnd)
                ));

            if (purchases.length > 0) {
                violations.push({
                    lossSale: sale,
                    triggeringPurchases: purchases,
                    period: `${windowStart.toLocaleDateString()} to ${windowEnd.toLocaleDateString()}`
                });
            }
        }

        return violations;
    }

    /**
     * Batch deactivate windows that are no longer relevant.
     */
    async deactivateExpiredWindows() {
        const now = new Date();
        await db.update(washSaleWindows)
            .set({ isActive: false })
            .where(lt(washSaleWindows.windowEnd, now));
    }
}

export default new WashSaleTracker();
