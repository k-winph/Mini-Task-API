const router = require('express').Router();

router.get('/', (req, res) => {
  return res.json({ id: '1', title: 'Fix bug', status: 'pending' });
});

module.exports = router;          // << ต้องเป็นแบบนี้ (ไม่มี {} หุ้ม)
