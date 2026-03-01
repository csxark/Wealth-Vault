/**
 * Utility exporter for UI-agnostic graph analysis tools
 * Translates the interlocking topology into standard CSV formats (#465)
 */

export const exportTopologyToCSV = (topology) => {
    // 1. Generate Nodes Data
    const nodeHeaders = "id,name,cashBalance,netWorth,centrality,degree,cohesion,community,isFragile\n";
    const nodesCSV = topology.nodes.map(n => {
        return `${n.id},"${n.name}",${n.cashBalance},${n.netWorth},${n.centrality || 0},${n.degree || 0},${n.cohesionVal || 0},${n.communityId || 0},${n.isFragile || false}`;
    }).join("\n");

    // 2. Generate Edges Data
    const edgeHeaders = "id,source,target,value,interestRate,label\n";
    const edgesCSV = topology.links.map(l => {
        return `${l.id},${l.source},${l.target},${l.value},${l.interestRate},"${l.label}"`;
    }).join("\n");

    return {
        nodesCSV: nodeHeaders + nodesCSV,
        edgesCSV: edgeHeaders + edgesCSV
    };
};
