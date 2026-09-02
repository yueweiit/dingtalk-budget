import React, { useState } from 'react';
import { login } from '../api';

const styles = {
  page: { minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#eef2f7', padding: 20 },
  panel: { width: 'min(420px, 100%)', background: '#fff', border: '1px solid #dbe3ec', borderRadius: 10, padding: 32, boxShadow: '0 12px 30px rgba(15, 23, 42, 0.08)' },
  title: { margin: '0 0 8px', color: '#0f172a', fontSize: 26 },
  subtitle: { margin: '0 0 24px', color: '#64748b', fontSize: 14 },
  label: { display: 'grid', gap: 7, marginBottom: 16, color: '#334155', fontSize: 13, fontWeight: 600 },
  input: { height: 42, border: '1px solid #cbd5e1', borderRadius: 6, padding: '0 12px', fontSize: 15, outline: 'none' },
  button: { width: '100%', height: 42, border: 0, borderRadius: 6, background: '#0f766e', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  error: { minHeight: 20, marginBottom: 12, color: '#b91c1c', fontSize: 13 },
};

export default function Login({ onLoggedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const result = await login(username, password);
      onLoggedIn(result.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || '登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={styles.page}>
      <form style={styles.panel} onSubmit={handleSubmit}>
        <h1 style={styles.title}>预算管理系统</h1>
        <p style={styles.subtitle}>请输入账号和密码登录</p>
        <label style={styles.label}>
          用户名
          <input style={styles.input} value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus />
        </label>
        <label style={styles.label}>
          密码
          <input style={styles.input} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
        </label>
        <div style={styles.error}>{error}</div>
        <button style={{ ...styles.button, opacity: loading ? 0.65 : 1 }} type="submit" disabled={loading}>
          {loading ? '登录中...' : '登录'}
        </button>
      </form>
    </main>
  );
}
