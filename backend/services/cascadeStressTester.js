import db from '../config/db.js';
import { stressTestSimulations, topologySnapshots } from '../db/schema.js';
import networkClusteringService from './networkClusteringService.js';
import { NetWorthGraph } from '../utils/netWorthGraph.js';

class CascadeStressTester {
    /**
     * Build graph, extract structural metrics (fragility, centrality),
     * and persist a D3 topology snapshot.
     */
    async generateTopology(userId) {
        const graph = new NetWorthGraph(userId);
        await graph.build();

        const topology = graph.getTopology();
        const metrics = this.calculateNetworkMetrics(topology);
        const clusteredNodes = networkClusteringService.assignCommunities(topology.nodes, topology.links);
        const cohesion = networkClusteringService.calculateClusteringCoefficient(topology.nodes, topology.links);

        // Mix metrics into nodes
        topology.nodes = clusteredNodes.map(node => {
            const nodeMetrics = metrics.nodeCentrality_PageRank[node.id] || 0;
            const linkCount = topology.links.filter(l => l.source === node.id || l.target === node.id).length;

            return {
                ...node,
                centrality: nodeMetrics,
                degree: linkCount,
                cohesionVal: cohesion[node.id] || 0,
                type: 'vault',
                isFragile: nodeMetrics > 0.15 && linkCount > 2 // Arbitrary heuristic for visualization
            };
        });

        // Compute overarching network fragility
        const maxFragility = Math.max(...Object.values(metrics.nodeCentrality_PageRank || { 'none': 0 }));
        const networkWealth = topology.nodes.reduce((sum, n) => sum + n.netWorth, 0);

        // Persist snapshot
        const [snapshot] = await db.insert(topologySnapshots).values({
            userId,
            nodeCount: topology.nodes.length,
            linkCount: topology.links.length,
            totalNetworkWealth: networkWealth.toString(),
            maxFragilityIndex: maxFragility.toString(),
            graphData: topology
        }).returning();

        return snapshot;
    }

    /**
     * Executes a cascade simulation and calculates insolvency paths
     */
    async simulateShock(userId, targetVaultId, shockPercentage, isSystemTriggered = false) {
        const graph = new NetWorthGraph(userId);
        await graph.build();

        const simulationResults = graph.simulateAssetShock(targetVaultId, shockPercentage);

        // Metrics aggregation
        let totalLoss = 0;
        let insolventCount = 0;
        let maxImpact = 0;

        const resultsArray = [];

        for (const [id, data] of Object.entries(simulationResults)) {
            totalLoss += data.lossPropagated;
            if (data.isInsolvent) insolventCount++;
            if (data.impactedLevel > maxImpact) maxImpact = data.impactedLevel;

            resultsArray.push({
                vaultId: id,
                ...data
            });
        }

        // Persist simulation result
        const [simulation] = await db.insert(stressTestSimulations).values({
            userId,
            targetVaultId,
            shockPercentage: shockPercentage.toString(),
            totalNetworkLoss: totalLoss.toString(),
            insolventVaultsCount: insolventCount,
            maxImpactLevel: maxImpact,
            results: resultsArray,
            isSystemTriggered
        }).returning();

        return simulation;
    }

    /**
     * A basic PageRank variant to measure centrality/importance
     * Vaults that loan heavily to other interconnected vaults will have high centrality.
     */
    calculateNetworkMetrics(topology) {
        const { nodes, links } = topology;
        const numNodes = nodes.length;
        if (numNodes === 0) return { nodeCentrality_PageRank: {} };

        const pageRank = {};
        const outboundWeight = {};

        nodes.forEach(n => {
            pageRank[n.id] = 1.0 / numNodes;
            outboundWeight[n.id] = 0;
        });

        links.forEach(l => {
            outboundWeight[l.source] += l.value; // Total amount lent out
        });

        const damping = 0.85;
        const iterations = 15;

        for (let i = 0; i < iterations; i++) {
            const nextRank = {};
            nodes.forEach(n => nextRank[n.id] = (1 - damping) / numNodes);

            links.forEach(l => {
                if (outboundWeight[l.source] > 0) {
                    const weightRatio = l.value / outboundWeight[l.source];
                    nextRank[l.target] += damping * pageRank[l.source] * weightRatio;
                }
            });

            nodes.forEach(n => pageRank[n.id] = nextRank[n.id]);
        }

        return {
            nodeCentrality_PageRank: pageRank
        };
    }
}

export default new CascadeStressTester();
