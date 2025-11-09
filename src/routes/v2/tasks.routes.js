const router = require('express').Router();
const prisma = require('../../config/prisma');
const authenticate = require('../../middleware/authenticate');
const abac = require('../../middleware/abac');
const idempotency = require('../../middleware/idempotency');

/** helper: แปลง :id ให้เป็น Number และตรวจความถูกต้อง */
function parseIdParam(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: {
        code: 'INVALID_ID',
        message: 'param :id must be a positive integer',
        details: null,
        timestamp: new Date().toISOString(),
        path: req.originalUrl
      }
    });
  }
  req.params.id = id; // เขียนทับให้เป็น Number
  next();
}

/**
 * @openapi
 * /api/v2/tasks:
 *   get:
 *     summary: Get all tasks visible to current user
 *     description: Returns tasks that are public or owned by the current user. If current user is admin, returns all tasks.
 *     tags: [Tasks v2]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK - list of tasks
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer, example: 1 }
 *                   title: { type: string, example: "Fix bug" }
 *                   description: { type: string, nullable: true }
 *                   status: { type: string, enum: [pending, in_progress, completed] }
 *                   priority: { type: string, enum: [low, medium, high] }
 *                   isPublic: { type: boolean }
 *                   ownerId: { type: integer, example: 1 }
 *                   assignedTo: { type: integer, nullable: true, example: 2 }
 *                   createdAt: { type: string, format: date-time }
 *                   updatedAt: { type: string, format: date-time }
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const isAdmin = req.user?.role === 'admin';

    const where = isAdmin
      ? {} // แอดมินเห็นทั้งหมด
      : {
          OR: [
            { isPublic: true },
            { ownerId: req.user.userId }
          ]
        };

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v2/tasks:
 *   post:
 *     summary: Create a new task (idempotent)
 *     description: Create a new task. If Idempotency-Key header is provided and already used (not expired), returns the cached result.
 *     tags: [Tasks v2]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: false
 *         schema:
 *           type: string
 *         description: Unique key to make the request idempotent
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string, example: "Fix Bug #101" }
 *               description: { type: string, nullable: true }
 *               priority: { type: string, enum: [low, medium, high], default: medium }
 *               isPublic: { type: boolean, default: false }
 *     responses:
 *       201:
 *         description: Task created
 *       400:
 *         description: Missing or invalid fields
 */
router.post('/', authenticate, idempotency, async (req, res, next) => {
  try {
    const { title, description, priority, isPublic } = req.body;
    if (!title) {
      return res.status(400).json({ error: { code: 'MISSING_FIELD', message: 'Title is required' } });
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
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v2/tasks/{id}/status:
 *   patch:
 *     summary: Update task status (owner or admin only)
 *     description: Only the task owner or an admin can update the status of a task.
 *     tags: [Tasks v2]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *         description: Task ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, in_progress, completed]
 *     responses:
 *       200: { description: Task status updated successfully }
 *       400: { description: Invalid status or id }
 *       403: { description: Forbidden - ABAC policy denied }
 */
const canAccessTask = async (req) => {
  // ตอนนี้ req.params.id ถูก parse เป็น Number แล้ว (จาก parseIdParam)
  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!task) return false;
  return task.ownerId === req.user.userId || req.user.role === 'admin';
};

router.patch('/:id/status', parseIdParam, authenticate, abac(canAccessTask), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['pending', 'in_progress', 'completed'].includes(status)) {
      return res.status(400).json({ error: { code: 'INVALID_STATUS', message: 'Invalid task status' } });
    }

    const updated = await prisma.task.update({
      where: { id: req.params.id }, // เป็น Number แล้ว
      data: { status }
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
