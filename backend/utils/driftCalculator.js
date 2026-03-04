// backend/utils/driftCalculator.js
function calculateDrift(assets) {
  let totalDrift = 0;
  assets.forEach(asset => {
    totalDrift += Math.abs(asset.allocation - asset.targetAllocation);
  });
  return totalDrift / assets.length;
}

function generateRebalancingStrategy(assets) {
  const actions = [];
  let notes = '';
  assets.forEach(asset => {
    if (Math.abs(asset.allocation - asset.targetAllocation) > 2) {
      actions.push({
        symbol: asset.symbol,
        fromAllocation: asset.allocation,
        toAllocation: asset.targetAllocation,
        amountMoved: Math.abs(asset.allocation - asset.targetAllocation)
      });
    }
  });
  notes = actions.length ? 'Rebalancing required for drifted assets.' : 'Portfolio is within target allocations.';
  return {
    actions,
    nextRebalance: actions.length ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
    notes
  };
}

module.exports = { calculateDrift, generateRebalancingStrategy };
