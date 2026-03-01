/**
 * NetworkClusteringService (#465)
 * Analyzes the vault interlocking graph to detect subnetworks / communities.
 * This helps the UI collapse massive graphs into regional sub-ledgers.
 */
class NetworkClusteringService {
    /**
     * Labels each node with a 'community' ID using connected components algorithm.
     * vaults that are completely detached from each other (no internal debt) 
     * will get different community IDs.
     */
    assignCommunities(nodes, links) {
        if (!nodes || nodes.length === 0) return nodes;

        const adjacencyList = new Map();
        nodes.forEach(n => adjacencyList.set(n.id, []));

        // Treat links as undirected purely for community grouping
        links.forEach(l => {
            if (adjacencyList.has(l.source) && adjacencyList.has(l.target)) {
                adjacencyList.get(l.source).push(l.target);
                adjacencyList.get(l.target).push(l.source);
            }
        });

        const visited = new Set();
        let currentCommunity = 1;

        const updatedNodes = [...nodes];

        for (const node of updatedNodes) {
            if (!visited.has(node.id)) {
                // BFS to explore this community
                const queue = [node.id];
                visited.add(node.id);

                while (queue.length > 0) {
                    const curr = queue.shift();

                    // Assign community to node
                    const nRef = updatedNodes.find(n => n.id === curr);
                    if (nRef) {
                        nRef.communityId = currentCommunity;
                    }

                    const neighbors = adjacencyList.get(curr) || [];
                    for (const neighbor of neighbors) {
                        if (!visited.has(neighbor)) {
                            visited.add(neighbor);
                            queue.push(neighbor);
                        }
                    }
                }

                currentCommunity++;
            }
        }

        return updatedNodes;
    }

    /**
     * Compute clustering coefficient:
     * Measures how strongly neighbors of a node are themselves interconnected.
     */
    calculateClusteringCoefficient(nodes, links) {
        const adjacency = new Map();
        nodes.forEach(n => adjacency.set(n.id, new Set()));

        links.forEach(l => {
            if (adjacency.has(l.source) && adjacency.has(l.target)) {
                adjacency.get(l.source).add(l.target);
                adjacency.get(l.target).add(l.source);
            }
        });

        const clusterCoeffs = {};

        for (const [nodeId, neighbors] of adjacency.entries()) {
            const neighborArr = Array.from(neighbors);
            const k = neighborArr.length;

            if (k < 2) {
                clusterCoeffs[nodeId] = 0;
            } else {
                let edgesBetweenNeighbors = 0;
                for (let i = 0; i < k; i++) {
                    for (let j = i + 1; j < k; j++) {
                        if (adjacency.get(neighborArr[i]).has(neighborArr[j])) {
                            edgesBetweenNeighbors++;
                        }
                    }
                }
                const possibleEdges = (k * (k - 1)) / 2;
                clusterCoeffs[nodeId] = edgesBetweenNeighbors / possibleEdges;
            }
        }

        return clusterCoeffs;
    }
}

export default new NetworkClusteringService();
