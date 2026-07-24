import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test', 'staging']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  HOST: z.string().default('0.0.0.0'),
  API_PREFIX: z.string().default('/api/v1'),
  CLIENT_URL: z.string().url().default('http://localhost:3000'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().positive().default(10),
  MONGODB_MIN_POOL_SIZE: z.coerce.number().int().nonnegative().default(2),
  MONGODB_MAX_IDLE_TIME_MS: z.coerce.number().int().positive().default(30000),
  MONGODB_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  MONGODB_SOCKET_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),
  MONGODB_HEARTBEAT_FREQUENCY_MS: z.coerce.number().int().positive().default(10000),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  JWT_ISSUER: z.string().default('hrflow-pro'),
  JWT_AUDIENCE: z.string().default('hrflow-pro-api'),

  BCRYPT_SALT_ROUNDS: z.coerce.number().int().positive().default(12),

  PASSWORD_MIN_LENGTH: z.coerce.number().int().positive().default(12),
  PASSWORD_MAX_LENGTH: z.coerce.number().int().positive().default(128),
  PASSWORD_REQUIRE_UPPERCASE: z.coerce.boolean().default(true),
  PASSWORD_REQUIRE_LOWERCASE: z.coerce.boolean().default(true),
  PASSWORD_REQUIRE_NUMBERS: z.coerce.boolean().default(true),
  PASSWORD_REQUIRE_SPECIAL: z.coerce.boolean().default(true),
  PASSWORD_MAX_REPEATING_CHARS: z.coerce.number().int().positive().default(3),
  PASSWORD_HISTORY_LIMIT: z.coerce.number().int().positive().default(5),

  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
  CORS_CREDENTIALS: z.coerce.boolean().default(true),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_AUTH_MAX_REQUESTS: z.coerce.number().int().positive().default(10),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: z.coerce.boolean().default(true),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  SMTP_FROM_NAME: z.string().default('HRFlow Pro'),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
  LOG_DIR: z.string().default('logs'),

  UPLOAD_MAX_FILE_SIZE: z.coerce.number().int().positive().default(10485760),
  UPLOAD_ALLOWED_MIME_TYPES: z.string().default('image/jpeg,image/png,image/webp,application/pdf'),
  UPLOAD_DIR: z.string().default('uploads'),

  REDIS_URL: z.string().optional(),
  REDIS_ENABLED: z.coerce.boolean().default(false),

  SWAGGER_ENABLED: z.coerce.boolean().default(true),
  SWAGGER_PATH: z.string().default('/api-docs'),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters').optional(),

  ENCRYPTION_KEY: z.string().length(32, 'ENCRYPTION_KEY must be exactly 32 characters').optional(),
  ENCRYPTION_IV: z.string().length(16, 'ENCRYPTION_IV must be exactly 16 characters').optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsedEnv.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  env: parsedEnv.data.NODE_ENV,
  port: parsedEnv.data.PORT,
  host: parsedEnv.data.HOST,
  apiPrefix: parsedEnv.data.API_PREFIX,
  clientUrl: parsedEnv.data.CLIENT_URL,

  mongodb: {
    uri: parsedEnv.data.MONGODB_URI,
    maxPoolSize: parsedEnv.data.MONGODB_MAX_POOL_SIZE,
    minPoolSize: parsedEnv.data.MONGODB_MIN_POOL_SIZE,
    maxIdleTimeMs: parsedEnv.data.MONGODB_MAX_IDLE_TIME_MS,
    connectTimeoutMs: parsedEnv.data.MONGODB_CONNECT_TIMEOUT_MS,
    serverSelectionTimeoutMs: parsedEnv.data.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    socketTimeoutMs: parsedEnv.data.MONGODB_SOCKET_TIMEOUT_MS,
    heartbeatFrequencyMs: parsedEnv.data.MONGODB_HEARTBEAT_FREQUENCY_MS,
  },

  jwt: {
    accessSecret: parsedEnv.data.JWT_ACCESS_SECRET,
    refreshSecret: parsedEnv.data.JWT_REFRESH_SECRET,
    accessExpiry: parsedEnv.data.JWT_ACCESS_EXPIRY,
    refreshExpiry: parsedEnv.data.JWT_REFRESH_EXPIRY,
    issuer: parsedEnv.data.JWT_ISSUER,
    audience: parsedEnv.data.JWT_AUDIENCE,
  },

  bcrypt: {
    saltRounds: parsedEnv.data.BCRYPT_SALT_ROUNDS,
  },

  password: {
    minLength: parsedEnv.data.PASSWORD_MIN_LENGTH,
    maxLength: parsedEnv.data.PASSWORD_MAX_LENGTH,
    requireUppercase: parsedEnv.data.PASSWORD_REQUIRE_UPPERCASE,
    requireLowercase: parsedEnv.data.PASSWORD_REQUIRE_LOWERCASE,
    requireNumbers: parsedEnv.data.PASSWORD_REQUIRE_NUMBERS,
    requireSpecial: parsedEnv.data.PASSWORD_REQUIRE_SPECIAL,
    maxRepeatingChars: parsedEnv.data.PASSWORD_MAX_REPEATING_CHARS,
    historyLimit: parsedEnv.data.PASSWORD_HISTORY_LIMIT,
  },

  cors: {
    origin: parsedEnv.data.CORS_ORIGIN,
    credentials: parsedEnv.data.CORS_CREDENTIALS,
  },

  rateLimit: {
    windowMs: parsedEnv.data.RATE_LIMIT_WINDOW_MS,
    maxRequests: parsedEnv.data.RATE_LIMIT_MAX_REQUESTS,
    authMaxRequests: parsedEnv.data.RATE_LIMIT_AUTH_MAX_REQUESTS,
  },

  smtp: {
    host: parsedEnv.data.SMTP_HOST,
    port: parsedEnv.data.SMTP_PORT,
    secure: parsedEnv.data.SMTP_SECURE,
    user: parsedEnv.data.SMTP_USER,
    pass: parsedEnv.data.SMTP_PASS,
    from: parsedEnv.data.SMTP_FROM,
    fromName: parsedEnv.data.SMTP_FROM_NAME,
  },

  logging: {
    level: parsedEnv.data.LOG_LEVEL,
    dir: parsedEnv.data.LOG_DIR,
  },

  upload: {
    maxFileSize: parsedEnv.data.UPLOAD_MAX_FILE_SIZE,
    allowedMimeTypes: parsedEnv.data.UPLOAD_ALLOWED_MIME_TYPES.split(',').map((t) => t.trim()),
    dir: parsedEnv.data.UPLOAD_DIR,
  },

  redis: {
    url: parsedEnv.data.REDIS_URL,
    enabled: parsedEnv.data.REDIS_ENABLED,
  },

  swagger: {
    enabled: parsedEnv.data.SWAGGER_ENABLED,
    path: parsedEnv.data.SWAGGER_PATH,
  },

  session: {
    secret: parsedEnv.data.SESSION_SECRET,
  },

  encryption: {
    key: parsedEnv.data.ENCRYPTION_KEY,
    iv: parsedEnv.data.ENCRYPTION_IV,
  },

  isDevelopment: parsedEnv.data.NODE_ENV === 'development',
  isProduction: parsedEnv.data.NODE_ENV === 'production',
  isTest: parsedEnv.data.NODE_ENV === 'test',
} as const;

export type Config = typeof config;

export default config;