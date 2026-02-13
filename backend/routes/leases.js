import express from 'express';
import { protect } from '../middleware/auth.js';
import leaseEngine from '../services/leaseEngine.js';
import { validateLease } from '../middleware/propertyValidator.js';
import { validationResult } from 'express-validator';

const router = express.Router();

/**
 * @route   POST /api/leases
 * @desc    Create a new tenant lease
 */
router.post('/', protect, validateLease, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
        const lease = await leaseEngine.createLease(req.user.id, req.body);
        res.status(201).json({ success: true, data: lease });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   POST /api/leases/:id/terminate
 * @desc    Terminate an active lease
 */
router.post('/:id/terminate', protect, async (req, res) => {
    try {
        const lease = await leaseEngine.terminateLease(req.user.id, req.params.id);
        res.json({ success: true, data: lease });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   GET /api/leases/expiring
 * @desc    Get leases expiring soon
 */
router.get('/expiring', protect, async (req, res) => {
    try {
        const leases = await leaseEngine.getExpiringLeases(req.query.days || 30);
        res.json({ success: true, data: leases });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;
