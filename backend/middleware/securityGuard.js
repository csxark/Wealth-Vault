/**
 * Security Guard Middleware
 * Intercepts and soft-blocks suspicious API calls before they reach the database
 * Applies anomaly detection and AI risk assessment in real-time
 */

import { detectExpenseAnomaly, createSecurityMarker } from '../services/anomalyDetection.js';
import { analyzeTransactionRisk } from '../services/securityAI.js';
import { logAudit, AuditActions, ResourceTypes } from '../services/auditService.js';

/**
 * Security guard middleware for expense creation
 * Analyzes transaction before allowing it to be created
 */
export const guardExpenseCreation = () => {
  return async (req, res, next) => {
    try {
      // Only apply to expense creation endpoints
      if (req.method !== 'POST' || !req.baseUrl.includes('/expenses')) {
        return next();
      }

      // Skip for certain endpoints (like import or recurring execution)
      if (req.path.includes('/import') || req.path.includes('/recurring')) {
        return next();
      }

      const userId = req.user?.id;
      if (!userId) {
        return next(); // Will be caught by auth middleware
      }

      const expenseData = req.body;
      
      // Run both statistical and AI analysis in parallel
      const [anomalyResult, aiRiskAnalysis] = await Promise.all([
        detectExpenseAnomaly(userId, expenseData).catch(err => {
          console.error('Anomaly detection error:', err);
          return { isAnomalous: false };
        }),
        analyzeTransactionRisk(expenseData).catch(err => {
          console.error('AI risk analysis error:', err);
          return { isSuspicious: false, riskScore: 0 };
        })
      ]);

      // Determine if transaction should be blocked, flagged, or allowed
      const shouldBlock = aiRiskAnalysis.recommendation === 'block' || 
                         aiRiskAnalysis.riskScore >= 80;
      
      const shouldFlag = anomalyResult.isAnomalous || 
                        aiRiskAnalysis.isSuspicious ||
                        aiRiskAnalysis.riskScore >= 40;

      // Store security analysis in request for later use
      req.securityAnalysis = {
        anomaly: anomalyResult,
        aiRisk: aiRiskAnalysis,
        shouldBlock,
        shouldFlag,
        overallRiskScore: Math.max(
          anomalyResult.isAnomalous ? (anomalyResult.severity === 'critical' ? 90 : 60) : 0,
          aiRiskAnalysis.riskScore
        )
      };

      // BLOCK: High-confidence fraud detection
      if (shouldBlock) {
        // Log the blocked transaction
        await logAudit(req, {
          userId,
          action: AuditActions.EXPENSE_CREATE,
          resourceType: ResourceTypes.EXPENSE,
          status: 'blocked',
          metadata: {
            reason: 'security_guard_block',
            riskScore: req.securityAnalysis.overallRiskScore,
            indicators: aiRiskAnalysis.scamIndicators || [],
            anomalies: anomalyResult.anomalies || []
          }
        });

        return res.status(403).json({
          success: false,
          message: 'Transaction blocked for security reasons',
          error: 'SECURITY_BLOCK',
          details: {
            reason: aiRiskAnalysis.explanation || 'High-risk transaction detected',
            riskScore: aiRiskAnalysis.riskScore,
            recommendation: 'Please contact support if you believe this is an error',
            indicators: aiRiskAnalysis.scamIndicators?.slice(0, 3) || []
          }
        });
      }

      // FLAG: Mark as suspicious but allow with pending status
      if (shouldFlag) {
        req.securityFlags = {
          requiresReview: true,
          severity: anomalyResult.severity || (aiRiskAnalysis.riskScore >= 60 ? 'high' : 'medium'),
          requiresMFA: anomalyResult.requiresMFA || aiRiskAnalysis.riskScore >= 70,
          markerType: anomalyResult.markerType || 'high_risk_description',
          detectionMethod: 'mixed',
          details: {
            anomaly: anomalyResult,
            aiRisk: aiRiskAnalysis
          }
        };

        // Log the flagged transaction
        await logAudit(req, {
          userId,
          action: AuditActions.EXPENSE_CREATE,
          resourceType: ResourceTypes.EXPENSE,
          status: 'flagged',
          metadata: {
            reason: 'security_guard_flag',
            riskScore: req.securityAnalysis.overallRiskScore,
            requiresMFA: req.securityFlags.requiresMFA,
            severity: req.securityFlags.severity
          }
        });

        // Attach a post-processing hook to create security marker after expense is created
        const originalJson = res.json.bind(res);
        res.json = function(data) {
          // Only process successful responses
          if (data.success && data.data?.expense?.id) {
            const expenseId = data.data.expense.id;
            
            // Create security marker asynchronously
            createSecurityMarkerForExpense(userId, expenseId, req.securityFlags)
              .catch(err => console.error('Error creating security marker:', err));

            // Add security warning to response
            data.securityWarning = {
              flagged: true,
              severity: req.securityFlags.severity,
              requiresMFA: req.securityFlags.requiresMFA,
              message: req.securityFlags.requiresMFA
                ? 'Transaction requires MFA verification before being cleared'
                : 'Transaction flagged for security review',
              reviewStatus: 'pending'
            };
          }
          return originalJson(data);
        };
      }

      // Allow transaction to proceed
      next();
    } catch (error) {
      console.error('Security guard error:', error);
      // Don't block on security check errors, but log them
      req.securityCheckFailed = true;
      next();
    }
  };
};

