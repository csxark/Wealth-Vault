import express from 'express';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import taxService from '../services/taxService.js';
import portfolioService from '../services/portfolioService.js';
import db from '../config/db.js';
import { harvestOpportunities, taxLots } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

const router = express.Router();

/**
 * @route   GET /api/tax/alpha
 * @desc    Get estimated tax savings from active harvesting
 */
router.get('/alpha', protect, asyncHandler(async (req, res) => {
  const alpha = await taxService.calculateTaxAlpha(req.user.id);
  return new ApiResponse(200, alpha, 'Tax alpha calculated').send(res);
}));

/**
 * @route   GET /api/tax/harvest-opportunities
 * @desc    Get list of detected harvesting opportunities
 */
router.get('/harvest-opportunities', protect, asyncHandler(async (req, res) => {
  const opportunities = await db.query.harvestOpportunities.findMany({
    where: and(
      eq(harvestOpportunities.userId, req.user.id),
      eq(harvestOpportunities.status, 'detected')
    ),
    orderBy: [desc(harvestOpportunities.detectedAt)]
  });
  return new ApiResponse(200, opportunities, 'Harvesting opportunities retrieved').send(res);
}));

/**
 * @route   POST /api/tax/lots/:id/sell
 * @desc    Simulate/Record a tax-lot specific sale (HIFO Optimization)
 */
router.post('/lots/:id/sell', protect, asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const [lot] = await db.select().from(taxLots).where(and(eq(taxLots.id, req.params.id), eq(taxLots.userId, req.user.id)));

  if (!lot || parseFloat(lot.quantity) < quantity) {
    return res.status(400).json({ success: false, message: 'Invalid lot or quantity' });
  }

  // Logic to mark lot as partially/fully sold
  const updated = await db.update(taxLots)
    .set({
      quantity: (parseFloat(lot.quantity) - quantity).toString(),
      isSold: parseFloat(lot.quantity) - quantity <= 0
    })
    .where(eq(taxLots.id, req.params.id))
    .returning();

  return new ApiResponse(200, updated, 'Tax lot adjusted').send(res);
}));

export default router;
