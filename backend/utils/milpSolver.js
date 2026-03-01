import { LiquidityGraph } from './liquidityGraph.js';

/**
 * MILPSolver - Optimization facade for liquidity routing (#476)
 * "Mixed Integer" logic for handling discrete jumps (e.g. fixed wire fees).
 */
class MILPSolver {
    /**
     * Solves the optimal path given discrete constraints
     * @param {Object} data - Nodes, Edges, Constraints
     */
    static solve(nodes, edges, startNode, endNode, amount) {
        const graph = new LiquidityGraph();

        // Add nodes
        nodes.forEach(n => graph.addNode(n));

        // Add edges with discrete friction adjustments
        edges.forEach(e => {
            let adjustedEfficiency = e.efficiency;

            // Fixed Fee Impact (Discrete Constraint)
            // efficiency = (amount * eff - fixedFee) / amount
            const fixedFee = e.metadata?.fixedFee || 0;
            if (fixedFee > 0) {
                adjustedEfficiency = (amount * e.efficiency - fixedFee) / amount;
            }

            // Minimum Transfer Threshold
            const minAmount = e.metadata?.minAmount || 0;
            if (amount < minAmount) {
                adjustedEfficiency = 0.000001; // Impossible edge
            }

            graph.addEdge(e.from, e.to, adjustedEfficiency, e.type, e.metadata);
        });

        const result = graph.findShortestPath(startNode, endNode);
        if (!result) return null;

        return {
            ...result,
            estimatedArrival: amount * result.totalEfficiency
        };
    }
}

export { MILPSolver };
