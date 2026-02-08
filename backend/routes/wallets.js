import express from 'express';
import { protect } from '../middleware/auth.js';
import walletService from '../services/walletService.js';
import { validateWalletCreation } from '../middleware/fxValidator.js';

const router = express.Router();

/**
 * @route   GET /api/wallets
 * @desc    Get all user wallets
 */
router.get('/', protect, async (req, res) => {
    try {
        const wallets = await walletService.getUserWallets(req.user.id);
        res.json({ success: true, data: wallets });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   POST /api/wallets
 * @desc    Create a new currency wallet
 */
router.post('/', protect, validateWalletCreation, async (req, res) => {
    try {
        const { currency, isDefault } = req.body;
        const wallet = await walletService.createWallet(req.user.id, currency, isDefault);
        res.status(201).json({ success: true, data: wallet });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   GET /api/wallets/summary
 * @desc    Get total balance across wallets (consolidated to default currency)
 */
router.get('/summary', protect, async (req, res) => {
    try {
        const wallets = await walletService.getUserWallets(req.user.id);
        const totalBalance = wallets.reduce((sum, w) => sum + parseFloat(w.balance), 0);

        res.json({
            success: true,
            data: {
                walletCount: wallets.length,
                totalBalance,
                wallets
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;
