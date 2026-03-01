import eventBus from '../events/eventBus.js';
import { logInfo } from '../utils/logger.js';

/**
 * Trigger Interceptor Middleware (#461)
 * ──────────────────────────────────────
 * Attaches to any route handler *after* the main action has completed.
 * It reads a standardised `req.autopilotSignal` object that the route
 * handler populates and emits the corresponding event onto the event bus.
 *
 * Pattern:
 *   1. Route handler sets `req.autopilotSignal = { event, payload }`.
 *   2. This middleware fires the event AFTER the response is sent.
 *   3. WorkflowEngine listener picks it up and evaluates workflows.
 *
 * This decouples workflow evaluation from the request/response cycle —
 * the user never waits for autopilot logic to complete.
 */
export const triggerInterceptor = (req, res, next) => {
    // Hook into response finish event
    res.on('finish', () => {
        const signal = req.autopilotSignal;
        if (!signal || !signal.event || res.statusCode >= 400) return;

        logInfo(`[TriggerInterceptor] ▷ Emitting ${signal.event} post-response.`);
        // Fire and forget — no await
        setImmediate(() => {
            eventBus.emit(signal.event, {
                userId: req.user?.id,
                ...signal.payload,
            });
        });
    });

    next();
};

/**
 * Helper: Attach an autopilot signal to the current request.
 * Call this from route handlers after the main DB operation.
 *
 * @param {import('express').Request} req
 * @param {string} event - Canonical event name (see eventBus.js catalogue)
 * @param {object} payload - Additional event data to merge with userId
 */
export const signalAutopilot = (req, event, payload = {}) => {
    req.autopilotSignal = { event, payload };
};
