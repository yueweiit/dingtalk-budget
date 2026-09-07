import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAuthorizationUrl,
  buildLogoutUrl,
  consumeLoginTransaction,
  consumeLogoutTransaction,
  createLoginTransaction,
  createLogoutTransaction,
  getEimsConfig,
  getEimsDiscovery,
  getEimsUserInfo,
  resetEimsSsoStateForTest,
} from '../services/eims-sso.js';

const env = {
  EIMS_ISSUER: 'http://eims.test',
  EIMS_CLIENT_ID: 'client-id',
  EIMS_CLIENT_SECRET: 'client-secret',
  EIMS_REDIRECT_URI: 'http://localhost:3001/api/auth/eims/callback',
  EIMS_POST_LOGOUT_REDIRECT_URI: 'http://localhost:3001/api/auth/eims/logout/callback',
  EIMS_SCOPES: 'openid profile email',
};

const discovery = {
  issuer: 'http://eims.test',
  authorization_endpoint: 'http://eims.test/oauth/authorize',
  token_endpoint: 'http://eims.test/oauth/token',
  userinfo_endpoint: 'http://eims.test/oauth/userinfo',
  end_session_endpoint: 'http://eims.test/oauth/logout',
};

test('EIMS 登录地址使用授权码、PKCE 和一次性 state', () => {
  resetEimsSsoStateForTest();
  const config = getEimsConfig(env);
  const transaction = createLoginTransaction(0);
  const url = new URL(buildAuthorizationUrl(discovery, config, transaction));

  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state'), transaction.state);
  assert.equal(url.searchParams.get('nonce'), transaction.nonce);
  assert.notEqual(url.searchParams.get('code_challenge'), transaction.verifier);
  assert.equal(consumeLoginTransaction(transaction.state, 1)?.verifier, transaction.verifier);
  assert.equal(consumeLoginTransaction(transaction.state, 1), null);
});

test('EIMS Discovery 必须返回配置的 issuer 和所需端点', async () => {
  resetEimsSsoStateForTest();
  const config = getEimsConfig(env);
  const http = { get: async () => ({ data: discovery }) };
  const result = await getEimsDiscovery(config, http);
  assert.equal(result.userinfo_endpoint, discovery.userinfo_endpoint);
});

test('EIMS 用户必须有业务系统绑定值', async () => {
  const http = { get: async () => ({ data: { app_user_id: 'admin' } }) };
  const user = await getEimsUserInfo(discovery, 'access-token', http);
  assert.equal(user.appUserId, 'admin');
  await assert.rejects(
    () => getEimsUserInfo(discovery, 'access-token', { get: async () => ({ data: {} }) }),
    /未绑定/
  );
});

test('EIMS 退出地址带回调 state，回调只能使用一次', () => {
  resetEimsSsoStateForTest();
  const config = getEimsConfig(env);
  const state = createLogoutTransaction(0);
  const url = new URL(buildLogoutUrl(discovery, config, state));
  assert.equal(url.searchParams.get('post_logout_redirect_uri'), env.EIMS_POST_LOGOUT_REDIRECT_URI);
  assert.equal(consumeLogoutTransaction(state, 1), true);
  assert.equal(consumeLogoutTransaction(state, 1), false);
});
