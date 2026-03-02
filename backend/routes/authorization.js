import express from 'express';
import { protect } from '../middleware/auth.js';
import policyEngineService from '../services/policyEngineService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

router.get('/status', protect, async (req, res) => {
  try {
    const status = policyEngineService.getStatus();

    return res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Failed to get authorization engine status', {
      error: error.message,
      userId: req.user?.id
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to get authorization engine status'
    });
  }
});

router.post('/reload', protect, async (req, res) => {
  try {
    const summary = await policyEngineService.reloadPolicies();

    return res.status(200).json({
      success: true,
      message: 'Authorization policies reloaded',
      data: summary
    });
  } catch (error) {
    logger.error('Failed to reload authorization policies', {
      error: error.message,
      userId: req.user?.id
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to reload authorization policies'
    });
  }
});

router.post('/cache/invalidate', protect, async (req, res) => {
  try {
    const { tenantId = null, userId = null } = req.body || {};
    const deleted = await policyEngineService.invalidateAuthorizationCache({ tenantId, userId });

    return res.status(200).json({
      success: true,
      message: 'Authorization decision cache invalidated',
      data: { deleted, tenantId, userId }
    });
  } catch (error) {
    logger.error('Failed to invalidate authorization cache', {
      error: error.message,
      userId: req.user?.id
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to invalidate authorization cache'
    });
  }
});

export default router;
