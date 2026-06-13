import React, { useState } from 'react';
import { authApi } from '../api.js';

function Login({ onLogin }) {
  const [role, setRole] = useState('visitor');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const roleOptions = [
    { value: 'visitor', label: '游客', phone: '13900000001', pwd: '' },
    { value: 'admin', label: '管理员', phone: '13800000001', pwd: 'admin123' },
    { value: 'finance', label: '财务', phone: '13800000002', pwd: 'finance123' },
    { value: 'maintenance', label: '运维', phone: '13800000003', pwd: 'ops123' }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!phone.trim()) {
      setError('请输入手机号');
      return;
    }
    if (role !== 'visitor' && !password) {
      setError('请输入密码');
      return;
    }
    try {
      setLoading(true);
      const result = await authApi.login({ phone, password: role === 'visitor' ? 'visitor' : password });
      if (result.success) {
        onLogin(result.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = (opt) => {
    setRole(opt.value);
    setPhone(opt.phone);
    setPassword(opt.pwd);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h2>🏊 水上乐园储物柜</h2>
        <p style={{ textAlign: 'center', color: '#6b7280', marginBottom: '20px', fontSize: '13px' }}>
          请选择身份登录
        </p>

        <div className="role-tabs" style={{ marginBottom: '20px' }}>
          {roleOptions.map(opt => (
            <div
              key={opt.value}
              className={`role-tab ${role === opt.value ? 'active' : ''}`}
              onClick={() => quickLogin(opt)}
            >
              {opt.label}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>手机号</label>
            <input
              type="text"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="请输入手机号"
            />
          </div>
          {role !== 'visitor' && (
            <div className="form-row">
              <label>密码</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="请输入密码"
              />
            </div>
          )}
          {error && <div className="alert alert-error">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? '登录中...' : '登 录'}
          </button>
        </form>

        <div style={{ marginTop: '20px', padding: '12px', background: '#f9fafb', borderRadius: '6px', fontSize: '12px', color: '#6b7280' }}>
          <div style={{ fontWeight: '600', marginBottom: '6px', color: '#374151' }}>💡 演示账号</div>
          <div>管理员：13800000001 / admin123</div>
          <div>财务：13800000002 / finance123</div>
          <div>运维：13800000003 / ops123</div>
          <div>游客：任意手机号（如13900000001）</div>
        </div>
      </div>
    </div>
  );
}

export default Login;
