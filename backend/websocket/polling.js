/**
 * Polling Fallback Service
 * 
 * For clients without WebSocket support (fallback mechanism)
 * Provides event polling via REST API
 */

import express from 'express';
import { eq, and, desc, gt } from 'drizzle-orm';
import { protect } from '../middleware/auth.js';
import { validateTenantAccess } from '../middleware/tenantMiddleware.js';
import db from '../config/db.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

// In-memory event store (or use database for persistence)
// For production, store in database with TTL
const eventStore = new Map(); // tenantId -> [events]

/**
 * Store event for polling clients
 */
export const storeEventForPolling = (tenantId, userId, eventType, payload, ttl = 3600000) => {
  try {
    if (!eventStore.has(tenantId)) {
      eventStore.set(tenantId, []);
    }

    const event = {
      id: uuidv4(),
      tenantId,
      userId,
      type: eventType,
      payload,
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + ttl)
    };

    const events = eventStore.get(tenantId);
    events.push(event);

    // Clean up old events
    const now = new Date();
    const filtered = events.filter(e => e.expiresAt > now);
    eventStore.set(tenantId, filtered);

    logger.debug('Event stored for polling', {
      eventId: event.id,
      tenantId,
      eventType
    });

    return event;
  } catch (error) {
    logger.error('Error storing event for polling:', error);
  }
};

/**
 * Create polling fallback routes
 */
export function createPollingRoutes() {
  const router = express.Router();

  /**
   * GET /api/polling/events
   * Get new events since last poll
   * Query params:
   *   - since: ISO timestamp (e.g., 2024-01-15T10:30:00Z)
   *   - limit: max events to return (default: 50)
   */
  router.get(
    '/:tenantId/events',
    protect,
    validateTenantAccess,
    async (req, res) => {
      try {
        const { tenantId } = req.params;
        const { since, limit = 50 } = req.query;

        let filtered = eventStore.get(tenantId) || [];

        // Filter by time if provided
        if (since) {
          const sinceTime = new Date(since);
          filtered = filtered.filter(e => e.timestamp > sinceTime);
        }

        // Sort by newest first
        filtered = filtered.sort((a, b) => b.timestamp - a.timestamp);

        // Limit results
        const events = filtered.slice(0, Math.min(parseInt(limit), 100));

        logger.info('Polling request served', {
          tenantId,
          eventCount: events.length
        });

        return res.status(200).json({
          success: true,
          data: events,
          timestamp: new Date()
        });
      } catch (error) {
        logger.error('Error fetching polling events:', error);
        return res.status(500).json({
          success: false,
          message: 'Error fetching events'
        });
      }
    }
  );

  /**
   * POST /api/polling/events/acknowledge
   * Mark events as read (optional)
   */
  router.post(
    '/:tenantId/events/acknowledge',
    protect,
    validateTenantAccess,
    async (req, res) => {
      try {
        const { tenantId } = req.params;
        const { eventIds } = req.body;

        if (!Array.isArray(eventIds)) {
          return res.status(400).json({
            success: false,
            message: 'eventIds must be an array'
          });
        }

        // Remove acknowledged events from store
        let events = eventStore.get(tenantId) || [];
        events = events.filter(e => !eventIds.includes(e.id));
        eventStore.set(tenantId, events);

        logger.info('Events acknowledged', {
          tenantId,
          eventCount: eventIds.length
        });

        return res.status(200).json({
          success: true,
          message: `${eventIds.length} events acknowledged`
        });
      } catch (error) {
        logger.error('Error acknowledging events:', error);
        return res.status(500).json({
          success: false,
          message: 'Error acknowledging events'
        });
      }
    }
  );

  /**
   * GET /api/polling/events/:eventId
   * Get specific event details
   */
  router.get(
    '/:tenantId/events/:eventId',
    protect,
    validateTenantAccess,
    async (req, res) => {
      try {
        const { tenantId, eventId } = req.params;

        const events = eventStore.get(tenantId) || [];
        const event = events.find(e => e.id === eventId);

        if (!event) {
          return res.status(404).json({
            success: false,
            message: 'Event not found'
          });
        }

        return res.status(200).json({
          success: true,
          data: event
        });
      } catch (error) {
        logger.error('Error fetching event:', error);
        return res.status(500).json({
          success: false,
          message: 'Error fetching event'
        });
      }
    }
  );

  /**
   * GET /api/polling/events/stats
   * Get event statistics
   */
  router.get(
    '/:tenantId/events/stats',
    protect,
    validateTenantAccess,
    async (req, res) => {
      try {
        const { tenantId } = req.params;

        const events = eventStore.get(tenantId) || [];

        // Group by event type
        const byType = {};
        events.forEach(e => {
          byType[e.type] = (byType[e.type] || 0) + 1;
        });

        return res.status(200).json({
          success: true,
          data: {
            totalEvents: events.length,
            eventTypes: byType,
            oldestEvent: events.length > 0 ? events[0].timestamp : null,
            newestEvent: events.length > 0 ? events[events.length - 1].timestamp : null
          }
        });
      } catch (error) {
        logger.error('Error getting event stats:', error);
        return res.status(500).json({
          success: false,
          message: 'Error getting statistics'
        });
      }
    }
  );

  return router;
}

/**
 * Polling configuration for clients
 */
export const pollingConfig = {
  // Minimum poll interval (ms)
  minInterval: 5000,

  // Default poll interval (ms)
  defaultInterval: 10000,

  // Maximum poll interval (ms)
  maxInterval: 60000,

  // Exponential backoff for retries
  backoffMultiplier: 1.5,

  // Maximum retries before giving up
  maxRetries: 5,

  // Event types to poll for
  eventTypes: [
    'expense:created',
    'expense:updated',
    'expense:deleted',
    'category:created',
    'category:updated',
    'goal:achieved',
    'budget:exceeded',
    'member:joined'
  ]
};

/**
 * Clean up old events periodically
 */
export function startEventCleanup(interval = 3600000) {
  setInterval(() => {
    try {
      const now = new Date();
      let totalRemoved = 0;

      eventStore.forEach((events, tenantId) => {
        const filtered = events.filter(e => e.expiresAt > now);
        const removed = events.length - filtered.length;
        totalRemoved += removed;

        if (filtered.length === 0) {
          eventStore.delete(tenantId);
        } else {
          eventStore.set(tenantId, filtered);
        }
      });

      if (totalRemoved > 0) {
        logger.info('Event cleanup completed', {
          eventsRemoved: totalRemoved
        });
      }
    } catch (error) {
      logger.error('Error during event cleanup:', error);
    }
  }, interval);
}

export default {
  storeEventForPolling,
  createPollingRoutes,
  pollingConfig,
  startEventCleanup
};
