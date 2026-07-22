import mongoose, { Connection, ConnectOptions } from 'mongoose';
import { config } from './environment';

let cachedConnection: Connection | null = null;

interface MongoConnectionOptions extends ConnectOptions {
  maxPoolSize: number;
  minPoolSize: number;
  maxIdleTimeMS: number;
  connectTimeoutMS: number;
  socketTimeoutMS: number;
}

const createConnectionOptions = (): MongoConnectionOptions => ({
  maxPoolSize: config.mongodb.maxPoolSize,
  minPoolSize: config.mongodb.minPoolSize,
  maxIdleTimeMS: config.mongodb.maxIdleTimeMS,
  connectTimeoutMS: config.mongodb.connectTimeoutMS,
  socketTimeoutMS: config.mongodb.socketTimeoutMS,
  serverSelectionTimeoutMS: 5000,
  heartbeatFrequencyMS: 10000,
  retryWrites: true,
  retryReads: true,
  compressors: ['zlib'],
  zlibCompressionLevel: 6,
  autoIndex: config.isDevelopment,
  autoCreate: config.isDevelopment,
});

const connectWithRetry = async (uri: string, options: MongoConnectionOptions, retries = 5, delay = 5000): Promise<Connection> => {
  try {
    const connection = await mongoose.createConnection(uri, options).asPromise();
    console.info(`[MongoDB] Connected successfully to ${connection.host}:${connection.port}/${connection.name}`);
    return connection;
  } catch (error) {
    if (retries <= 0) {
      console.error('[MongoDB] Connection failed after retries:', error);
      throw error;
    }
    console.warn(`[MongoDB] Connection failed, retrying in ${delay}ms... (${retries} retries left)`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return connectWithRetry(uri, options, retries - 1, delay * 2);
  }
};

export const connectDatabase = async (): Promise<Connection> => {
  if (cachedConnection && cachedConnection.readyState === 1) {
    return cachedConnection;
  }

  if (cachedConnection && cachedConnection.readyState === 2) {
    await cachedConnection.asPromise();
    return cachedConnection;
  }

  const options = createConnectionOptions();
  cachedConnection = await connectWithRetry(config.mongodb.uri, options);

  setupConnectionEventHandlers(cachedConnection);

  return cachedConnection;
};

export const getDatabase = (): Connection => {
  if (!cachedConnection) {
    throw new Error('Database not initialized. Call connectDatabase() first.');
  }
  return cachedConnection;
};

export const disconnectDatabase = async (): Promise<void> => {
  if (cachedConnection) {
    await cachedConnection.close();
    cachedConnection = null;
    console.info('[MongoDB] Disconnected');
  }
};

const setupConnectionEventHandlers = (connection: Connection): void => {
  connection.on('connected', () => {
    console.info('[MongoDB] Connection established');
  });

  connection.on('disconnected', () => {
    console.warn('[MongoDB] Disconnected');
  });

  connection.on('reconnected', () => {
    console.info('[MongoDB] Reconnected');
  });

  connection.on('error', (error) => {
    console.error('[MongoDB] Connection error:', error);
  });

  connection.on('close', () => {
    console.info('[MongoDB] Connection closed');
  });

  process.on('SIGINT', async () => {
    await disconnectDatabase();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await disconnectDatabase();
    process.exit(0);
  });
};

export const getConnectionStatus = (): string => {
  if (!cachedConnection) return 'disconnected';

  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return states[cachedConnection.readyState] || 'unknown';
};

export const isConnected = (): boolean => {
  return cachedConnection !== null && cachedConnection.readyState === 1;
};

export const getPoolStats = () => {
  if (!cachedConnection) return null;

  const db = cachedConnection.db;
  if (!db) return null;

  return {
    readyState: cachedConnection.readyState,
    host: cachedConnection.host,
    port: cachedConnection.port,
    name: cachedConnection.name,
    collections: Object.keys(db.collections).length,
  };
};

export default {
  connect: connectDatabase,
  disconnect: disconnectDatabase,
  getDatabase,
  getConnectionStatus,
  isConnected,
  getPoolStats,
};