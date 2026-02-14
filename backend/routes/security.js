import express from 'express';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import riskEngine from '../services/riskEngine.js';
import forensicService from '../services/forensicService.js';
import db from '../config/db.js';
import { anomalyLogs, userRiskProfiles, securityCircuitBreakers } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

const router = express.Router();

/**
 * @route   GET /api/security/dashboard
 * @desc    Get real-time security overview and risk score
 */
router.get('/dashboard', protect, asyncHandler(async (req, res) => {
  const [profile] = await db.select().from(userRiskProfiles).where(eq(userRiskProfiles.userId, req.user.id));
  const alerts = await db.query.anomalyLogs.findMany({
    where: eq(anomalyLogs.userId, req.user.id),
    orderBy: [desc(anomalyLogs.createdAt)],
    limit: 10
  });

  return new ApiResponse(200, {
    profile,
    recentAlerts: alerts,
    activeBreakers: await riskEngine.isCircuitBreakerTripped(req.user.id)
  }, 'Security dashboard data retrieved').send(res);
}));

/**
 * @route   POST /api/security/breaker/reset
 * @desc    Manual override to reset a tripped circuit breaker
 */
router.post('/breaker/reset', protect, asyncHandler(async (req, res) => {
  await db.update(securityCircuitBreakers)
    .set({ status: 'manual_bypass' })
    .where(eq(securityCircuitBreakers.userId, req.user.id));

  return new ApiResponse(200, null, 'Security circuit breaker has been manually reset').send(res);
}));

/**
 * @route   GET /api/security/forensic/trace/:id
 * @desc    Trace circular funding for an entity
 */
router.get('/forensic/trace/:id', protect, asyncHandler(async (req, res) => {
  const trace = await forensicService.detectCircularFunding(req.params.id);
  return new ApiResponse(200, trace, 'Forensic trace complete').send(res);
}));

export default router;
