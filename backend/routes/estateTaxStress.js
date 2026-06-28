import express from 'express';
import estateTaxStressTester from '../services/estateTaxStressTester.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { userLimiter } from '../middleware/rateLimiter.js';
import { logError } from '../utils/logger.js';

const router = express.Router();

/**
 * @route   GET /api/succession/estate-tax-stress-test
 * @desc    Run a comprehensive AI stress test for estate tax and liquidity
 * @access  Private
 */
router.get('/stress-test', authenticateToken, userLimiter, async (req, res) => {
    try {
        const userId = req.user.id;
        const results = await estateTaxStressTester.performFullStressTest(userId);
        res.json(results);
    } catch (error) {
        logError('[EstateTaxStressRouter] Error:', error);
        res.status(500).json({ error: 'Failed to perform estate tax stress test' });
    }
});

export default router;