/**
 * Create security marker for flagged expense
 * Called asynchronously after expense creation
 */
async function createSecurityMarkerForExpense(userId, expenseId, securityFlags) {
  try {
    const { anomaly, aiRisk } = securityFlags.details;
    
    const marker = await createSecurityMarker(userId, expenseId, {
      markerType: securityFlags.markerType,
      severity: securityFlags.severity,
      requiresMFA: securityFlags.requiresMFA,
      reason: aiRisk?.explanation || anomaly?.reason || 'Flagged for security review',
      confidence: Math.max(anomaly?.confidence || 0, aiRisk?.confidence || 0),
      anomalies: anomaly?.anomalies || [],
      baseline: anomaly?.baseline || {}
    });

    // If AI analysis was performed, update marker with AI insights
    if (aiRisk && aiRisk.riskScore > 0) {
      const { db } = await import('../config/db.js');
      const { securityMarkers } = await import('../db/schema.js');
      const { eq } = await import('drizzle-orm');
      
      await db
        .update(securityMarkers)
        .set({
          aiAnalysis: {
            riskScore: aiRisk.riskScore,
            scamIndicators: aiRisk.scamIndicators || [],
            fraudType: aiRisk.fraudType,
            recommendation: aiRisk.recommendation,
            confidence: aiRisk.confidence,
            detectionMethod: aiRisk.detectionMethod
          },
          detectionMethod: securityFlags.detectionMethod,
          updatedAt: new Date()
        })
        .where(eq(securityMarkers.id, marker.id));
    }

    return marker;
  } catch (error) {
    console.error('Error creating security marker for expense:', error);
    throw error;
  }
}

/**
 * Security guard for high-value operations
 * Applies stricter checks for sensitive operations
 */
export const guardHighValueOperation = (thresholdAmount = 5000) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return next();
      }

      // Check if operation involves high value
      const amount = parseFloat(req.body?.amount || req.params?.amount || 0);
      
      if (amount >= thresholdAmount) {
        // Log high-value operation attempt
        await logAudit(req, {
          userId,
          action: 'HIGH_VALUE_OPERATION',
          resourceType: ResourceTypes.EXPENSE,
          metadata: {
            amount,
            threshold: thresholdAmount,
            endpoint: req.path,
            method: req.method
          },
          status: 'attempt'
        });

        // Check if user has MFA enabled
        const { db } = await import('../config/db.js');
        const { users } = await import('../db/schema.js');
        const { eq } = await import('drizzle-orm');
        
        const [user] = await db
          .select({ mfaEnabled: users.mfaEnabled })
          .from(users)
          .where(eq(users.id, userId));

        if (!user?.mfaEnabled) {
          return res.status(403).json({
            success: false,
            message: 'MFA required for high-value transactions',
            error: 'MFA_REQUIRED',
            details: {
              amount,
              threshold: thresholdAmount,
              action: 'Please enable MFA in your account settings'
            }
          });
        }

        // Add high-value flag to request
        req.highValueOperation = true;
        req.operationAmount = amount;
      }

      next();
    } catch (error) {
      console.error('High-value guard error:', error);
      next();
    }
  };
};

