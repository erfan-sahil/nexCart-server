import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

export const connectDatabase = async () => {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('error', (error: unknown) => {
    logger.error('MongoDB connection error', { err: error });
  });

  await mongoose.connect(env.MONGODB_URI);
  logger.info('MongoDB connected');
};

export const disconnectDatabase = async () => {
  if (mongoose.connection.readyState === mongoose.ConnectionStates.disconnected) {
    return;
  }

  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
};
