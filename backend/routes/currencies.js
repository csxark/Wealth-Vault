import express from 'express';
import { convertAmount, getAllRates } from '../services/currencyService.js';
import { protect } from '../middleware/auth.js';
import syncRatesJob from '../jobs/syncRates.js';

const router = express.Router();

/**
 * @swagger
 * /currencies/rates:
 *   get:
 *     summary: Get all exchange rates for a base currency
 *     tags: [Currencies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: baseCurrency
 *         schema:
 *           type: string
 *           default: USD
 *         description: Base currency code (e.g., USD, EUR, GBP)
 *     responses:
 *       200:
 *         description: Exchange rates retrieved successfully
 */
router.get('/rates', protect, async (req, res) => {
    try {
        const { baseCurrency = 'USD' } = req.query;
        
        const ratesData = await getAllRates(baseCurrency);
        
        res.json({
            success: true,
            data: ratesData
        });
    } catch (error) {
        console.error('Error fetching rates:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch exchange rates',
            error: error.message
        });
    }
});

/**
 * @swagger
 * /currencies/convert:
 *   post:
 *     summary: Convert amount between currencies
 *     tags: [Currencies]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - fromCurrency
 *               - toCurrency
 *             properties:
 *               amount:
 *                 type: number
 *               fromCurrency:
 *                 type: string
 *               toCurrency:
 *                 type: string
 *     responses:
 *       200:
 *         description: Conversion successful
 */
router.post('/convert', protect, async (req, res) => {
    try {
        const { amount, fromCurrency, toCurrency } = req.body;
        
        if (!amount || !fromCurrency || !toCurrency) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: amount, fromCurrency, toCurrency'
            });
        }
        
        const convertedAmount = await convertAmount(
            parseFloat(amount),
            fromCurrency,
            toCurrency
        );
        
        res.json({
            success: true,
            data: {
                originalAmount: parseFloat(amount),
                originalCurrency: fromCurrency,
                convertedAmount,
                targetCurrency: toCurrency,
                timestamp: new Date()
            }
        });
    } catch (error) {
        console.error('Error converting currency:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to convert currency',
            error: error.message
        });
    }
});

/**
 * @swagger
 * /currencies/sync:
 *   post:
 *     summary: Manually trigger exchange rates sync (Admin only)
 *     tags: [Currencies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync triggered successfully
 */
router.post('/sync', protect, async (req, res) => {
    try {
        // Check if user is admin (you can add admin check middleware)
        // For now, allow any authenticated user to trigger sync
        
        const result = await syncRatesJob.triggerManualSync();
        
        res.json({
            success: true,
            message: 'Exchange rates sync completed',
            data: result
        });
    } catch (error) {
        console.error('Error syncing rates:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to sync exchange rates',
            error: error.message
        });
    }
});

/**
 * @swagger
 * /currencies/sync/status:
 *   get:
 *     summary: Get sync job status
 *     tags: [Currencies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync status retrieved successfully
 */
router.get('/sync/status', protect, async (req, res) => {
    try {
        const status = syncRatesJob.getStatus();
        
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Error fetching sync status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch sync status',
            error: error.message
        });
    }
});

/**
 * @swagger
 * /currencies/supported:
 *   get:
 *     summary: Get list of supported currencies
 *     tags: [Currencies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Supported currencies list
 */
router.get('/supported', protect, async (req, res) => {
    try {
        // Common currencies supported
        const supportedCurrencies = [
            { code: 'USD', name: 'US Dollar', symbol: '$' },
            { code: 'EUR', name: 'Euro', symbol: '€' },
            { code: 'GBP', name: 'British Pound', symbol: '£' },
            { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
            { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
            { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
            { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
            { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
            { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
            { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
            { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
            { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
            { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
            { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
            { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
            { code: 'MXN', name: 'Mexican Peso', symbol: '$' },
            { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
            { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
            { code: 'RUB', name: 'Russian Ruble', symbol: '₽' },
            { code: 'TRY', name: 'Turkish Lira', symbol: '₺' }
        ];
        
        res.json({
            success: true,
            data: {
                currencies: supportedCurrencies,
                count: supportedCurrencies.length
            }
        });
    } catch (error) {
        console.error('Error fetching supported currencies:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch supported currencies',
            error: error.message
        });
    }
});

export default router;
