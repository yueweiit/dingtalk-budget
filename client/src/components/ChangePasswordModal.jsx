import React, { useState } from 'react';
import { changePassword } from '../api';

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1200,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    background: 'rgba(15, 23, 42, 0.48)',
  },
  panel: {
    width: 'min(440px, 100%)', background: '#fff', border: '1px solid #e5e7eb',
    borderRadius: '8px', padding: '24px', boxShadow: '0 16px 40px rgba(15, 23, 42, 0.18)',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '20px' },
  title: { margin: 0, fontSize: '18px', color: '#111827' },
  close: { border: '0', background: 'transparent', color: '#6b7280', fontSize: '22px', cursor: 'pointer', lineHeight: 1 },
  form: { display: 'grid', gap: '14px' },
  label: { display: 'grid', gap: '6px', fontSize: '13px', color: '#374151' },
  input: { height: '38px', padding: '0 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' },
  secondary: { height: '36px', padding: '0 14px', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', color: '#374151', cursor: 'pointer' },
  primary: { height: '36px', padding: '0 14px', border: '1px solid #2563eb', borderRadius: '6px', background: '#2563eb', color: '#fff', cursor: 'pointer' },
  error: { margin: 0, color: '#b91c1c', fontSize: '13px' },
  success: { margin: 0, color: '#047857', fontSize: '13px' },
};

export default function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setMessage('');
    setSuccess(false);
    setLoading(true);
    try {
      const result = await changePassword(currentPassword, newPassword, confirmPassword);
      setSuccess(true);
      setMessage(result.message || '密码修改成功');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setMessage(error.response?.data?.message || '密码修改失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <section style={styles.panel} onClick={(event) => event.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>修改密码</h2>
          <button type="button" style={styles.close} onClick={onClose} aria-label="关闭">×</button>
        </div>
        <form style={styles.form} onSubmit={submit}>
          <label style={styles.label}>当前密码<input style={styles.input} type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" /></label>
          <label style={styles.label}>新密码（至少 8 个字符）<input style={styles.input} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" /></label>
          <label style={styles.label}>确认新密码<input style={styles.input} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></label>
          {message && <p style={success ? styles.success : styles.error}>{message}</p>}
          <div style={styles.actions}>
            <button type="button" style={styles.secondary} onClick={onClose}>取消</button>
            <button type="submit" style={{ ...styles.primary, opacity: loading ? 0.65 : 1 }} disabled={loading}>{loading ? '提交中...' : '确认修改'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
