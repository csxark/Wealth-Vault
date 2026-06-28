/**
 * GraphSolvers Utility (#476)
 * Implementation of classic graph algorithms for financial pathway routing.
 */
class GraphSolvers {
    /**
     * Dijkstra's Algorithm for Finding Shortest Path
     * @param {Object} adj Adjacency list { node: [{ to, cost }] }
     * @param {string} startNode
     * @param {string} endNode
     */
    static dijkstra(adj, startNode, endNode) {
        const distances = {};
        const previous = {};
        const pq = new Set();
        const nodes = Object.keys(adj);

        // Ensure both start and end exist in graph nodes or adjacency
        const allNodes = new Set([...nodes, ...Object.values(adj).flat().map(n => n.to)]);

        for (const v of allNodes) {
            distances[v] = Infinity;
            pq.add(v);
        }

        distances[startNode] = 0;

        while (pq.size > 0) {
            let u = null;
            for (const node of pq) {
                if (u === null || distances[node] < distances[u]) u = node;
            }

            if (u === endNode || distances[u] === Infinity) break;
            pq.delete(u);

            const neighbors = adj[u] || [];
            for (const neighbor of neighbors) {
                const alt = distances[u] + neighbor.cost;
                if (alt < distances[neighbor.to]) {
                    distances[neighbor.to] = alt;
                    previous[neighbor.to] = { from: u, cost: neighbor.cost };
                }
            }
        }

        return { distances, previous };
    }
}

export default GraphSolvers;
