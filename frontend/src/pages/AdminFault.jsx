import React, { useState, useEffect } from 'react';
import { lockerApi, repairApi, orderApi } from '../api.js';

function AdminFault() {
  const [lockers, setLockers] = useState([]);
  const [repairs, setRepairs] = useState([]);
  const [selectedLocker, setSelectedLocker] = useState('');
  const [faultType, setFaultType] = useState('锁损坏');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState(null);

  const loadData = async () => {
    const [l, r] = await Promise.all([lockerApi.list(), repairApi.list()]);
    setLockers(l);
    setRepairs(r);
  };

  useEffect(() => { loadData(); }, []);

  const handleReport = async () => {
    if (!selectedLocker || !description.trim()) {
      setMessage({ type: 'error', text: '请选择柜子并填写故障描述' });
      return;
    }
    try {
      const result = await repairApi.report({ lockerId: selectedLocker, faultType, description });
      setMessage({ type: 'success', text: `报修成功！维修单号：${result.data.repairId}${result.data.activeOrderId ? '，已自动触发换柜流程' : ''}` });
      setSelectedLocker(''); setDescription('');
      loadData();
    } catch (e) { setMessage({ type: 'error', text: e.message }); }
  };

  const faultTypes = ['锁损坏', '柜门变形', '内部损坏', '异味严重', '电子故障', '其他'];

  return (
    <div>
      <h2 className="page-title">🔧 故障报修</h2>
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}
      <div className="card">
        <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>📝 新建报修</h3>
        <div className="form-row">
          <label>选择柜子</label>
          <select value={selectedLocker} onChange={e => setSelectedLocker(e.target.value)}>
            <option value="">-- 选择柜子 --</option>
            {lockers.filter(l => l.status !== 'maintenance').map(l => (
              <option key={l.id} value={l.id}>{l.zone} - {l.locker_code} [{l.status}]</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>故障类型</label>
          <select value={faultType} onChange={e => setFaultType(e.target.value)}>
            {faultTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label>详细描述</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            rows="3" style={{ minWidth: 400 }} placeholder="请详细描述故障情况" />
        </div>
        <button className="btn btn-warning" onClick={handleReport}>提交报修</button>
      </div>
      <div className="card">
        <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>📋 维修记录</h3>
        <table>
          <thead><tr><th>维修单号</th><th>柜号</th><th>区域</th><th>类型</th><th>报修时间</th><th>处理人</th><th>状态</th></tr></thead>
          <tbody>
            {repairs.length === 0 ? <tr><td colSpan="7" className="empty-state">暂无记录</td></tr> : repairs.map(r => (
              <tr key={r.id}>
                <td>{r.id}</td><td>{r.locker_code}</td><td>{r.zone}</td>
                <td>{r.fault_type}</td><td>{r.report_time}</td><td>{r.assignee || '-'}</td>
                <td><span className={`badge ${r.status === 'completed' ? 'badge-success' : r.status === 'pending_acceptance' ? 'badge-warning' : r.status === 'repairing' || r.status === 'assigned' ? 'badge-info' : 'badge-default'}`}>
                  {{ pending: '待处理', assigned: '已派单', repairing: '维修中', pending_acceptance: '待验收', completed: '已完成', rejected: '验收驳回' }[r.status] || r.status}
                </span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AdminFault;
