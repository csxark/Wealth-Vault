// backend/utils/esgMath.js
function calculateCompliance(assets, ratings) {
  const flagged = [];
  const compliant = [];
  assets.forEach(asset => {
    const rating = ratings.find(r => r.symbol === asset.symbol);
    if (!rating || rating.overall < 60) {
      flagged.push({ symbol: asset.symbol, reason: rating ? `Low ESG (${rating.overall})` : 'No rating' });
    } else {
      compliant.push({ symbol: asset.symbol, esg: rating.overall });
    }
  });
  return {
    flagged,
    compliant,
    complianceScore: compliant.length / assets.length * 100
  };
}

async function findAlternatives(flaggedAssets) {
  // Mock: Recommend assets with high ESG
  return flaggedAssets.map(a => ({
    symbol: a.symbol,
    alternatives: [
      { symbol: 'ESG-ETF', reason: 'High ESG rating' },
      { symbol: 'SUSTAIN-100', reason: 'Top ESG performer' }
    ]
  }));
}

module.exports = { calculateCompliance, findAlternatives };
