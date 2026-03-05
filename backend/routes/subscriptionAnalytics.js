// backend/routes/subscriptionAnalytics.js
import express from "express";
import SubscriptionRenewalAnalyticsService from "../services/subscriptionRenewalAnalyticsService.js";
import Subscription from "../models/subscription.js";
import { protect } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { AppError } from "../utils/AppError.js";

const router = express.Router();

/**
 * @route   POST /api/subscriptions/analytics
 * @desc    Get advanced analytics for subscription renewals
 * @access  Private
 */
router.post("/analytics", protect, asyncHandler(async (req, res, next) => {
  const service = new SubscriptionRenewalAnalyticsService(Subscription);
  try {
    const result = await service.getAnalytics(req.user.id, req.body.options || {});
    return new ApiResponse(200, result, "Subscription analytics completed").send(res);
  } catch (err) {
    return next(new AppError(500, "Subscription analytics failed", err.message));
  }
}));

export default router;
