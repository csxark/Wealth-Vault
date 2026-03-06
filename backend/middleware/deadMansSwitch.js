import db from '../config/db.js';
import { users, digitalWillDefinitions } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import ApiResponse from '../utils/ApiResponse.js';

/**
 * Dead Man's Switch Middleware (L3)
 * Interceptor that monitors deep inactivity and triggers the "Verification Quest" for trustees.
 */
export const deadMansSwitch = async (req, res, next) => {
    const userId = req.user.id;

    try {
        // Fetch user's last activity and active succession plans
        const user = await db.query.users.findFirst({
            where: eq(users.id, userId)
        });

        // Threshold for "Deep Inactivity" (e.g. 90 days)
        const INACTIVITY_THRESHOLD_DAYS = 90;
        const lastActive = new Date(user.lastActive || user.createdAt);
        const daysInactive = Math.floor((new Date() - lastActive) / (1000 * 60 * 60 * 24));

        if (daysInactive >= INACTIVITY_THRESHOLD_DAYS) {
            // Check if there is an active will that should be verified
            const will = await db.query.digitalWillDefinitions.findFirst({
                where: and(eq(digitalWillDefinitions.userId, userId), eq(digitalWillDefinitions.status, 'active'))
            });

            if (will) {
                // Return a special status that triggers a mandatory "Proof of Life" in the UI
                return new ApiResponse(433, {
                    daysInactive,
                    willId: will.id,
                    verificationRequired: true,
                    message: 'Deep inactivity detected. Please verify your identity to prevent succession triggering.'
                }, 'CRITICAL: Dead Man\'s Switch Triggered').send(res);
            }
        }

        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Proof of Life Verifier
 */
export const verifyProofOfLife = (req, res, next) => {
    // Logic to verify biometrics or 2FA challenge response
    next();
};
