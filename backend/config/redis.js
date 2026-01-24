import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

let redisClient = null;
let redisConnectionAttempted = false;
let redisAvailable = false;
let warningShown = false;

const createRedisClient = async () => {
  if (redisConnectionAttempted) {
    return redisAvailable ? redisClient : null;
  }

  redisConnectionAttempted = true;

  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        connectTimeout: 2000,
        lazyConnect: true,
      },
    });

    redisClient.on('error', () => {
      redisAvailable = false;
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis connected for rate limiting');
      redisAvailable = true;
    });

    await redisClient.connect();
    redisAvailable = true;
    return redisClient;
  } catch (error) {
    if (!warningShown) {
      console.warn('⚠️ Redis not available, using memory-based rate limiting');
      warningShown = true;
    }
    redisAvailable = false;
    return null;
  }
};

export const getRedisClient = () => {
  return redisAvailable ? redisClient : null;
};

export const connectRedis = async () => {
  return await createRedisClient();
};

export const isRedisAvailable = () => {
  if (!warningShown && redisConnectionAttempted && !redisAvailable) {
    console.warn('⚠️ Redis not available, using memory-based rate limiting');
    warningShown = true;
  }
  return redisAvailable;
};

export default redisClient;