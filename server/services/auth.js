import crypto from 'node:crypto';
import { query } from '../db/index.js';

export const AUTH_ROLES = Object.freeze({
  SUPERADMIN: 'superadmin',
  DEPARTMENT_SUPERVISOR: 'department_supervisor',
});

const SESSION_COOKIE = process.env.AUTH_SESSION_COOKIE || 'budget_session';
const SESSION_TTL_DAYS = Math.max(1, Number(process.env.AUTH_SESSION_TTL_DAYS || 7));

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(password), salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export function verifyPassword(password, storedHash) {
  const parts = String(storedHash || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  try {
    const [, n, r, p, saltText, expectedText] = parts;
    const expected = Buffer.from(expectedText, 'base64url');
    const actual = crypto.scryptSync(String(password), Buffer.from(saltText, 'base64url'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function parseCookies(header = '') {
  return String(header).split(';').reduce((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return cookies;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        // Ignore malformed cookies and let protected routes return 401.
      }
    }
    return cookies;
  }, {});
}

function cookieAttributes(maxAgeSeconds) {
  const sameSite = String(process.env.AUTH_COOKIE_SAMESITE || 'Lax').trim();
  const secure = process.env.AUTH_COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
  return [
    `${SESSION_COOKIE}=`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    `SameSite=${sameSite}`,
    secure ? 'Secure' : '',
    'HttpOnly',
  ].filter(Boolean).join('; ');
}

export function setSessionCookie(res, token) {
  const secure = process.env.AUTH_COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
  const sameSite = String(process.env.AUTH_COOKIE_SAMESITE || 'Lax').trim();
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${SESSION_TTL_DAYS * 86400}`,
    `SameSite=${sameSite}`,
    secure ? 'Secure' : '',
    'HttpOnly',
  ].filter(Boolean);
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', cookieAttributes(0));
}

function publicUser(row) {
  return {
    id: Number(row.id),
    username: row.username,
    role: row.role,
    departmentId: row.department_id || null,
    departmentName: row.department_name_snapshot || null,
  };
}

export async function loadSession(req, _res, next) {
  const token = parseCookies(req.headers.cookie || '')[SESSION_COOKIE];
  if (!token) return next();

  try {
    const result = await query(
      `SELECT u.id, u.username, u.role, u.department_id, u.department_name_snapshot
       FROM budget_sessions s
       JOIN budget_users u ON u.id = s.user_id
       WHERE s.token_hash = $1
         AND s.expires_at > CURRENT_TIMESTAMP
         AND u.active = true`,
      [sha256(token)]
    );
    if (result.rows[0]) {
      req.authUser = publicUser(result.rows[0]);
      await query('UPDATE budget_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = $1', [sha256(token)]);
    }
  } catch (error) {
    console.warn('[AUTH] Session lookup unavailable:', error.message);
  }
  return next();
}

export function requireAuth(req, res, next) {
  if (req.authUser) return next();
  return res.status(401).json({ success: false, message: '请先登录' });
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.authUser) return res.status(401).json({ success: false, message: '请先登录' });
    if (roles.includes(req.authUser.role)) return next();
    return res.status(403).json({ success: false, message: '没有执行此操作的权限' });
  };
}

export function isSuperAdmin(user) {
  return user?.role === AUTH_ROLES.SUPERADMIN;
}

export function buildDepartmentScopeSql(alias, user, paramIndex = 1) {
  if (!user || isSuperAdmin(user)) return { condition: 'TRUE', params: [], nextParamIndex: paramIndex };
  const departmentId = String(user.departmentId || '').trim();
  if (!departmentId) return { condition: 'FALSE', params: [], nextParamIndex: paramIndex };

  return {
    condition: `(
      NULLIF(BTRIM(${alias}.dept_id::text), '') = $${paramIndex}
      OR COALESCE(${alias}.dept_path_ids, '[]'::jsonb) @> jsonb_build_array($${paramIndex}::text)
    )`,
    params: [departmentId],
    nextParamIndex: paramIndex + 1,
  };
}

export function departmentRecordVisible(record, user) {
  if (!user || isSuperAdmin(user)) return true;
  const departmentId = String(user.departmentId || '').trim();
  if (!departmentId) return false;
  const recordId = String(record?.dept_id || record?.department_id || record?.applicant_department_id || '').trim();
  if (recordId === departmentId) return true;
  const path = record?.dept_path_ids || record?.department_path_ids || record?.applicant_department_path_ids;
  return Array.isArray(path) && path.map(String).includes(departmentId);
}

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await query(
    `INSERT INTO budget_sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP + ($3::int * INTERVAL '1 day'))`,
    [sha256(token), userId, SESSION_TTL_DAYS]
  );
  return token;
}

export async function deleteSession(req) {
  const token = parseCookies(req.headers.cookie || '')[SESSION_COOKIE];
  if (token) await query('DELETE FROM budget_sessions WHERE token_hash = $1', [sha256(token)]);
}

export { SESSION_COOKIE, publicUser };
