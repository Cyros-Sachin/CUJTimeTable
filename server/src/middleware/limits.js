import rateLimit from 'express-rate-limit';

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many login attempts. Try again later.' } },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many requests. Slow down.' } },
});
