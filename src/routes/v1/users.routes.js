const router = require('express').Router();
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const { getMe, updateMe, deleteMe, listUsers } = require('../../controllers/users.controller');

router.get('/me', authenticate, getMe);
router.put('/me', authenticate, updateMe);
router.delete('/me', authenticate, deleteMe);

// admin only
router.get('/', authenticate, authorize(['admin']), listUsers);

module.exports = router;
