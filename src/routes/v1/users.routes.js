const router = require('express').Router();

router.get('/me', (req, res) => {
  return res.json({ ok: true });
});

module.exports = router;
