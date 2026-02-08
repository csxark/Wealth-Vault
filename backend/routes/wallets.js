
import express from 'express';
import { protect } from '../middleware/auth.js';
import { validateWallet } from '../middleware/fxValidator.js';
import walletService from '../services/walletService.js';
import db from '../config/db.js';
import { currencyWallets } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const router = express.Router();

// Get all user wallets
router.get('/', protect, async (req, res) => {
    const wallets = await db.select().from(currencyWallets).where(eq(currencyWallets.userId, req.user.id));
    res.json({ success: true, data: wallets });
});

// Create new wallet
router.post('/', protect, validateWallet, async (req, res) => {
    const wallet = await walletService.getOrCreateWallet(req.user.id, req.body.currency);
    res.status(201).json({ success: true, data: wallet });
});

// Set default wallet
router.patch('/:id/default', protect, async (req, res) => {
    const wallet = await walletService.setDefaultWallet(req.user.id, req.params.id);
    res.json({ success: true, data: wallet });
});

export default router;
