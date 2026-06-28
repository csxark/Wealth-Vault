import db from '../config/db.js';
import { vaults, internalDebts, vaultBalances } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Utility for recursive net worth calculation and circular reference detection.
 * Handles the interlocking network of internal assets and liabilities.
 */
export class NetWorthGraph {
    constructor(userId) {
        this.userId = userId;
        this.nodes = new Map(); // vaultId -> node
        this.isBuilt = false;
    }

    /**
     * Builds the graph from the database.
     */
    async build() {
        // Fetch all vaults owned by the user
        const userVaults = await db.select().from(vaults).where(eq(vaults.ownerId, this.userId));

        // Fetch all balances
        const balances = await db.select().from(vaultBalances).where(eq(vaultBalances.userId, this.userId));

        for (const v of userVaults) {
            const vaultBalance = balances
                .filter(b => b.vaultId === v.id)
                .reduce((acc, b) => acc + parseFloat(b.balance || 0), 0);

            this.nodes.set(v.id, {
                id: v.id,
                name: v.name,
                cashBalance: vaultBalance,
                assets: [],
                liabilities: []
            });
        }

        // Fetch internal debts
        const debts = await db.select().from(internalDebts).where(eq(internalDebts.userId, this.userId));

        for (const d of debts) {
            if (this.nodes.has(d.lenderVaultId)) {
                this.nodes.get(d.lenderVaultId).assets.push({
                    id: d.id,
                    targetVaultId: d.borrowerVaultId,
                    amount: parseFloat(d.currentBalance),
                    interestRate: parseFloat(d.interestRate)
                });
            }
            if (this.nodes.has(d.borrowerVaultId)) {
                this.nodes.get(d.borrowerVaultId).liabilities.push({
                    id: d.id,
                    sourceVaultId: d.lenderVaultId,
                    amount: parseFloat(d.currentBalance),
                    interestRate: parseFloat(d.interestRate)
                });
            }
        }

        this.isBuilt = true;
    }

    /**
     * Calculates net worth for a specific vault.
     */
    getVaultNetWorth(vaultId) {
        if (!this.isBuilt) throw new Error("Graph not built. Call build() first.");
        const node = this.nodes.get(vaultId);
        if (!node) return 0;

        // Net Worth = Cash + Internal Assets - Internal Liabilities
        let netWorth = node.cashBalance;

        for (const asset of node.assets) {
            netWorth += asset.amount;
        }

        for (const liability of node.liabilities) {
            netWorth -= liability.amount;
        }

        return netWorth;
    }

    /**
     * Detects circular lending paths.
     * Returns an array of cycles if found.
     */
    detectCycles() {
        const visited = new Set();
        const recStack = new Set();
        const cycles = [];

        const findCycles = (u, path = []) => {
            visited.add(u);
            recStack.add(u);
            path.push(u);

            const node = this.nodes.get(u);
            if (node) {
                for (const asset of node.assets) {
                    const v = asset.targetVaultId;
                    if (!visited.has(v)) {
                        findCycles(v, [...path]);
                    } else if (recStack.has(v)) {
                        // Cycle found!
                        const cycleStartIdx = path.indexOf(v);
                        cycles.push(path.slice(cycleStartIdx));
                    }
                }
            }

            recStack.delete(u);
            return cycles;
        };

        for (const vaultId of this.nodes.keys()) {
            if (!visited.has(vaultId)) {
                findCycles(vaultId);
            }
        }

        return cycles;
    }

    /**
     * Returns a summary for all vaults.
     */
    getAllVaultsSummary() {
        const summary = [];
        for (const [id, node] of this.nodes.entries()) {
            summary.push({
                id,
                name: node.name,
                cashBalance: node.cashBalance,
                internalAssets: node.assets.reduce((acc, a) => acc + a.amount, 0),
                internalLiabilities: node.liabilities.reduce((acc, l) => acc + l.amount, 0),
                netWorth: this.getVaultNetWorth(id)
            });
        }
        return summary;
    }

    /**
     * Returns a D3-compatible node-link structure (#465)
     */
    getTopology() {
        if (!this.isBuilt) throw new Error("Graph not built. Call build() first.");

        const nodes = [];
        const links = [];

        for (const [id, node] of this.nodes.entries()) {
            nodes.push({
                id,
                name: node.name,
                cashBalance: node.cashBalance,
                netWorth: this.getVaultNetWorth(id),
                type: 'vault'
            });

            for (const asset of node.assets) {
                links.push({
                    id: asset.id,
                    source: id,
                    target: asset.targetVaultId,
                    value: asset.amount,
                    interestRate: asset.interestRate,
                    label: `Lending: ${asset.amount}`
                });
            }
        }

        return { nodes, links };
    }

    /**
     * Simulates an asset shock and identifies "Fragile Links" (#465)
     */
    simulateAssetShock(targetVaultId, shockPercentage) {
        if (!this.isBuilt) throw new Error("Graph not built. Call build() first.");

        const nodes = Object.fromEntries(
            Array.from(this.nodes.entries()).map(([id, node]) => [
                id, {
                    originalNetWorth: this.getVaultNetWorth(id),
                    remainingNetWorth: this.getVaultNetWorth(id),
                    impactedLevel: -1,
                    isInsolvent: false,
                    lossPropagated: 0
                }
            ])
        );

        const shockNode = this.nodes.get(targetVaultId);
        if (!shockNode) throw new Error("Target vault not found");

        const initialLoss = shockNode.cashBalance * (shockPercentage / 100);
        const queue = [{ id: targetVaultId, loss: initialLoss, level: 0 }];
        const visited = new Set();

        while (queue.length > 0) {
            const { id, loss, level } = queue.shift();
            if (visited.has(id)) continue;
            // visited.add(id); // Can't just visited.add here because loss might be larger from multiple paths

            const nodeRes = nodes[id];
            nodeRes.remainingNetWorth -= loss;
            nodeRes.lossPropagated += loss;
            nodeRes.impactedLevel = Math.max(nodeRes.impactedLevel, level);

            // Insolvency Threshold: The maximum loss a vault can take before hitting 0
            nodeRes.insolvencyThreshold = Math.max(0, nodeRes.remainingNetWorth);

            if (nodeRes.remainingNetWorth < 0) {
                nodeRes.isInsolvent = true;
            }

            // Propagate to lenders (Who have assets in THIS vault)
            const graphNode = this.nodes.get(id);

            // Fragile Link Detection: If a vault has many liabilities (> 2) and drops 
            // significantly under shock, it represents a fragile "linchpin" link
            if (graphNode.liabilities.length >= 2 && loss > (graphNode.cashBalance * 0.2)) {
                nodeRes.isFragileLink = true;
            } else {
                nodeRes.isFragileLink = false;
            }

            for (const liability of graphNode.liabilities) {
                const lenderId = liability.sourceVaultId;
                // If this node fails or is shocked, the lender's asset is at risk
                // For simulation, we propagate the loss proportionally or fully if node is insolvent
                const potentialLenderLoss = Math.min(liability.amount, loss);
                if (potentialLenderLoss > 0) {
                    queue.push({ id: lenderId, loss: potentialLenderLoss, level: level + 1 });
                }
            }
        }

        return nodes;
    }
}
