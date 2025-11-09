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
      // 1) งานที่เคยถูก assign ให้ผู้ใช้นี้ -> ปลดออก
      await tx.task.updateMany({
        where: { assignedTo: userId },
        data: { assignedTo: null }
      });

      // 2) งานที่ผู้ใช้นี้เป็น owner -> (ตัวอย่าง) ลบทั้งหมด
      //    (ถ้าไม่อยากลบ ให้ reassign ไป admin คนหนึ่งแทน)
      await tx.task.deleteMany({
        where: { ownerId: userId }
      });

      // 3) ลบ refresh tokens ของผู้ใช้นี้
      await tx.refreshToken.deleteMany({
        where: { userId }
      });

      // 4) (ถ้ามี) ลบ idempotency keys ของผู้ใช้นี้
      //    คุณมี model IdempotencyKey.key/userId/.. แต่ยังไม่ผูก relation
      //    ถ้ายังไม่ได้ผูก relation ก็ลบแบบ where: { userId } ได้เลย
      await tx.idempotencyKey.deleteMany({
        where: { userId }
      });

      // 5) ลบ user
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
