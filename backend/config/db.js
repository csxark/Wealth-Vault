
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Database Connection Manager with Retry Logic and Connection Pooling
 * 
 * Provides robust database connectivity with:
 * - Exponential backoff retry mechanism
 * - Connection pooling configuration
 * - Health check and readiness probes
 * - Graceful shutdown support
 * - Fail-fast on missing configuration
 */

let db = null;
let client = null;
let connectionState = 'DISCONNECTED'; // DISCONNECTED, CONNECTING, CONNECTED, FAILED
let connectionAttempts = 0;
let lastConnectionError = null;

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 5,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  factor: 2 // exponential backoff factor
};

// Connection pool configuration
const POOL_CONFIG = {
  max: parseInt(process.env.DB_POOL_MAX) || 20, // Maximum connections
  min: parseInt(process.env.DB_POOL_MIN) || 2,  // Minimum connections
  idle_timeout: parseInt(process.env.DB_IDLE_TIMEOUT) || 30, // 30 seconds
  connect_timeout: parseInt(process.env.DB_CONNECT_TIMEOUT) || 10, // 10 seconds
  max_lifetime: parseInt(process.env.DB_MAX_LIFETIME) || 3600, // 1 hour
};

/**
 * Calculate exponential backoff delay with jitter
 */
const getBackoffDelay = (attempt) => {
  const delay = Math.min(
    RETRY_CONFIG.baseDelay * Math.pow(RETRY_CONFIG.factor, attempt),
    RETRY_CONFIG.maxDelay
  );
  // Add jitter (random 0-30% of delay)
  const jitter = Math.random() * 0.3 * delay;
  return delay + jitter;
};

/**
 * Validate database configuration
 * @throws {Error} If DATABASE_URL is not configured
 */
const validateDatabaseConfig = () => {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    throw new Error(
      'CRITICAL: DATABASE_URL environment variable is not set.\\n' +
      'Please configure your database connection in the .env file.\\n' +
      'Example: DATABASE_URL=postgres://user:password@host:5432/database\\n' +
      '\\n' +
      'SECURITY WARNING: Never use hardcoded credentials or commit them to version control!'
    );
  }

  // Validate URL format
  try {
    const url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      throw new Error('DATABASE_URL must use postgres:// or postgresql:// protocol');
    }
  } catch (error) {
    throw new Error(
      `CRITICAL: Invalid DATABASE_URL format: ${error.message}\\n` +
      'Expected format: postgres://user:password@host:port/database'
    );
  }

  return connectionString;
};

/**
 * Create database connection with retry logic
 * @param {number} attempt - Current retry attempt (0-indexed)
 * @returns {Promise<Object>} Database instance
 */
const createConnection = async (attempt = 0) => {
  if (connectionState === 'CONNECTED' && db) {
    return db;
  }

  connectionState = 'CONNECTING';
  connectionAttempts = attempt + 1;

  try {
    console.log(`🔄 Attempting database connection (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1})...`);

    const connectionString = validateDatabaseConfig();

    // Create postgres client with connection pooling
    client = postgres(connectionString, {
      ...POOL_CONFIG,
      prepare: false,
      onnotice: () => {}, // Suppress notices
      debug: process.env.NODE_ENV === 'development' ? console.log : undefined,
    });

    // Test connection with timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection test timeout after 10s')), 10000)
    );

    const testPromise = client`SELECT 1 as test, current_database() as database, version() as version`;

    const result = await Promise.race([testPromise, timeoutPromise]);

    // Verify test query result
    if (!result || result.length === 0) {
      throw new Error('Database connection test returned unexpected result');
    }

    // Create Drizzle ORM instance
    db = drizzle(client, { schema });

    connectionState = 'CONNECTED';
    lastConnectionError = null;

    console.log('✅ Database connection successful');
    console.log(`   Database: ${result[0].database}`);
    console.log(`   Pool config: min=${POOL_CONFIG.min}, max=${POOL_CONFIG.max}, timeout=${POOL_CONFIG.connect_timeout}s`);

    return db;

  } catch (error) {
    connectionState = 'FAILED';
    lastConnectionError = error.message;

    console.error(`❌ Database connection failed (attempt ${attempt + 1}):`, error.message);

    // Cleanup failed client
    if (client) {
      try {
        await client.end({ timeout: 5 });
      } catch {}
      client = null;
    }

    // Retry with exponential backoff
    if (attempt < RETRY_CONFIG.maxRetries) {
      const delay = getBackoffDelay(attempt);
      console.log(`⏳ Retrying database connection in ${Math.round(delay / 1000)}s...`);

      await new Promise(resolve => setTimeout(resolve, delay));
      return createConnection(attempt + 1);
    }

    // Give up after max retries
    throw new Error(
      `CRITICAL: Failed to connect to database after ${RETRY_CONFIG.maxRetries + 1} attempts.\\n` +
      `Last error: ${error.message}\\n` +
      'Please verify:\\n' +
      '  1. DATABASE_URL is correctly configured\\n' +
      '  2. Database server is running and accessible\\n' +
      '  3. Network connectivity is available\\n' +
      '  4. Database credentials are correct'
    );
  }
};

/**
 * Initialize database connection
 * Must be called before server starts
 * @returns {Promise<Object>} Database instance
 */
export const connectDatabase = async () => {
  if (connectionState === 'CONNECTED' && db) {
    return db;
  }

  return await createConnection();
};

/**
 * Check if database is connected and healthy
 * @returns {Promise<boolean>} Connection health status
 */
export const isDatabaseHealthy = async () => {
  if (connectionState !== 'CONNECTED' || !client) {
    return false;
  }

  try {
    await client`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database health check failed:', error.message);
    return false;
  }
};

/**
 * Get current database connection state
 * @returns {Object} Connection state information
 */
export const getDatabaseState = () => ({
  state: connectionState,
  attempts: connectionAttempts,
  isConnected: connectionState === 'CONNECTED',
  lastError: lastConnectionError,
  poolConfig: POOL_CONFIG
});

/**
 * Gracefully disconnect from database
 * @param {number} timeout - Timeout in seconds (default: 10)
 * @returns {Promise<void>}
 */
export const disconnectDatabase = async (timeout = 10) => {
  if (client) {
    try {
      console.log('🔌 Closing database connection...');
      await client.end({ timeout });
      console.log('✅ Database connection closed gracefully');
      
      client = null;
      db = null;
      connectionState = 'DISCONNECTED';
    } catch (error) {
      console.error('❌ Error closing database connection:', error.message);
      throw error;
    }
  }
};

/**
 * Get the database client for raw queries
 * @returns {Object|null} Postgres client
 */
export const getClient = () => client;

// Export default db instance (will be null until connectDatabase is called)
export { db as default };
