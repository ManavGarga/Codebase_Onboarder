import mongoose from 'mongoose';
import { config } from './env';

let isConnected = false;

export const connectDatabase = async (): Promise<boolean> => {
  try {
    mongoose.set('strictQuery', true);
    mongoose.set('bufferCommands', false);
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 1500,
    });
    isConnected = true;
    console.log('[Database] Successfully connected to MongoDB at', config.mongoUri);
    return true;
  } catch (error) {
    console.warn('[Database] MongoDB daemon offline. Using resilient in-memory fallback store.');
    isConnected = false;
    return false;
  }
};

export const getDbStatus = (): boolean => isConnected;
