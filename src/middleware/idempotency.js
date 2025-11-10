const prisma = require('../config/prisma');
const crypto = require('crypto');

const pickBasic = (t) => t && ({ id: t.id, title: t.title, status: t.status });

module.exports = async function idempotency(req, res, next) {
  try {
    const rawKey = req.get('Idempotency-Key');
    if (!rawKey) {
      return res.status(400).json({
        error: { code: 'MISSING_IDEMPOTENCY_KEY', message: 'Idempotency-Key header is required' }
      });
    }

    const userScope = req.user?.userId ?? 'anon';
    const pathScope = `${req.baseUrl}${req.path}`;
    const scopedKey = `${req.method}:${pathScope}:${userScope}:${rawKey}`;

    const isV1Basic = pathScope.startsWith('/api/v1/tasks');

    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(req.body))
      .digest('hex');

    const existing = await prisma.idempotencyKey.findUnique({ where: { key: scopedKey } });

    if (existing) {
      if (existing.requestHash !== requestHash) {
        return res.status(409).json({
          error: {
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'This Idempotency-Key was used with a different payload.'
          }
        });
      }
      if (existing.expiresAt > new Date()) {
        const cached = existing.response;
        return res.json(isV1Basic ? pickBasic(cached) : cached);
      }
    }

    const oldJson = res.json.bind(res);
    res.json = async (body) => {
      try {
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const toStore = isV1Basic ? pickBasic(body) : body;

        await prisma.idempotencyKey.upsert({
          where: { key: scopedKey },
          update: { response: toStore, expiresAt: expires, requestHash },
          create: {
            key: scopedKey,
            userId: req.user?.userId ?? null,
            endpoint: pathScope,
            requestHash,
            response: toStore,
            expiresAt: expires
          }
        });
      } catch (e) {
        console.error('Idempotency save failed:', e.message);
      }
      return oldJson(isV1Basic ? pickBasic(body) : body);
    };

    next();
  } catch (err) {
    next(err);
  }
};
