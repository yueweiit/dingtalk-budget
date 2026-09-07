import express from 'express';
import { query } from '../db/index.js';
import {
  clearEimsSessionMarker,
  clearSessionCookie,
  createSession,
  deleteSession,
  loadSession,
  publicUser,
  requireAuth,
  setEimsSessionMarker,
  setSessionCookie,
  verifyPassword,
} from '../services/auth.js';
import {
  buildAuthorizationUrl,
  buildLogoutUrl,
  consumeLoginTransaction,
  consumeLogoutTransaction,
  createLoginTransaction,
  createLogoutTransaction,
  exchangeAuthorizationCode,
  getEimsConfig,
  getEimsDiscovery,
  getEimsUserInfo,
} from '../services/eims-sso.js';

const router = express.Router();

function frontendUrl() {
  return String(process.env.CORS_ORIGIN || 'http://localhost:5173').trim();
}

function redirectToLogin(res, error) {
  const url = new URL(frontendUrl());
  if (error) url.searchParams.set('sso_error', error);
  return res.redirect(url.toString());
}

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
    clearEimsSessionMarker(res);
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
    clearEimsSessionMarker(res);
  }
  return res.json({ success: true });
});

router.get('/eims/start', async (_req, res) => {
  try {
    const config = getEimsConfig();
    const [discovery, transaction] = await Promise.all([
      getEimsDiscovery(config),
      Promise.resolve(createLoginTransaction()),
    ]);
    return res.redirect(buildAuthorizationUrl(discovery, config, transaction));
  } catch (error) {
    console.error('[AUTH] EIMS login start failed:', error.message);
    return redirectToLogin(res, 'unavailable');
  }
});

router.get('/eims/callback', async (req, res) => {
  const transaction = consumeLoginTransaction(req.query.state);
  if (!transaction) return redirectToLogin(res, 'invalid_state');
  if (req.query.error || !req.query.code) return redirectToLogin(res, 'denied');

  try {
    const config = getEimsConfig();
    const discovery = await getEimsDiscovery(config);
    const tokens = await exchangeAuthorizationCode(discovery, config, req.query.code, transaction.verifier);
    const { appUserId } = await getEimsUserInfo(discovery, tokens.access_token);
    const result = await query(
      `SELECT id, username, role, department_id, department_name_snapshot
       FROM budget_users
       WHERE username = $1 AND active = true`,
      [appUserId]
    );
    const user = result.rows[0];
    if (!user) return redirectToLogin(res, 'account_not_bound');

    const token = await createSession(user.id);
    setSessionCookie(res, token);
    setEimsSessionMarker(res);
    return res.redirect(frontendUrl());
  } catch (error) {
    console.error('[AUTH] EIMS callback failed:', error.message);
    return redirectToLogin(res, 'failed');
  }
});

router.post('/eims/logout', requireAuth, async (req, res) => {
  try {
    const config = getEimsConfig();
    const discovery = await getEimsDiscovery(config);
    const state = createLogoutTransaction();
    const logoutUrl = buildLogoutUrl(discovery, config, state);
    await deleteSession(req);
    clearSessionCookie(res);
    clearEimsSessionMarker(res);
    return res.json({ success: true, data: { logoutUrl } });
  } catch (error) {
    console.error('[AUTH] EIMS logout start failed:', error.message);
    return res.status(500).json({ success: false, message: '单点退出暂不可用' });
  }
});

router.get('/eims/logout/callback', (req, res) => {
  if (!consumeLogoutTransaction(req.query.state)) return redirectToLogin(res, 'invalid_logout_state');
  return redirectToLogin(res);
});

router.get('/check', requireAuth, (req, res) => {
  res.json({ success: true, data: req.authUser });
});

export default router;
