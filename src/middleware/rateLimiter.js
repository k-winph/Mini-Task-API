// src/middleware/rateLimiter.js
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const WINDOW_MS = 15 * 60 * 1000;           
const ROLE_LIMITS = { anonymous: 20, user: 100, premium: 500 };

function getRole(req) {
  return (req?.user?.role) || 'anonymous';
}

const limiter = rateLimit({
  windowMs: WINDOW_MS,
  max: (req) => ROLE_LIMITS[getRole(req)] ?? ROLE_LIMITS.anonymous,

  keyGenerator: (req, res) => {
    const key = req?.user?.userId
      ? `user:${req.user.userId}`
      : `anon:${ipKeyGenerator(req, res)}`;
    console.log('[RL] key=', key, 'ip=', req.ip, 'xff=', req.get('x-forwarded-for'));
    return key;
  },

  standardHeaders: false,
  legacyHeaders: true,

  handler: async (req, res, _next, options) => {
    const resetMs = req.rateLimit?.resetTime
      ? Math.max(0, req.rateLimit.resetTime.getTime() - Date.now())
      : WINDOW_MS;
    const retryAfter = Math.ceil(resetMs / 1000);

    const limit = typeof options.max === 'function'
      ? await options.max(req, res)
      : options.max;

    const remaining = Math.max(0, (req.rateLimit && req.rateLimit.remaining) || 0);

    res.set('Retry-After', String(retryAfter));
    res.set('X-RateLimit-Limit', String(limit));
    res.set('X-RateLimit-Remaining', String(remaining));
    res.set('X-RateLimit-Reset', String(Math.floor((Date.now() + resetMs) / 1000)));

    return res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message:
          `Too many requests. Try again in ${retryAfter >= 60
            ? `${Math.ceil(retryAfter / 60)} minutes`
            : `${retryAfter} seconds`}.`,
        retryAfter,
      },
    });
  },
});

module.exports = limiter;
