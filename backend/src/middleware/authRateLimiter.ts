import rateLimit from 'express-rate-limit';

/**
 * Tighter than the global API rate limit — auth endpoints are the highest-
 * value brute-force target (credential stuffing, password guessing).
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.',
    details: null,
  },
});
