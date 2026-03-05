// backend/middleware/retirementGoalValidator.js
module.exports = function retirementGoalValidator(req, res, next) {
  const { userId, targetAmount, targetAge, currentAge } = req.body;
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'Invalid or missing userId' });
  }
  if (typeof targetAmount !== 'number' || targetAmount <= 0) {
    return res.status(400).json({ error: 'Invalid targetAmount' });
  }
  if (typeof targetAge !== 'number' || targetAge < 40 || targetAge > 80) {
    return res.status(400).json({ error: 'Invalid targetAge' });
  }
  if (typeof currentAge !== 'number' || currentAge < 18 || currentAge > targetAge) {
    return res.status(400).json({ error: 'Invalid currentAge' });
  }
  next();
}
