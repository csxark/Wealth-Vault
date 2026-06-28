
import express from 'express';
import { protect } from '../middleware/auth.js';
import { validateEntityOwnership, createEntityValidator } from '../middleware/corporateValidator.js';
import entityService from '../services/entityService.js';
import businessAnalytics from '../services/businessAnalytics.js';

const router = express.Router();

// Get all user entities and hierarchy
router.get('/structure', protect, async (req, res) => {
    const structure = await entityService.getCorporateStructure(req.user.id);
    res.json({ success: true, data: structure });
});

// Create new entity
router.post('/', protect, createEntityValidator, async (req, res) => {
    const entity = await entityService.createEntity(req.user.id, req.body);
    res.status(201).json({ success: true, data: entity });
});

// Get consolidated ledger
router.get('/:entityId/ledger/consolidated', protect, validateEntityOwnership, async (req, res) => {
    const entries = await entityService.getConsolidatedLedger(req.params.entityId);
    res.json({ success: true, data: entries });
});

// Get entity health metrics
router.get('/:entityId/analytics', protect, validateEntityOwnership, async (req, res) => {
    const health = await businessAnalytics.calculateEntityHealth(req.params.entityId);
    const trend = await businessAnalytics.getPLTrend(req.params.entityId);
    res.json({ success: true, data: { health, trend } });
});

export default router;
