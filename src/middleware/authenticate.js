const jwt = require('jsonwebtoken');

module.exports = function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: { code: 'NO_TOKEN', message: 'Missing authorization header' } });

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = decoded; // { userId, email, role, isPremium }
    next();
  } catch (err) {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Token invalid or expired' } });
  }
};
