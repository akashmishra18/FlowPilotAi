import dotenv from 'dotenv';

dotenv.config();

/**
 * Central place to read environment variables.
 * Fail fast at boot if something required is missing, instead of
 * discovering it later as a runtime crash deep in a request handler.
 */
function required(name: string, fallbackForDev?: string): string {
  const value = process.env[name] ?? fallbackForDev;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 5000),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

  mongoUri: required(
    'MONGODB_URI',
    process.env.NODE_ENV === 'test' ? 'mongodb://localhost:27017/flowpilot_ai_test' : undefined,
  ),

  jwt: {
    secret: required('JWT_SECRET', process.env.NODE_ENV === 'test' ? 'test_jwt_secret' : undefined),
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshSecret: required(
      'JWT_REFRESH_SECRET',
      process.env.NODE_ENV === 'test' ? 'test_jwt_refresh_secret' : undefined,
    ),
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  aws: {
    region: process.env.AWS_REGION ?? '',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    backupBucket: process.env.AWS_S3_BACKUP_BUCKET ?? '',
  },

  ai: {
    provider: process.env.AI_PROVIDER ?? 'mock',
    apiKey: process.env.AI_API_KEY ?? '',
    model: process.env.AI_MODEL ?? '',
  },

  email: {
    provider: process.env.EMAIL_PROVIDER ?? 'mock',
    apiKey: process.env.EMAIL_API_KEY ?? '',
    fromAddress: process.env.EMAIL_FROM_ADDRESS ?? 'noreply@flowpilot.ai',
  },

  whatsapp: {
    provider: process.env.WHATSAPP_PROVIDER ?? 'mock',
    apiToken: process.env.WHATSAPP_API_TOKEN ?? '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? '',
  },

  logLevel: process.env.LOG_LEVEL ?? 'info',

  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 900000),
    max: Number(process.env.RATE_LIMIT_MAX ?? 300),
  },
};

export const isProduction = env.nodeEnv === 'production';
