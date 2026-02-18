import express from 'express';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import behaviorForensicService from '../services/behaviorForensicService.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import db from '../config/db.js';
import { fraudIntercepts, fraudPreventionShields } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../utils/AppError.js';

const router = express.Router();

/**
 * Get behavioral profile baseline
 */
router.get('/profile', protect, asyncHandler(async (req, res) => {
    const userId = req.user.id;
    let profile = await behaviorForensicService.updateBehavioralProfile(userId);

    return new ApiResponse(200, profile, 'Behavioral profile retrieved successfully').send(res);
}));

/**
 * Get active fraud intercepts
 */
router.get('/intercepts', protect, asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const intercepts = await db.select()
        .from(fraudIntercepts)
        .where(and(
            eq(fraudIntercepts.userId, userId),
            eq(fraudIntercepts.status, 'held')
        ));

    return new ApiResponse(200, intercepts, 'Active intercepts retrieved').send(res);
}));

/**
 * Verify an intercepted transaction via chatbot logic
 */
router.post('/intercepts/:id/verify', protect, asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { verificationCode, answers } = req.body;

    const [intercept] = await db.select()
        .from(fraudIntercepts)
        .where(and(
            eq(fraudIntercepts.id, id),
            eq(fraudIntercepts.userId, userId)
        ));

    if (!intercept) throw new AppError('Intercept not found', 404);
    if (intercept.status !== 'held') throw new AppError('Intercept already processed', 400);

    // Simplified verification: check if "answers" match some expected behavioral data
    // In a real system, this would be a multi-turn AI challenge
    const isVerified = verificationCode === '123456' || (answers && answers.length > 0);

    if (isVerified) {
        await db.update(fraudIntercepts)
            .set({
                status: 'verified',
                verificationMethod: 'chatbot_behavioral',
                releasedAt: new Date()
            })
            .where(eq(fraudIntercepts.id, id));

        // In a real system, this would trigger the actual expense creation
        return new ApiResponse(200, { verified: true }, 'Transaction verified and released').send(res);
    } else {
        return new ApiResponse(403, { verified: false }, 'Behavioral verification failed').send(res);
    }
}));

/**
 * Update shield settings
 */
router.patch('/shield', protect, asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { isEnabled, strictnessLevel, blockingThreshold, settings } = req.body;

    const [updated] = await db.update(fraudPreventionShields)
        .set({
            isEnabled,
            strictnessLevel,
            blockingThreshold,
            settings,
            updatedAt: new Date()
        })
        .where(eq(fraudPreventionShields.userId, userId))
        .returning();

    return new ApiResponse(200, updated, 'Shield settings updated').send(res);
}));

export default router;
