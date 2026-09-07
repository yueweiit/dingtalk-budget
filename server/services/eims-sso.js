import axios from 'axios';
import crypto from 'node:crypto';

const transactionTtlMs = 10 * 60 * 1000;
const loginTransactions = new Map();
const logoutTransactions = new Map();
let discoveryCache = null;

function required(env, key) {
  const value = String(env[key] || '').trim();
  if (!value) throw new Error(`缺少 EIMS 配置：${key}`);
  return value;
}

function normalizeIssuer(value) {
  return value.replace(/\/+$/, '');
}

function requireHttpUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`EIMS 配置无效：${label}`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`EIMS 配置无效：${label}`);
  }
  return url.toString();
}

function randomValue() {
  return crypto.randomBytes(32).toString('base64url');
}

function codeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function clearExpiredTransactions(store, now = Date.now()) {
  for (const [state, transaction] of store) {
    if (transaction.expiresAt <= now) store.delete(state);
  }
}

export function getEimsConfig(env = process.env) {
  return {
    issuer: normalizeIssuer(required(env, 'EIMS_ISSUER')),
    clientId: required(env, 'EIMS_CLIENT_ID'),
    clientSecret: required(env, 'EIMS_CLIENT_SECRET'),
    redirectUri: requireHttpUrl(required(env, 'EIMS_REDIRECT_URI'), 'EIMS_REDIRECT_URI'),
    postLogoutRedirectUri: requireHttpUrl(
      required(env, 'EIMS_POST_LOGOUT_REDIRECT_URI'),
      'EIMS_POST_LOGOUT_REDIRECT_URI'
    ),
    scopes: required(env, 'EIMS_SCOPES').split(/\s+/).filter(Boolean),
  };
}

export async function getEimsDiscovery(config, http = axios) {
  if (discoveryCache?.issuer === config.issuer) return discoveryCache.document;

  let response;
  try {
    response = await http.get(`${config.issuer}/oauth/.well-known/openid-configuration`);
  } catch {
    throw new Error('无法读取 EIMS Discovery 配置');
  }
  const document = response.data;
  if (normalizeIssuer(String(document.issuer || '')) !== config.issuer) {
    throw new Error('EIMS Discovery 的 issuer 不匹配');
  }

  for (const key of ['authorization_endpoint', 'token_endpoint', 'userinfo_endpoint', 'end_session_endpoint']) {
    requireHttpUrl(String(document[key] || ''), key);
  }

  discoveryCache = { issuer: config.issuer, document };
  return document;
}

export function createLoginTransaction(now = Date.now()) {
  clearExpiredTransactions(loginTransactions, now);
  const transaction = {
    state: randomValue(),
    nonce: randomValue(),
    verifier: randomValue(),
    expiresAt: now + transactionTtlMs,
  };
  loginTransactions.set(transaction.state, transaction);
  return transaction;
}

export function consumeLoginTransaction(state, now = Date.now()) {
  clearExpiredTransactions(loginTransactions, now);
  const transaction = loginTransactions.get(String(state || ''));
  if (!transaction) return null;
  loginTransactions.delete(transaction.state);
  return transaction;
}

export function buildAuthorizationUrl(discovery, config, transaction) {
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', config.scopes.join(' '));
  url.searchParams.set('state', transaction.state);
  url.searchParams.set('nonce', transaction.nonce);
  url.searchParams.set('code_challenge', codeChallenge(transaction.verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export async function exchangeAuthorizationCode(discovery, config, code, verifier, http = axios) {
  let response;
  try {
    response = await http.post(
      discovery.token_endpoint,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(code || ''),
        redirect_uri: config.redirectUri,
        code_verifier: verifier,
      }),
      { headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      } }
    );
  } catch {
    throw new Error('EIMS 授权码兑换失败');
  }
  const tokens = response.data;
  if (!tokens.access_token) throw new Error('EIMS 未返回访问令牌');
  return tokens;
}

export async function getEimsUserInfo(discovery, accessToken, http = axios) {
  let response;
  try {
    response = await http.get(discovery.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error('EIMS 用户信息读取失败');
  }
  const userInfo = response.data;
  const appUserId = String(userInfo.app_user_id || '').trim();
  if (!appUserId) throw new Error('EIMS 账号未绑定预算系统用户');
  return { appUserId };
}

export function createLogoutTransaction(now = Date.now()) {
  clearExpiredTransactions(logoutTransactions, now);
  const state = randomValue();
  logoutTransactions.set(state, { expiresAt: now + transactionTtlMs });
  return state;
}

export function consumeLogoutTransaction(state, now = Date.now()) {
  clearExpiredTransactions(logoutTransactions, now);
  const key = String(state || '');
  if (!logoutTransactions.has(key)) return false;
  logoutTransactions.delete(key);
  return true;
}

export function buildLogoutUrl(discovery, config, state) {
  const url = new URL(discovery.end_session_endpoint);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('post_logout_redirect_uri', config.postLogoutRedirectUri);
  url.searchParams.set('state', state);
  return url.toString();
}

export function resetEimsSsoStateForTest() {
  loginTransactions.clear();
  logoutTransactions.clear();
  discoveryCache = null;
}
