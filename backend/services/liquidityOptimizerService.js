import db from '../config/db.js';
import { transferPaths, entityTaxRules, optimizationRuns, vaults } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';
import marketData from './marketData.js';
import GraphSolvers from '../utils/graphSolvers.js';

/**
 * LiquidityOptimizerService (#476)
 * Uses a weighted graph algorithm to find the cheapest pathway for capital.
 * Costs include: FX spreads, entity-to-entity withholding taxes, and platform fees.
 */
class LiquidityOptimizerService {
    /**
     * Finds the mathematically optimal path from source to target.
     * @param {string} userId
     * @param {string} destinationVaultId
     * @param {number} amountUSD
     */
    async findOptimalPath(userId, destinationVaultId, amountUSD) {
        logInfo(`[LiquidityOptimizer] Optimizing path for $${amountUSD} to vault ${destinationVaultId}`);

        // 1. Load data
        const allPaths = await db.select().from(transferPaths).where(eq(transferPaths.userId, userId));
        const taxRules = await db.select().from(entityTaxRules).where(eq(entityTaxRules.userId, userId));
        const allVaults = await db.select().from(vaults).where(eq(vaults.userId, userId));

        // 2. Build adjacency list
        const adj = {};
        for (const path of allPaths) {
            if (!adj[path.sourceVaultId]) adj[path.sourceVaultId] = [];

            // Calculate edge weight
            // Weight = BaseFee + (Amount * PlatformFeePct) + (Amount * TaxPct) + FX Spread (simulated)
            const weight = await this.calculateStepCost(path, taxRules, amountUSD);

            adj[path.sourceVaultId].push({
                to: path.destinationVaultId,
                cost: weight,
                pathId: path.id
            });
        }

        // 3. Dijkstra's Algorithm
        const distances = {};
        const previous = {};
        const pq = new Set();

        for (const v of allVaults) {
            distances[v.id] = Infinity;
            pq.add(v.id);
        }

        // We search from ALL vaults that have enough balance to the target
        // For simplicity, let's assume we have a single starting source or we scan all candidates
        const candidates = allVaults.filter(v => Number(v.balance) * (v.currency === 'USD' ? 1 : 0.9) >= amountUSD);

        if (candidates.length === 0) throw new Error('Insufficient liquidity in any single vault to start transfer.');

        // For simplicity in this demo, we'll pick the first liquid vault as the source.
        // In a more complex L3 version, we'd run Dijkstra from multiple sources.
        const startVault = candidates[0];
        const { distances, previous } = GraphSolvers.dijkstra(adj, startVault.id, destinationVaultId);

        if (distances[destinationVaultId] === Infinity) {
            throw new Error('No viable path found to destination vault.');
        }

        // 4. Reconstruct path
        const path = [];
        let curr = destinationVaultId;
        while (previous[curr]) {
            path.unshift(previous[curr]);
            curr = previous[curr].from;
        }

        // 5. Store run history
        const [run] = await db.insert(optimizationRuns).values({
            userId,
            targetAmountUSD: amountUSD.toString(),
            destinationVaultId,
            optimalPath: path,
            totalEstimatedFeeUSD: distances[destinationVaultId].toString(),
            status: 'calculated'
        }).returning();

        return { run, path, totalCost: distances[destinationVaultId] };
    }

    /**
     * Calculates cost of a specific transfer step.
     */
    async calculateStepCost(path, taxRules, amount) {
        const platformFee = Number(path.baseFee) + (amount * Number(path.platformFeePct));

        // Find tax rule between entities
        const [sourceVault] = await db.select().from(vaults).where(eq(vaults.id, path.sourceVaultId));
        const [destVault] = await db.select().from(vaults).where(eq(vaults.id, path.destinationVaultId));

        const taxRule = taxRules.find(r =>
            r.sourceEntityId === sourceVault.entityId &&
            r.destinationEntityId === destVault.entityId
        );

        const taxEffect = taxRule ? (amount * Number(taxRule.withholdingTaxPct)) : 0;

        // Simulating FX spread cost if currencies differ
        const fxCost = (sourceVault.currency !== destVault.currency) ? (amount * 0.005) : 0; // 50 bps spread

        return platformFee + taxEffect + fxCost;
    }
}

export default new LiquidityOptimizerService();
