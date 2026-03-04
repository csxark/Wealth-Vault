// backend/middleware/esgValidator.js
module.exports = function esgValidator(req, res, next) {
  const { symbol, provider, environment, social, governance, overall } = req.body;
  if (!symbol || typeof symbol !== 'string') {
    return res.status(400).json({ error: 'Invalid or missing symbol' });
  }
  if (!provider || typeof provider !== 'string') {
    return res.status(400).json({ error: 'Invalid or missing provider' });
  }
  for (const field of ['environment', 'social', 'governance', 'overall']) {
    if (typeof req.body[field] !== 'number' || req.body[field] < 0 || req.body[field] > 100) {
      return res.status(400).json({ error: `Invalid ${field} score` });
    }
  }
  next();
}
