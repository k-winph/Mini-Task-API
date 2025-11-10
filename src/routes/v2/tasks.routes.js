const router = require('express').Router();
const prisma = require('../../config/prisma');
const authenticate = require('../../middleware/authenticate');
const abac = require('../../middleware/abac');
const idempotency = require('../../middleware/idempotency');

function parseIdParam(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: { code: 'INVALID_ID', message: 'param :id must be a positive integer' }
    });
  }
  req.params.id = id;
  next();
}

const asBool = (v) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
  }
  return undefined;
};

function parseSort(sortStr) {
  const fallback = { createdAt: 'desc' };
  if (!sortStr || typeof sortStr !== 'string') return fallback;

  const [fieldRaw, dirRaw] = sortStr.split(':');
  const field = (fieldRaw || '').trim();
  const dir = (dirRaw || 'asc').toLowerCase();

  const allowFields = new Set(['createdAt', 'updatedAt', 'title', 'priority', 'status']);
  const allowDirs = new Set(['asc', 'desc']);

  if (!allowFields.has(field) || !allowDirs.has(dir)) return fallback;
  return { [field]: dir };
}

/**
 * @openapi
 * /api/v2/tasks:
 *   get:
 *     summary: Get all tasks visible to current user (supports filtering, sorting, pagination)
 *     description: Authentication **optional**. Anonymous sees public tasks only; logged-in sees public + own; admin sees all.
 *     tags: [Tasks v2]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, in_progress, completed] }
 *       - in: query
 *         name: priority
 *         schema: { type: string, enum: [low, medium, high] }
 *       - in: query
 *         name: assignedTo
 *         schema: { type: integer, nullable: true }
 *       - in: query
 *         name: isPublic
 *         schema: { type: boolean }
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           example: createdAt:desc
 *           description: "Field:direction (createdAt|updatedAt|title|priority|status):(asc|desc)"
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
 *     responses:
 *       200:
 *         description: OK - list of tasks
 */
router.get('/', async (req, res, next) => {
  try {
    const isAuthed = !!req.user;
    const isAdmin = req.user?.role === 'admin';

    const { status, priority } = req.query;
    const assignedTo = req.query.assignedTo ? Number(req.query.assignedTo) : undefined;
    const isPublic = asBool(req.query.isPublic);
    const orderBy = parseSort(req.query.sort);

    const toSafeInt = (v, def) => {
      const n = parseInt(v, 10);
      return Number.isFinite(n) && n > 0 ? n : def;
    };

    const page  = toSafeInt(req.query.page, 1);
    const limit = Math.min(100, toSafeInt(req.query.limit, 10));
    const skip  = (page - 1) * limit;
    const take  = limit;

    const baseFilter = {
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(Number.isInteger(assignedTo) ? { assignedTo } : {}),
      ...(typeof isPublic === 'boolean' ? { isPublic } : {}),
    };

    const visibility =
      isAdmin
        ? {}
        : isAuthed
          ? { OR: [{ isPublic: true }, { ownerId: req.user.userId }] }
          : { isPublic: true };

    const where = { ...baseFilter, ...visibility };

    const [items, total] = await Promise.all([
      prisma.task.findMany({ where, orderBy, skip, take }),
      prisma.task.count({ where }),
    ]);

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      items,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v2/tasks:
 *   post:
 *     summary: Create a new task (idempotent with Idempotency-Key)
 *     description: Re-sending with the same Idempotency-Key and identical payload returns the cached response within 24h.
 *     tags: [Tasks v2]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string }
 *               description: { type: string, nullable: true }
 *               priority: { type: string, enum: [low, medium, high], default: medium }
 *               isPublic: { type: boolean, default: false }
 *     responses:
 *       201: { description: Task created }
 */
router.post('/', authenticate, idempotency, async (req, res, next) => {
  try {
    const { title, description, priority, isPublic } = req.body;
    if (!title) {
      return res.status(400).json({ error: { code: 'MISSING_FIELD', message: 'Title is required' } });
    }

    const wantsHigh = (priority || 'medium') === 'high';
    if (wantsHigh) {
      const u = req.user || {};
      const isPremiumValid = !!u.isPremium && u.subscriptionExpiry && new Date(u.subscriptionExpiry) > new Date();
      const allowed = u.role === 'admin' || isPremiumValid;
      if (!allowed) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN_HIGH_PRIORITY',
            message: 'High priority requires premium (active) or admin',
          },
        });
      }
    }

    const task = await prisma.task.create({
      data: {
        title,
        description,
        priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
        isPublic: typeof isPublic === 'boolean' ? isPublic : false,
        ownerId: req.user.userId
      }
    });
    res.status(201).json(task);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v2/tasks/{id}:
 *   get:
 *     summary: Get task by id (full)
 *     description: Authentication **optional**. Anonymous can view only public tasks.
 *     tags: [Tasks v2]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Not found or not visible }
 */
