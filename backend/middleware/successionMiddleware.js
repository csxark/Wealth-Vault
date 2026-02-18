import successionService from '../services/successionService.js';

/**
 * Succession Middleware - Automated Presence Tracking
 * Updates the user's "last seen" timestamp on every API interaction.
 */
export const presenceTracker = async (req, res, next) => {
    if (req.user && req.user.id) {
        // Run in background to avoid blocking response
        successionService.trackActivity(req.user.id, 'api_interaction')
            .catch(err => console.error('[Presence Tracker] Failed:', err));
    }
    next();
};

export default presenceTracker;
