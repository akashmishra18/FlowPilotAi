process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test_jwt_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test_jwt_refresh_secret';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '15m';
process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';
process.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/flowpilot_ai_test';
