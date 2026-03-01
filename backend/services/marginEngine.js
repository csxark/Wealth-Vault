import db from '../config/db.js';
import { marginRequirements, collateralSnapshots, investments, debts, bankAccounts } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Margin Engine Service (#447)
 * Continuously calculates LTV ratios and maintenance requirements.
 */
class MarginEngine {
    /**
     * Calculate Current Risk Position for a user
     */
    async calculateRiskPosition(userId) {
        logInfo(`[Margin Engine] Calculating risk position for user ${userId}`);

        try {
            // 1. Get Total Collateral Value (Investments + Cash)
            const [assetValueResult] = await db.select({
                total: sql`SUM(CAST(current_price AS NUMERIC) * CAST(quantity AS NUMERIC))`
            }).from(investments).where(eq(investments.userId, userId));

            const [cashValueResult] = await db.select({
                total: sql`SUM(CAST(balance AS NUMERIC))`
            }).from(bankAccounts).where(eq(bankAccounts.userId, userId));

            const collateralValue = parseFloat(assetValueResult?.total || 0) + parseFloat(cashValueResult?.total || 0);

            // 2. Get Total Outstanding Debt
            const [debtResult] = await db.select({
                total: sql`SUM(CAST(amount AS NUMERIC))`
            }).from(debts).where(eq(debts.userId, userId));

            const totalDebt = parseFloat(debtResult?.total || 0);

            // 3. Calculate LTV
            const ltv = collateralValue > 0 ? (totalDebt / collateralValue) * 100 : 0;

            // 4. Determine Margin Status
            let status = 'safe';
            if (ltv > 80) status = 'margin_call';
            else if (ltv > 65) status = 'danger';
            else if (ltv > 50) status = 'warning';

            // 5. Calculate Maintenance Requirement (Aggregate)
            // In a real system, we'd iterate through each asset's specific requirement
            const maintenanceRequirement = collateralValue * 0.25; // 25% global estimate
            const excessLiquidity = collateralValue - totalDebt - maintenanceRequirement;

            // 6. Save Snapshot
            const [snapshot] = await db.insert(collateralSnapshots).values({
                userId,
                totalCollateralValue: collateralValue.toString(),
                totalOutstandingDebt: totalDebt.toString(),
                currentLtv: ltv.toString(),
                marginStatus: status,
                excessLiquidity: excessLiquidity.toString(),
                metadata: {
                    calculation_timestamp: new Date().toISOString(),
                    asset_count: assetValueResult?.total ? 1 : 0 // Simplified
                }
            }).returning();

            return {
                ltv: ltv.toFixed(2),
                status,
                collateralValue,
                totalDebt,
                excessLiquidity,
                snapshotId: snapshot.id
            };
        } catch (error) {
            logError(`[Margin Engine] Risk calculation failed:`, error);
            throw error;
        }
    }

    /**
     * Set specific margin requirements for an asset class
     */
    async updateRequirement(userId, assetType, initial, maintenance) {
        return await db.insert(marginRequirements).values({
            userId,
            assetType,
            initialMargin: initial.toString(),
            maintenanceMargin: maintenance.toString(),
            liquidationThreshold: (maintenance * 0.6).toString(),
            isActive: true
        }).onConflictDoUpdate({
            target: [marginRequirements.userId, marginRequirements.assetType],
            set: {
                initialMargin: initial.toString(),
                maintenanceMargin: maintenance.toString(),
                updatedAt: new Date()
            }
        }).returning();
    }
}

export default new MarginEngine();
