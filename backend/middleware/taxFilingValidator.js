// backend/middleware/taxFilingValidator.js
module.exports = function taxFilingValidator(req, res, next) {
  const { taxYear, deadline, filedDate, status, penalties } = req.body;
  if (!taxYear || typeof taxYear !== 'number' || taxYear < 2000 || taxYear > new Date().getFullYear() + 1) {
    return res.status(400).json({ error: 'Invalid or missing taxYear' });
  }
  if (!deadline || isNaN(Date.parse(deadline))) {
    return res.status(400).json({ error: 'Invalid or missing deadline' });
  }
  if (filedDate && isNaN(Date.parse(filedDate))) {
    return res.status(400).json({ error: 'Invalid filedDate' });
  }
  if (status && !['pending', 'on-time', 'late'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  if (penalties && (typeof penalties !== 'number' || penalties < 0)) {
    return res.status(400).json({ error: 'Invalid penalties' });
  }
  next();
}
