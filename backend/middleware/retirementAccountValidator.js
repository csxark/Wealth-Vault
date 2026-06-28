// backend/middleware/retirementAccountValidator.js
module.exports = function retirementAccountValidator(req, res, next) {
  const { userId, accountType, balance, annualContribution, expectedReturn } = req.body;
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'Invalid or missing userId' });
  }
  if (!accountType || typeof accountType !== 'string') {
    return res.status(400).json({ error: 'Invalid or missing accountType' });
  }
  if (typeof balance !== 'number' || balance < 0) {
    return res.status(400).json({ error: 'Invalid balance' });
  }
  if (typeof annualContribution !== 'number' || annualContribution < 0) {
    return res.status(400).json({ error: 'Invalid annualContribution' });
  }
  if (typeof expectedReturn !== 'number' || expectedReturn < 0 || expectedReturn > 0.15) {
    return res.status(400).json({ error: 'Invalid expectedReturn' });
  }
  next();
}
