import { logInfo } from '../utils/logger.js';

/**
 * LiquidityGraph - Specialized directed graph for financial routing (#476)
 * Uses log-weights to convert multiplicative efficiency into additive costs.
 */
class LiquidityGraph {
    constructor() {
        this.nodes = new Set();
        this.edges = [];
        this.adj = new Map();
    }

    addNode(vaultId) {
        this.nodes.add(vaultId);
        if (!this.adj.has(vaultId)) {
            this.adj.set(vaultId, []);
        }
    }

    addEdge(from, to, efficiency, type, metadata = {}) {
        if (efficiency <= 0) efficiency = 0.000001; // Avoid log(0)

        const weight = -Math.log(efficiency);
        const edge = { from, to, efficiency, weight, type, metadata };

        this.edges.push(edge);
        this.adj.get(from).push(edge);
    }

    /**
     * Bellman-Ford Algorithm
     * Finds the path with minimum additive cost (maximum multiplicative efficiency)
     */
    findShortestPath(startNode, endNode) {
        const distances = {};
        const previous = {};
        const edgeTo = {};

        // Initialize
        for (const node of this.nodes) {
            distances[node] = Infinity;
            previous[node] = null;
        }
        distances[startNode] = 0;

        // Relax edges V-1 times
        for (let i = 0; i < this.nodes.size - 1; i++) {
            let changed = false;
            for (const edge of this.edges) {
                if (distances[edge.from] + edge.weight < distances[edge.to]) {
                    distances[edge.to] = distances[edge.from] + edge.weight;
                    previous[edge.to] = edge.from;
                    edgeTo[edge.to] = edge;
                    changed = true;
                }
            }
            if (!changed) break;
        }

        // Check for negative cycles (Arbitrage loops that gain money)
        for (const edge of this.edges) {
            if (distances[edge.from] + edge.weight < distances[edge.to]) {
                logInfo('[LiquidityGraph] Arbitrage loop detected! Capital can be generated via cycling.');
                // In a production system, we might flag this for investigation
            }
        }

        // Reconstruct path
        const path = [];
        let curr = endNode;
        while (curr && curr !== startNode) {
            const edge = edgeTo[curr];
            if (!edge) break;
            path.unshift(edge);
            curr = edge.from;
        }

        if (curr !== startNode) return null;

        const totalEfficiency = Math.exp(-distances[endNode]);
        return {
            path,
            totalEfficiency,
            totalCost: distances[endNode]
        };
    }

    getTopology() {
        return {
            nodes: Array.from(this.nodes),
            links: this.edges.map(e => ({
                source: e.from,
                target: e.to,
                efficiency: e.efficiency,
                type: e.type
            }))
        };
    }
}

export { LiquidityGraph };
