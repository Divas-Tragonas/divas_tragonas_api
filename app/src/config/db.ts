import mongoose from 'mongoose';
import type { FastifyBaseLogger } from 'fastify';
import { env } from './env';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

export async function connectDb(logger: FastifyBaseLogger): Promise<void> {
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mongoose.connect(env.MONGO_URL);
      logger.info('MongoDB connected');
      return;
    } catch (err) {
      const isLast = attempt === MAX_RETRIES;
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);

      if (isLast) {
        logger.error({ err }, 'MongoDB connection failed after max retries');
        throw err;
      }

      logger.error(
        { err, attempt, maxRetries: MAX_RETRIES, nextRetryMs: delay },
        'MongoDB connection attempt failed, retrying',
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

export function getDbStatus(): 'connected' | 'disconnected' {
  return mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
}
