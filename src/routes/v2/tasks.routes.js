const router = require('express').Router();

router.get('/', (req, res) => {
  const now = new Date().toISOString();
  return res.json({
    id: '1',
    title: 'Fix bug',
    status: 'pending',
    metadata: { createdAt: now, updatedAt: now, version: 'v2' },
  });
});

module.exports = router;