router.get('/:id', parseIdParam, async (req, res, next) => {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Task not found' } });

    const isAuthed = !!req.user;
    const isAdmin  = req.user?.role === 'admin';
    const canSee = isAdmin || task.isPublic || (isAuthed && task.ownerId === req.user.userId);

    if (!canSee) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Task not found' } });
    res.json(task);
  } catch (err) { next(err); }
});

const canAccessTask = async (req) => {
  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!task) return false;
  return task.ownerId === req.user.userId || req.user.role === 'admin';
};

/**
 * @openapi
 * /api/v2/tasks/{id}:
 *   put:
 *     summary: Update task (full update, full response)
 *     tags: [Tasks v2]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string }
 *               description: { type: string, nullable: true }
 *               priority: { type: string, enum: [low, medium, high] }
 *               status: { type: string, enum: [pending, in_progress, completed] }
 *               isPublic: { type: boolean }
 *               assignedTo: { type: integer, nullable: true }
 *     responses:
 *       200: { description: Updated }
 *       400: { description: Invalid payload }
 *       403: { description: Forbidden }
 */
router.put('/:id', parseIdParam, authenticate, abac(canAccessTask), async (req, res, next) => {
  try {
    const { title, description, priority, status, isPublic, assignedTo } = req.body;
    if (!title) return res.status(400).json({ error: { code: 'MISSING_FIELD', message: 'Title is required' } });
    if (priority && !['low','medium','high'].includes(priority)) {
      return res.status(400).json({ error: { code: 'INVALID_PRIORITY', message: 'Invalid task priority' } });
    }
    if (status && !['pending','in_progress','completed'].includes(status)) {
      return res.status(400).json({ error: { code: 'INVALID_STATUS', message: 'Invalid task status' } });
    }

    if (priority === 'high') {
      const u = req.user || {};
      const isPremiumValid = !!u.isPremium && u.subscriptionExpiry && new Date(u.subscriptionExpiry) > new Date();
      const allowed = u.role === 'admin' || isPremiumValid;
      if (!allowed) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN_HIGH_PRIORITY_UPDATE',
            message: 'Only active premium users or admin can set priority to high',
          },
        });
      }
    }

    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        title,
        description,
        priority: priority ?? undefined,
        status: status ?? undefined,
        isPublic: typeof isPublic === 'boolean' ? isPublic : undefined,
        assignedTo: Number.isInteger(assignedTo) ? assignedTo : undefined
      }
    });
    res.json(updated);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v2/tasks/{id}:
 *   delete:
 *     summary: Delete task
 *     tags: [Tasks v2]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Deleted }
 *       403: { description: Forbidden }
 */
router.delete('/:id', parseIdParam, authenticate, abac(canAccessTask), async (req, res, next) => {
  try {
    await prisma.task.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v2/tasks/{id}/status:
 *   patch:
 *     summary: Update task status (owner or admin only)
 *     description: Idempotent by nature. No Idempotency-Key required.
 *     tags: [Tasks v2]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
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
 *       200: { description: Task status updated successfully }
 *       400: { description: Invalid status or id }
 *       403: { description: Forbidden - ABAC policy denied }
 */
router.patch('/:id/status', parseIdParam, authenticate, abac(canAccessTask), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['pending', 'in_progress', 'completed'].includes(status)) {
      return res.status(400).json({ error: { code: 'INVALID_STATUS', message: 'Invalid task status' } });
    }
    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data: { status }
    });
    res.json(updated);
  } catch (err) { next(err); }
});

module.exports = router;
