import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import escrowEngine from '../services/escrowEngine.js';
import { validateEscrowAccess, validateEscrowState } from '../middleware/escrowValidator.js';

const router = express.Router();

// Drafting a new escrow contract
router.post('/draft', protect, async (req, res) => {
    try {
        const contract = await escrowEngine.draftContract(req.user.id, req.body);
        res.status(201).json(contract);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Activating a contract (Payer locks funds)
router.post('/:id/activate', protect, validateEscrowAccess, validateEscrowState(['draft']), async (req, res) => {
    try {
        const contract = await escrowEngine.activateContract(req.params.id, req.user.id);
        res.json(contract);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Submitting a cryptographic signature for release
router.post('/:id/sign', protect, validateEscrowAccess, validateEscrowState(['active']), async (req, res) => {
    try {
        const signature = await escrowEngine.submitSignature(req.params.id, req.user.id, req.body);
        res.status(201).json(signature);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get escrow contract details
router.get('/:id', protect, validateEscrowAccess, async (req, res) => {
    res.json(req.escrow);
});

export default router;
