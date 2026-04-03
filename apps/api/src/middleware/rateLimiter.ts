import rateLimit from 'express-rate-limit';

// General API limit: 300 req/min per IP
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' },
});

// Stricter limit for auth/webhook endpoints: 20 req/min
export const strictLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests on this endpoint.' },
});
