const prisma = require('../config/prisma');

async function getMe(req, res, next) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { id: true, email: true, name: true, role: true, isPremium: true }
  });
  res.json(user);
}

async function updateMe(req, res, next) {
  const { name } = req.body;
  const user = await prisma.user.update({
    where: { id: req.user.userId },
    data: { name }
  });
  res.json({ message: 'Updated', user });
}

async function deleteMe(req, res, next) {
  try {
    const userId = req.user.userId;

    await prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: { assignedTo: userId },
        data: { assignedTo: null }
      });

      await tx.task.deleteMany({
        where: { ownerId: userId }
      });

      await tx.refreshToken.deleteMany({
        where: { userId }
      });

      await tx.idempotencyKey.deleteMany({
        where: { userId }
      });

      await tx.user.delete({
        where: { id: userId }
      });
    });

    return res.json({ message: 'Account deleted' });
  } catch (err) {
    next(err);
  }
}


async function listUsers(req, res, next) {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true }
  });
  res.json(users);
}

module.exports = { getMe, updateMe, deleteMe, listUsers };