/**
 * Security guard for bulk operations
 * Monitors and flags suspicious bulk activity
 */
export const guardBulkOperation = () => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return next();
      }

      // Check for bulk operations (arrays in request body)
      const isBulkOperation = Array.isArray(req.body?.expenses) || 
                             Array.isArray(req.body?.transactions) ||
                             Array.isArray(req.body?.items);

      if (isBulkOperation) {
        const itemCount = (req.body?.expenses || req.body?.transactions || req.body?.items || []).length;
        
        // Flag suspiciously large bulk operations
        if (itemCount > 100) {
          await logAudit(req, {
            userId,
            action: 'BULK_OPERATION_FLAGGED',
            resourceType: ResourceTypes.EXPENSE,
            metadata: {
              itemCount,
              endpoint: req.path,
              reason: 'unusually_large_bulk_operation'
            },
            status: 'flagged'
          });

          return res.status(429).json({
            success: false,
            message: 'Bulk operation size exceeds security limit',
            error: 'BULK_LIMIT_EXCEEDED',
            details: {
              itemCount,
              maxAllowed: 100,
              suggestion: 'Please split into smaller batches'
            }
          });
        }

        // Log bulk operation
        await logAudit(req, {
          userId,
          action: 'BULK_OPERATION',
          resourceType: ResourceTypes.EXPENSE,
          metadata: {
            itemCount,
            endpoint: req.path
          },
          status: 'allowed'
        });

        req.bulkOperation = {
          itemCount,
          flagged: itemCount > 50
        };
      }

      next();
    } catch (error) {
      console.error('Bulk operation guard error:', error);
      next();
    }
  };
};

/**
 * Rate limiting for security-sensitive endpoints
 * Tracks and limits rapid request patterns
 */
const securityRequestTracker = new Map();

export const guardRapidRequests = (maxRequests = 10, windowMinutes = 5) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return next();
      }

      const now = Date.now();
      const windowMs = windowMinutes * 60 * 1000;
      const key = `${userId}:${req.path}`;

      // Clean old entries
      const tracker = securityRequestTracker.get(key) || { requests: [], blocked: false };
      tracker.requests = tracker.requests.filter(timestamp => now - timestamp < windowMs);

      // Check if limit exceeded
      if (tracker.requests.length >= maxRequests) {
        if (!tracker.blocked) {
          // Log first block event
          await logAudit(req, {
            userId,
            action: 'RATE_LIMIT_EXCEEDED',
            resourceType: ResourceTypes.EXPENSE,
            metadata: {
              endpoint: req.path,
              requestCount: tracker.requests.length,
              windowMinutes
            },
            status: 'blocked'
          });
          tracker.blocked = true;
        }

        return res.status(429).json({
          success: false,
          message: 'Too many requests',
          error: 'RATE_LIMIT_EXCEEDED',
          details: {
            maxRequests,
            windowMinutes,
            retryAfter: Math.ceil((tracker.requests[0] + windowMs - now) / 1000)
          }
        });
      }

      // Add current request
      tracker.requests.push(now);
      tracker.blocked = false;
      securityRequestTracker.set(key, tracker);

      next();
    } catch (error) {
      console.error('Rapid request guard error:', error);
      next();
    }
  };
};

/**
 * Combined security guard (applies all checks)
 */
export const securityGuard = () => {
  return async (req, res, next) => {
    // Apply guards in sequence
    await guardExpenseCreation()(req, res, async () => {
      await guardBulkOperation()(req, res, async () => {
        await guardRapidRequests()(req, res, next);
      });
    });
  };
};

export default {
  guardExpenseCreation,
  guardHighValueOperation,
  guardBulkOperation,
  guardRapidRequests,
  securityGuard
};
