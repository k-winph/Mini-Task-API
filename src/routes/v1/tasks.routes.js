const router = require('express').Router();
const prisma = require('../../config/prisma');
const authenticate = require('../../middleware/authenticate');
const abac = require('../../middleware/abac');
const idempotency = require('../../middleware/idempotency');

function parseIdParam(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: {
        code: 'INVALID_ID',
        message: 'param :id must be a positive integer',
        details: null,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
      },
    });
  }
  req.params.id = id;
  next();
}

const pickBasic = (t) => ({ id: t.id, title: t.title, status: t.status });

const canAccessTask = async (req) => {
  const task = await prisma.task.findUnique({
    where: { id: req.params.id },
    select: { id: true, ownerId: true },
  });
  if (!task) return false;
  return task.ownerId === req.user.userId || req.user.role === 'admin';
};

/**
 * @openapi
 * components:
 *   schemas:
 *     BasicTask:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 1 }
 *         title: { type: string, example: "Fix bug" }
 *         status:
 *           type: string
 *           enum: [pending, in_progress, completed]
 *           example: "pending"
 */

/**
 * @openapi
 * /api/v1/tasks:
 *   post:
 *     summary: Create task (basic response) — requires Idempotency-Key
 *     description: Idempotent create. Re-sending with the same Idempotency-Key and identical payload returns the cached response.
 *     tags: [Tasks v1]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema: { type: string }
 *         description: Required. Prevents duplicate creation on retries.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               priority: { type: string, enum: [low, medium, high] }
 *               isPublic: { type: boolean }
 *     responses:
 *       201:
 *         description: Created (basic task)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BasicTask' }
 *       200:
 *         description: Returned cached response (basic task) when Idempotency-Key is reused with identical payload
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BasicTask' }
 *       400: { description: Missing or invalid fields }
 *       409: { description: Idempotency-Key reused with different payload or scope }
 */
router.post('/', authenticate, idempotency, async (req, res, next) => {
  try {
    const { title, description, priority, isPublic } = req.body;
    if (!title) {
      return res
        .status(400)
        .json({ error: { code: 'MISSING_FIELD', message: 'Title is required' } });
    }

    const task = await prisma.task.create({
      data: {
        title,
        description,
        priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
        isPublic: typeof isPublic === 'boolean' ? isPublic : false,
        ownerId: req.user.userId,
      },
      select: { id: true, title: true, status: true },
    });

    res.status(201).json(pickBasic(task));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/tasks:
 *   get:
 *     summary: List tasks (basic response)
 *     tags: [Tasks v1]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, in_progress, completed] }
 *       - in: query
 *         name: priority
 *         schema: { type: string, enum: [low, medium, high] }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/BasicTask' }
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const isAdmin = req.user?.role === 'admin';
    const { status, priority } = req.query;

    const where = {
      ...(isAdmin ? {} : { OR: [{ isPublic: true }, { ownerId: req.user.userId }] }),
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
    };

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, status: true },
    });

    res.json(tasks.map(pickBasic));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/tasks/{id}:
 *   get:
 *     summary: Get task by id (basic response)
 *     tags: [Tasks v1]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BasicTask' }
 *       404: { description: Not found or not visible }
 */
router.get('/:id', parseIdParam, authenticate, async (req, res, next) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      select: { id: true, title: true, status: true, isPublic: true, ownerId: true },
    });
    if (!task) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Task not found' } });

    const canSee = task.isPublic || task.ownerId === req.user.userId || req.user.role === 'admin';
    if (!canSee) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Task not found' } });

    res.json(pickBasic(task));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/tasks/{id}:
 *   put:
 *     summary: Update task (full update, respond basic)
 *     tags: [Tasks v1]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               priority: { type: string, enum: [low, medium, high] }
 *               status: { type: string, enum: [pending, in_progress, completed] }
 *               isPublic: { type: boolean }
 *     responses:
 *       200:
 *         description: Updated (basic task)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BasicTask' }
 */
router.put('/:id', parseIdParam, authenticate, abac(canAccessTask), async (req, res, next) => {
  try {
    const { title, description, priority, status, isPublic } = req.body;
    if (!title) {
      return res.status(400).json({ error: { code: 'MISSING_FIELD', message: 'Title is required' } });
    }
    if (priority && !['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({ error: { code: 'INVALID_PRIORITY', message: 'Invalid task priority' } });
    }
    if (status && !['pending', 'in_progress', 'completed'].includes(status)) {
      return res.status(400).json({ error: { code: 'INVALID_STATUS', message: 'Invalid task status' } });
    }

    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        title,
        description,
        priority: priority ?? undefined,
        status: status ?? undefined,
        isPublic: typeof isPublic === 'boolean' ? isPublic : undefined,
      },
      select: { id: true, title: true, status: true },
    });

    res.json(pickBasic(updated));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/tasks/{id}/status:
 *   patch:
 *     summary: Update task status (respond basic). Idempotent by nature — no Idempotency-Key required.
 *     tags: [Tasks v1]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [pending, in_progress, completed] }
 *     responses:
 *       200:
 *         description: Status updated (basic task)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BasicTask' }
 */
router.patch('/:id/status', parseIdParam, authenticate, abac(canAccessTask), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['pending', 'in_progress', 'completed'].includes(status)) {
      return res.status(400).json({ error: { code: 'INVALID_STATUS', message: 'Invalid task status' } });
    }

    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data: { status },
      select: { id: true, title: true, status: true },
    });

    res.json(pickBasic(updated));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/tasks/{id}:
 *   delete:
 *     summary: Delete task
 *     tags: [Tasks v1]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200: { description: Deleted }
 */
router.delete('/:id', parseIdParam, authenticate, abac(canAccessTask), async (req, res, next) => {
  try {
    await prisma.task.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
