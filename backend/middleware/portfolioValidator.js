// backend/middleware/portfolioValidator.js
module.exports = function portfolioValidator(req, res, next) {
  const { userId, assets } = req.body;
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'Invalid or missing userId' });
  }
  if (!Array.isArray(assets) || assets.length === 0) {
    return res.status(400).json({ error: 'Portfolio must have at least one asset' });
  }
  for (const asset of assets) {
    if (!asset.symbol || typeof asset.symbol !== 'string') {
      return res.status(400).json({ error: 'Invalid asset symbol' });
    }
    if (typeof asset.allocation !== 'number' || asset.allocation < 0 || asset.allocation > 100) {
      return res.status(400).json({ error: 'Invalid asset allocation' });
    }
    if (typeof asset.targetAllocation !== 'number' || asset.targetAllocation < 0 || asset.targetAllocation > 100) {
      return res.status(400).json({ error: 'Invalid asset target allocation' });
    }
  }
  next();
}
