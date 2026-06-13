import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Login from './pages/Login.jsx';
import VisitorRent from './pages/VisitorRent.jsx';
import VisitorOrders from './pages/VisitorOrders.jsx';
import AdminRent from './pages/AdminRent.jsx';
import AdminReturn from './pages/AdminReturn.jsx';
import AdminFault from './pages/AdminFault.jsx';
import AdminSwap from './pages/AdminSwap.jsx';
import AdminForceClose from './pages/AdminForceClose.jsx';
import AdminHeatmap from './pages/AdminHeatmap.jsx';
import FinanceLedger from './pages/FinanceLedger.jsx';
import FinanceHanging from './pages/FinanceHanging.jsx';
import FinanceSettlement from './pages/FinanceSettlement.jsx';
import FinanceDifferences from './pages/FinanceDifferences.jsx';
import OpsRepair from './pages/OpsRepair.jsx';
import OpsAcceptance from './pages/OpsAcceptance.jsx';
import OpsBatch from './pages/OpsBatch.jsx';
import OpsItems from './pages/OpsItems.jsx';
import OpsAudit from './pages/OpsAudit.jsx';
import OpsApprovals from './pages/OpsApprovals.jsx';

function MenuItem({ to, label, active, onClick }) {
  return (
    <div className={`menu-item ${active ? 'active' : ''}`} onClick={() => onClick(to)}>
      {label}
    </div>
  );
}

function Layout({ children, user, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();

  const menuConfig = {
    visitor: [
      { to: '/visitor/rent', label: '🏊 租柜' },
      { to: '/visitor/orders', label: '📋 我的订单' }
    ],
    admin: [
      { to: '/admin/heatmap', label: '🗺️ 柜区总览' },
      { to: '/admin/rent', label: '🔑 出租' },
      { to: '/admin/return', label: '↩️ 归还' },
      { to: '/admin/fault', label: '🔧 故障报修' },
      { to: '/admin/swap', label: '🔄 换柜处理' },
      { to: '/admin/force-close', label: '🔐 强制关单' },
      { to: '/ops/approvals', label: '✅ 强制开柜审批' }
    ],
    finance: [
      { to: '/finance/ledger', label: '💰 押金账本' },
      { to: '/finance/hanging', label: '⚠️ 异常挂账' },
      { to: '/finance/settlement', label: '📊 日结对账' },
      { to: '/finance/differences', label: '🔍 差异明细' }
    ],
    maintenance: [
      { to: '/ops/repair', label: '🔧 维修记录' },
      { to: '/ops/acceptance', label: '✔️ 维修验收' },
      { to: '/ops/batch', label: '📦 批量停柜' },
      { to: '/ops/items', label: '👜 遗留物品' },
      { to: '/ops/audit', label: '📝 操作审计' },
      { to: '/ops/approvals', label: '✅ 强制开柜审批' }
    ]
  };

  const menus = menuConfig[user.role] || [];
  const roleNames = { visitor: '游客', admin: '管理员', finance: '财务', maintenance: '运维' };

  return (
    <div className="app-container">
      <div className="navbar">
        <h1>🏊 水上乐园储物柜系统</h1>
        <div className="user-info">
          <span>👤 {user.name} ({roleNames[user.role] || user.role})</span>
          <button onClick={onLogout}>退出</button>
        </div>
      </div>
      <div className="layout">
        <div className="sidebar">
          {menus.map(m => (
            <MenuItem
              key={m.to}
              to={m.to}
              label={m.label}
              active={location.pathname === m.to}
              onClick={navigate}
            />
          ))}
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('locker_user');
    return saved ? JSON.parse(saved) : null;
  });

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('locker_user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('locker_user');
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  const defaultRoutes = {
    visitor: '/visitor/rent',
    admin: '/admin/heatmap',
    finance: '/finance/ledger',
    maintenance: '/ops/repair'
  };

  return (
    <Layout user={user} onLogout={handleLogout}>
      <Routes>
        <Route path="/" element={<Navigate to={defaultRoutes[user.role] || '/visitor/rent'} replace />} />
        <Route path="/visitor/rent" element={<VisitorRent user={user} />} />
        <Route path="/visitor/orders" element={<VisitorOrders user={user} />} />
        <Route path="/admin/heatmap" element={<AdminHeatmap user={user} />} />
        <Route path="/admin/rent" element={<AdminRent user={user} />} />
        <Route path="/admin/return" element={<AdminReturn user={user} />} />
        <Route path="/admin/fault" element={<AdminFault user={user} />} />
        <Route path="/admin/swap" element={<AdminSwap user={user} />} />
        <Route path="/admin/force-close" element={<AdminForceClose user={user} />} />
        <Route path="/finance/ledger" element={<FinanceLedger user={user} />} />
        <Route path="/finance/hanging" element={<FinanceHanging user={user} />} />
        <Route path="/finance/settlement" element={<FinanceSettlement user={user} />} />
        <Route path="/finance/differences" element={<FinanceDifferences user={user} />} />
        <Route path="/ops/repair" element={<OpsRepair user={user} />} />
        <Route path="/ops/acceptance" element={<OpsAcceptance user={user} />} />
        <Route path="/ops/batch" element={<OpsBatch user={user} />} />
        <Route path="/ops/items" element={<OpsItems user={user} />} />
        <Route path="/ops/audit" element={<OpsAudit user={user} />} />
        <Route path="/ops/approvals" element={<OpsApprovals user={user} />} />
        <Route path="*" element={<Navigate to={defaultRoutes[user.role] || '/visitor/rent'} replace />} />
      </Routes>
    </Layout>
  );
}

export default App;
