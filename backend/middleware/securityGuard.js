import riskEngine from '../services/riskEngine.js';
import { ApiResponse } from '../utils/ApiResponse.js';

/**
 * Security Guard Middleware (L3)
 * Intercepts transactions and sensitive actions to perform real-time risk scoring.
 */
export const securityGuard = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { amount, description, type } = req.body;

    // 1. Check if Circuit Breaker is already tripped
    const isTripped = await riskEngine.isCircuitBreakerTripped(userId);
    if (isTripped) {
      return res.status(403).json({
        success: false,
        message: 'Security Circuit Breaker Tripped. Access restricted. Please contact support.',
        code: 'CIRCUIT_BREAKER_TRIPPED'
      });
    }

    // 2. Skip risk check for GET requests or non-financial actions
    if (req.method === 'GET' || !amount) {
      return next();
    }

    // 3. Perform Deep Transaction Inspection
    const inspection = await riskEngine.inspectTransaction(userId, {
      amount,
      resourceType: req.baseUrl.includes('entities') ? 'inter_company' : 'transaction',
      resourceId: req.params.id || 'new',
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        path: req.originalUrl
      }
    });

    if (inspection.action === 'block') {
      return res.status(400).json({
        success: false,
        message: 'Transaction blocked by AI Security Engine due to high risk score.',
        reasons: inspection.reasons,
        riskScore: inspection.riskScore
      });
    }

    // Attach risk score to request for the next handler
    req.riskScore = inspection.riskScore;
    req.riskAction = inspection.action;

    next();
  } catch (error) {
    console.error('[Security Guard] Error:', error);
    // Fail-safe: Allow transaction but log error if security engine fails
    next();
  }
};
