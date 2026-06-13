import React, { useState, useEffect } from 'react';
import { lockerApi } from '../api.js';

const statusColors = {
  available: '#10b981', rented: '#ef4444', in_use: '#ef4444',
  overtime: '#f59e0b', maintenance: '#6b7280', disabled: '#6b7280',
  deposit_pending: '#8b5cf6', force_opened: '#f59e0b', swap_pending: '#3b82f6', unlocked_idle: '#f59e0b'
};

function AdminHeatmap() {
  const [heatmap, setHeatmap] = useState({});
  const [lockers, setLockers] = useState([]);

  const loadData = async () => {
    const [h, l] = await Promise.all([lockerApi.heatmap(), lockerApi.list()]);
    setHeatmap(h);
    setLockers(l);
  };

  useEffect(() => {
    loadData();
    const t = setInterval(loadData, 5000);
    return () => clearInterval(t);
  }, []);

  const statusCounts = {};
  lockers.forEach(l => { statusCounts[l.status] = (statusCounts[l.status] || 0) + 1; });

  return (
    <div>
      <h2 className="page-title">🗺️ 柜区总览（热力图）</h2>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">柜子总数</div>
          <div className="value">{lockers.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">空闲可用</div>
          <div className="value success">{statusCounts.available || 0}</div>
        </div>
        <div className="stat-card">
          <div className="label">使用中</div>
          <div className="value danger">{(statusCounts.rented || 0) + (statusCounts.in_use || 0) + (statusCounts.overtime || 0)}</div>
        </div>
        <div className="stat-card">
          <div className="label">维修/停用</div>
          <div className="value warning">{(statusCounts.maintenance || 0) + (statusCounts.disabled || 0)}</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>📊 各区域占用情况</h3>
        <div className="heatmap-grid">
          {Object.entries(heatmap).map(([zone, data]) => {
            let color = '#10b981';
            if (data.occupancyRate > 70) color = '#ef4444';
            else if (data.occupancyRate > 40) color = '#f59e0b';
            return (
              <div key={zone} className="heatmap-card">
                <div className="zone-name">{zone}</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color }}>{data.occupancyRate}%</div>
                <div className="heatmap-bar">
                  <div className="heatmap-bar-fill" style={{ width: `${data.occupancyRate}%`, background: color }} />
                </div>
                <div className="heatmap-stats">
                  <span>🟢 {data.available}</span>
                  <span>🔴 {data.rented}</span>
                  <span>⚪ {data.maintenance}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>🗄️ 柜子状态分布</h3>
        {[...new Set(lockers.map(l => l.zone))].map(zone => (
          <div key={zone} style={{ marginBottom: '20px' }}>
            <div style={{ fontWeight: 600, marginBottom: '10px', color: '#374151' }}>{zone}</div>
            <div className="locker-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))' }}>
              {lockers.filter(l => l.zone === zone).map(l => (
                <div
                  key={l.id}
                  className={`locker-box ${l.status}`}
                  title={`${l.locker_code} - ${l.locker_type} - ¥${l.base_deposit}`}
                  style={{ aspectRatio: '1.5' }}
                >
                  <div className="code">{l.locker_code}</div>
                  <div className="status-text" style={{ fontSize: '9px' }}>
                    {{ available: '空闲', rented: '已租', in_use: '使用中', overtime: '超时', maintenance: '维修', disabled: '停用', deposit_pending: '待付', force_opened: '强开', swap_pending: '换柜中', unlocked_idle: '未锁' }[l.status] || l.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AdminHeatmap;
