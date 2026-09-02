import express from 'express';
import { query } from '../db/index.js';
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  loadSession,
  publicUser,
  requireAuth,
  setSessionCookie,
  verifyPassword,
} from '../services/auth.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!username || !password) {
      return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
    }

    const result = await query(
      `SELECT id, username, password_hash, role, department_id, department_name_snapshot
       FROM budget_users
       WHERE username = $1 AND active = true`,
      [username]
    );
    const user = result.rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }

    const token = await createSession(user.id);
    setSessionCookie(res, token);
    return res.json({ success: true, data: publicUser(user) });
  } catch (error) {
    console.error('[AUTH] Login error:', error);
    return res.status(500).json({ success: false, message: '登录服务暂不可用' });
  }
});

router.get('/me', loadSession, (req, res) => {
  if (!req.authUser) return res.status(401).json({ success: false, message: '未登录' });
  return res.json({ success: true, data: req.authUser });
});

router.post('/logout', loadSession, async (req, res) => {
  try {
    await deleteSession(req);
  } finally {
    clearSessionCookie(res);
  }
  return res.json({ success: true });
});

router.get('/check', requireAuth, (req, res) => {
  res.json({ success: true, data: req.authUser });
});

export default router;
