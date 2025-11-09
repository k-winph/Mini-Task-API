const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');
const { randomUUID } = require('crypto');
const jwt = require('jsonwebtoken');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken
} = require('../utils/jwt');

async function register(req, res, next) {
  try {
    const { email, password, name } = req.body;
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(400).json({ error: { code: 'EMAIL_TAKEN', message: 'Email already registered' } });

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashed, name, role: 'user' }
    });
    res.status(201).json({ message: 'User registered', user: { id: user.id, email: user.email } });
  } catch (err) { next(err); }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });

    const tokenId = randomUUID();
    const accessToken = generateAccessToken(user);
    const refreshTokenStr = generateRefreshToken(user, tokenId);

    await prisma.refreshToken.create({ data: { userId: user.id, tokenId } });

    res.json({ accessToken, refreshToken: refreshTokenStr });
  } catch (err) { next(err); }
}

async function refresh(req, res, next) {
  try {
    const token = req.body.refreshToken;                 // <- ใช้ชื่อ token แทน
    if (!token) return res.status(400).json({ error: { code: 'NO_TOKEN', message: 'Missing refresh token' } });

    let payload;
    try {
      payload = verifyRefreshToken(token);               // <- เก็บผลตรวจใน payload
    } catch (e) {
      const code = (e instanceof jwt.TokenExpiredError) ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
      return res.status(401).json({ error: { code, message: e.message } });
    }

    const stored = await prisma.refreshToken.findUnique({ where: { tokenId: payload.tokenId } });
    if (!stored || stored.revoked) {
      return res.status(401).json({ error: { code: 'TOKEN_REVOKED', message: 'Refresh token invalid' } });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    const newAccess = generateAccessToken(user);
    return res.json({ accessToken: newAccess });
  } catch (err) { next(err); }
}

async function logout(req, res, next) {
  try {
    // 1) ดึง refresh token จากหลายแหล่ง
    const rt =
      (req.body && req.body.refreshToken) ||
      req.headers['x-refresh-token'] ||
      (req.cookies && req.cookies.refreshToken);

    if (!rt) {
      return res.status(400).json({
        error: {
          code: 'MISSING_REFRESH_TOKEN',
          message: 'refreshToken is required in body or x-refresh-token header',
          details: null,
          timestamp: new Date().toISOString(),
          path: req.originalUrl
        }
      });
    }

    // 2) verify และดึง tokenId ออกมา
    let payload;
    try {
      payload = jwt.verify(rt, process.env.JWT_REFRESH_SECRET);
    } catch (e) {
      return res.status(403).json({
        error: {
          code: 'INVALID_TOKEN',
          message: e.message || 'Invalid or expired refresh token',
          details: null,
          timestamp: new Date().toISOString(),
          path: req.originalUrl
        }
      });
    }

    // 3) เพิกถอนใน DB
    await prisma.refreshToken.update({
      where: { tokenId: payload.tokenId },
      data: { revoked: true }
    });

    // 4) สำเร็จ
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, refresh, logout };
