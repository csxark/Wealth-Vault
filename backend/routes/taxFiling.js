// backend/routes/taxFiling.js
const express = require('express');
const router = express.Router();
const TaxFilingRepository = require('../repositories/taxFilingRepository');
const taxFilingValidator = require('../middleware/taxFilingValidator');

// Create a new tax filing
router.post('/', taxFilingValidator, async (req, res) => {
  try {
    const filing = await TaxFilingRepository.createFiling(req.body);
    res.status(201).json(filing);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update an existing tax filing
router.put('/:userId/:taxYear', taxFilingValidator, async (req, res) => {
  try {
    const { userId, taxYear } = req.params;
    const updated = await TaxFilingRepository.updateFiling(userId, parseInt(taxYear), req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all filings for a user
router.get('/:userId', async (req, res) => {
  try {
    const filings = await TaxFilingRepository.getUserFilings(req.params.userId);
    res.json(filings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
