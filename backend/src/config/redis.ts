import Redis from 'ioredis';
import { config } from './env';

let redisClient: Redis | null = null;
let isRedisAvailable = false;

export const getRedisClient = (): Redis => {
  if (!redisClient) {
    redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy: () => null, // don't infinite retry if offline
    });

    redisClient.on('connect', () => {
      isRedisAvailable = true;
      console.log('[Redis] Connected successfully to', `${config.redis.host}:${config.redis.port}`);
    });

    redisClient.on('error', (err) => {
      isRedisAvailable = false;
      // Suppress noisy ECONNREFUSED in local dev
    });
  }
  return redisClient;
};

export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    const client = getRedisClient();
    if (client.status === 'wait') {
      await client.connect();
    }
    const pong = await client.ping();
    isRedisAvailable = pong === 'PONG';
    return isRedisAvailable;
  } catch {
    isRedisAvailable = false;
    return false;
  }
};

export const getRedisStatus = (): boolean => isRedisAvailable;
