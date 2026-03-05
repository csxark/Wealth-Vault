/**
 * WebSocket Server Implementation
 * 
 * Real-time event broadcasting for Wealth-Vault with:
 * - Authenticated connections
 * - Tenant-isolated rooms
 * - Event-based pub/sub system
 * - Auto-reconnection support
 * - Fallback polling mechanism
 */

import { Server } from 'socket.io';
import { createServer } from 'http';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';
import { EventEmitter } from 'events';

// Create EventBus for app-wide event management
export class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }

  /**
   * Emit event to specific tenant
   */
  broadcastToTenant(tenantId, eventType, payload) {
    const eventKey = `tenant:${tenantId}:${eventType}`;
    this.emit(eventKey, payload);
  }

  /**
   * Emit event to specific user
   */
  broadcastToUser(userId, eventType, payload) {
    const eventKey = `user:${userId}:${eventType}`;
    this.emit(eventKey, payload);
  }

  /**
   * Emit global event
   */
  broadcastGlobal(eventType, payload) {
    this.emit(`global:${eventType}`, payload);
  }
}

export const eventBus = new EventBus();

/**
 * WebSocket Server Configuration & Setup
 */
export function setupWebSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    pingInterval: 25000,
    pingTimeout: 60000,
    transports: ['websocket', 'polling']
  });

  // Store active connections
  const activeConnections = new Map();

  /**
   * Middleware: Authenticate WebSocket connections
   */
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (!decoded || !decoded.id) {
        return next(new Error('Invalid token'));
      }

      // Attach user to socket
      socket.userId = decoded.id;
      socket.tenantId = decoded.tenantId || null;
      socket.email = decoded.email;

      next();
    } catch (error) {
      logger.error('WebSocket authentication failed:', error);
      next(new Error('Authentication failed'));
    }
  });

  /**
   * Connection handler
   */
  io.on('connection', (socket) => {
    const { userId, tenantId, email } = socket;

    logger.info('WebSocket connected', {
      socketId: socket.id,
      userId,
      tenantId,
      email
    });

    // Store connection
    activeConnections.set(socket.id, {
      userId,
      tenantId,
      email,
      connectedAt: new Date(),
      rooms: new Set()
    });

    /**
     * Event: User joins tenant room
     * Client should emit this after connection
     */
    socket.on('join-tenant', (tenantId, callback) => {
      try {
        const room = `tenant:${tenantId}`;
        socket.join(room);

        const connection = activeConnections.get(socket.id);
        if (connection) {
          connection.rooms.add(room);
        }

        logger.info('User joined tenant room', {
          socketId: socket.id,
          userId,
          tenantId,
          room
        });

        callback?.({ success: true, room });
      } catch (error) {
        logger.error('Error joining room:', error);
        callback?.({ success: false, error: error.message });
      }
    });

    /**
     * Event: User leaves tenant room
     */
    socket.on('leave-tenant', (tenantId, callback) => {
      try {
        const room = `tenant:${tenantId}`;
        socket.leave(room);

        const connection = activeConnections.get(socket.id);
        if (connection) {
          connection.rooms.delete(room);
        }

        logger.info('User left tenant room', {
          socketId: socket.id,
          userId,
          room
        });

        callback?.({ success: true });
      } catch (error) {
        logger.error('Error leaving room:', error);
        callback?.({ success: false, error: error.message });
      }
    });

    /**
     * Event: Get connection status
     */
    socket.on('get-status', (callback) => {
      try {
        const connection = activeConnections.get(socket.id);
        callback?.({
          connected: true,
          socketId: socket.id,
          userId,
          tenantId,
          rooms: Array.from(connection?.rooms || []),
          timestamp: new Date()
        });
      } catch (error) {
        callback?.({ connected: false, error: error.message });
      }
    });

    /**
     * Event: Ping/Heartbeat
     */
    socket.on('ping', (callback) => {
      callback?.({ pong: true, timestamp: new Date() });
    });

    /**
     * Event: Disconnect handler
     */
    socket.on('disconnect', (reason) => {
      logger.info('WebSocket disconnected', {
        socketId: socket.id,
        userId,
        reason
      });

      activeConnections.delete(socket.id);
    });

    /**
     * Event: Reconnect handler
     */
    socket.on('reconnect', () => {
      logger.info('WebSocket reconnected', {
        socketId: socket.id,
        userId
      });

      // Re-subscribe to rooms
      const connection = activeConnections.get(socket.id);
      if (connection) {
        connection.rooms.forEach(room => {
          socket.join(room);
        });
      }
    });

    /**
     * Event: Error handler
     */
    socket.on('error', (error) => {
      logger.error('WebSocket error:', error, {
        socketId: socket.id,
        userId
      });
    });
  });

  /**
   * Broadcasting functions
   */
  const broadcast = {
    /**
     * Broadcast to specific tenant
     */
    toTenant: (tenantId, eventType, payload) => {
      const room = `tenant:${tenantId}`;
      io.to(room).emit(eventType, {
        ...payload,
        timestamp: new Date(),
        tenantId
      });

      logger.info('Event broadcast to tenant', {
        tenantId,
        event: eventType,
        recipientCount: io.sockets.adapter.rooms.get(room)?.size || 0
      });
    },

    /**
     * Broadcast to specific user
     */
    toUser: (userId, eventType, payload) => {
      const room = `user:${userId}`;
      io.to(room).emit(eventType, {
        ...payload,
        timestamp: new Date(),
        userId
      });

      logger.info('Event broadcast to user', {
        userId,
        event: eventType,
        recipientCount: io.sockets.adapter.rooms.get(room)?.size || 0
      });
    },

    /**
     * Broadcast to all connected clients
     */
    toAll: (eventType, payload) => {
      io.emit(eventType, {
        ...payload,
        timestamp: new Date()
      });

      logger.info('Event broadcast to all', {
        event: eventType,
        recipientCount: io.engine.clientsCount
      });
    },

    /**
     * Broadcast to multiple tenants
     */
    toTenants: (tenantIds, eventType, payload) => {
      tenantIds.forEach(tid => {
        broadcast.toTenant(tid, eventType, payload);
      });
    }
  };

  /**
   * Get connection statistics
   */
  const getStats = () => {
    return {
      totalConnections: activeConnections.size,
      totalSockets: io.engine.clientsCount,
      rooms: Array.from(io.sockets.adapter.rooms.entries()).map(([name, sockets]) => ({
        name,
        size: sockets.size
      }))
    };
  };

  logger.info('WebSocket server initialized');

  return {
    io,
    broadcast,
    getStats,
    eventBus,
    activeConnections
  };
}

export default setupWebSocketServer;
