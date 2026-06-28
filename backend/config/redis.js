import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Redis Connection Manager with Circuit Breaker and Exponential Backoff
 * 
 * Handles Redis connection lifecycle with proper retry logic and graceful degradation.
 * Implements circuit breaker pattern to prevent cascading failures.
 */

let redisClient = null;
let connectionState = 'DISCONNECTED'; // DISCONNECTED, CONNECTING, CONNECTED, FAILED, CIRCUIT_OPEN
let circuitBreakerState = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
let lastConnectionAttempt = null;
let connectionAttempts = 0;
let warningShown = false;
let connectionPromise = null;

// Circuit breaker configuration
const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 3,
  resetTimeout: 60000, // 1 minute
  halfOpenMaxAttempts: 1
};

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 5,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  factor: 2 // exponential backoff factor
};

/**
 * Calculate exponential backoff delay
 */
const getBackoffDelay = (attempt) => {
  const delay = Math.min(
    RETRY_CONFIG.baseDelay * Math.pow(RETRY_CONFIG.factor, attempt),
    RETRY_CONFIG.maxDelay
  );
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 0.3 * delay;
  return delay + jitter;
};

/**
 * Check if circuit breaker should allow connection attempt
 */
const canAttemptConnection = () => {
  if (circuitBreakerState === 'CLOSED') return true;
  
  if (circuitBreakerState === 'OPEN') {
    const timeSinceLastAttempt = Date.now() - lastConnectionAttempt;
    if (timeSinceLastAttempt >= CIRCUIT_BREAKER_CONFIG.resetTimeout) {
      circuitBreakerState = 'HALF_OPEN';
      console.log('🔄 Circuit breaker transitioning to HALF_OPEN state');
      return true;
    }
    return false;
  }
  
  if (circuitBreakerState === 'HALF_OPEN') {
    return connectionAttempts < CIRCUIT_BREAKER_CONFIG.halfOpenMaxAttempts;
  }
  
  return false;
};

/**
 * Record connection success - close circuit breaker
 */
const recordSuccess = () => {
  connectionAttempts = 0;
  circuitBreakerState = 'CLOSED';
  connectionState = 'CONNECTED';
};

/**
 * Record connection failure - potentially open circuit breaker
 */
const recordFailure = () => {
  connectionAttempts++;
  lastConnectionAttempt = Date.now();
  
  if (connectionAttempts >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
    circuitBreakerState = 'OPEN';
    connectionState = 'CIRCUIT_OPEN';
    console.warn(
      `⚠️ Redis circuit breaker OPEN after ${connectionAttempts} failures. ` +
      `Will retry after ${CIRCUIT_BREAKER_CONFIG.resetTimeout / 1000}s`
    );
  } else {
    connectionState = 'FAILED';
  }
};

/**
 * Create and connect Redis client with retry logic
 */
const createRedisClient = async (retryAttempt = 0) => {
  // Return existing connection if available
  if (connectionState === 'CONNECTED' && redisClient?.isReady) {
    return redisClient;
  }

  // Return existing connection promise if already connecting
  if (connectionState === 'CONNECTING' && connectionPromise) {
    return connectionPromise;
  }

  // Check circuit breaker
  if (!canAttemptConnection()) {
    if (!warningShown) {
      console.warn('⚠️ Redis circuit breaker OPEN - using memory-based rate limiting');
      warningShown = true;
    }
    return null;
  }

  connectionState = 'CONNECTING';
  
  connectionPromise = (async () => {
    try {
      console.log(`🔄 Attempting Redis connection (attempt ${retryAttempt + 1}/${RETRY_CONFIG.maxRetries + 1})`);
      
      redisClient = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: (retries) => {
            // Let our custom retry logic handle reconnection
            if (retries > 3) return false;
            return Math.min(retries * 1000, 3000);
          }
        },
      });

      // Event handlers
      redisClient.on('error', (err) => {
        console.error('Redis error:', err.message);
        if (connectionState === 'CONNECTED') {
          connectionState = 'DISCONNECTED';
        }
      });

      redisClient.on('connect', () => {
        console.log('✅ Redis connected successfully');
      });

      redisClient.on('ready', () => {
        console.log('✅ Redis ready for rate limiting');
        recordSuccess();
      });

      redisClient.on('end', () => {
        console.log('🔌 Redis connection closed');
        connectionState = 'DISCONNECTED';
      });

      redisClient.on('reconnecting', () => {
        console.log('🔄 Redis reconnecting...');
        connectionState = 'CONNECTING';
      });

      // Connect and wait for ready state
      await redisClient.connect();
      
      // Verify connection with ping
      await redisClient.ping();
      
      recordSuccess();
      console.log('✅ Redis connection verified and ready');
      
      return redisClient;
    } catch (error) {
      console.error(`❌ Redis connection failed (attempt ${retryAttempt + 1}):`, error.message);
      
      recordFailure();
      
      // Cleanup failed client
      if (redisClient) {
        try {
          await redisClient.quit();
        } catch {}
        redisClient = null;
      }
      
      // Retry with exponential backoff
      if (retryAttempt < RETRY_CONFIG.maxRetries && canAttemptConnection()) {
        const delay = getBackoffDelay(retryAttempt);
        console.log(`⏳ Retrying Redis connection in ${Math.round(delay / 1000)}s...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return createRedisClient(retryAttempt + 1);
      }
      
      // Give up after max retries
      if (!warningShown) {
        console.warn(
          '⚠️ Redis connection failed after all retry attempts. ' +
          'Using memory-based rate limiting (not distributed across instances)'
        );
        warningShown = true;
      }
      
      connectionState = 'FAILED';
      return null;
    } finally {
      connectionPromise = null;
    }
  })();
  
  return connectionPromise;
};

/**
 * Get Redis client (returns null if not connected)
 */
export const getRedisClient = () => {
  return connectionState === 'CONNECTED' && redisClient?.isReady ? redisClient : null;
};

/**
 * Connect to Redis with retry logic
 * @param {boolean} waitForConnection - If true, waits for connection to establish
 * @returns {Promise<RedisClient|null>}
 */
export const connectRedis = async (waitForConnection = false) => {
  const client = await createRedisClient();
  
  if (waitForConnection && !client) {
    throw new Error('Failed to establish Redis connection after all retry attempts');
  }
  
  return client;
};

/**
 * Check if Redis is available and ready
 */
export const isRedisAvailable = () => {
  return connectionState === 'CONNECTED' && redisClient?.isReady;
};

/**
 * Get current connection state
 */
export const getConnectionState = () => ({
  state: connectionState,
  circuitBreaker: circuitBreakerState,
  attempts: connectionAttempts,
  lastAttempt: lastConnectionAttempt,
  isConnected: connectionState === 'CONNECTED',
  isReady: redisClient?.isReady || false
});

/**
 * Gracefully disconnect from Redis
 */
export const disconnectRedis = async () => {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('✅ Redis disconnected gracefully');
    } catch (error) {
      console.error('Error disconnecting Redis:', error.message);
    } finally {
      redisClient = null;
      connectionState = 'DISCONNECTED';
    }
  }
};

/**
 * Force reset circuit breaker (for testing/manual intervention)
 */
export const resetCircuitBreaker = () => {
  circuitBreakerState = 'CLOSED';
  connectionAttempts = 0;
  lastConnectionAttempt = null;
  console.log('🔄 Circuit breaker manually reset');
};

export default redisClient;