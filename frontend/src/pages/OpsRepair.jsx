import React, { useState, useEffect } from 'react';
import { repairApi } from '../api.js';

function OpsRepair() {
  const [repairs, setRepairs] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [message, setMessage] = useState(null);

  const loadData = async () => {
    repairApi.list({ status: statusFilter || undefined }).then(setRepairs);
  };

  useEffect(() => { loadData(); }, [statusFilter]);

  const handleAssign = async (id) => {
    const assignee = prompt('请输入处理人工号/姓名：');
    if (!assignee) return;
    try {
      await repairApi.assign({ repairId: id, assignee });
      setMessage({ type: 'success', text: '派单成功' });
      loadData();
    } catch (e) { setMessage({ type: 'error', text: e.message }); }
  };

  const handleStart = async (id) => {
    try {
      await repairApi.start({ repairId: id });
      setMessage({ type: 'success', text: '已开始维修' });
      loadData();
    } catch (e) { setMessage({ type: 'error', text: e.message }); }
  };

  const handleComplete = async (id) => {
    const desc = prompt('请输入维修描述：');
    if (!desc) return;
    const cost = parseFloat(prompt('请输入配件费用（元）：', '0') || '0');
    try {
      await repairApi.complete({ repairId: id, description: desc, partsCost: cost });
      setMessage({ type: 'success', text: '维修完成，等待验收' });
      loadData();
    } catch (e) { setMessage({ type: 'error', text: e.message }); }
  };

  const statusLabels = { pending: '待处理', assigned: '已派单', repairing: '维修中', pending_acceptance: '待验收', completed: '已完成', rejected: '验收驳回' };
  const statusBadge = { pending: 'badge-default', assigned: 'badge-info', repairing: 'badge-info', pending_acceptance: 'badge-warning', completed: 'badge-success', rejected: 'badge-danger' };

  return (
    <div>
      <h2 className="page-title">🔧 维修记录</h2>
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}
      <div className="card">
        <div className="form-row">
          <label>状态筛选</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">全部</option>
            {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="card">
        <table>
          <thead><tr>
            <th>维修单号</th><th>柜号</th><th>区域</th><th>故障类型</th>
            <th>报修时间</th><th>处理人</th><th>状态</th><th>配件费</th><th>操作</th>
          </tr></thead>
          <tbody>
            {repairs.length === 0 ? <tr><td colSpan="9" className="empty-state">暂无维修记录</td></tr> : repairs.map(r => (
              <tr key={r.id}>
                <td style={{ fontSize: '12px' }}>{r.id}</td>
                <td>{r.locker_code}</td><td>{r.zone}</td>
                <td>{r.fault_type}</td>
                <td style={{ fontSize: '12px' }}>{r.report_time}</td>
                <td>{r.assignee || '-'}</td>
                <td><span className={`badge ${statusBadge[r.status] || 'badge-default'}`}>{statusLabels[r.status] || r.status}</span></td>
                <td>{r.parts_cost ? `¥${r.parts_cost}` : '-'}</td>
                <td>
                  {r.status === 'pending' && (
                    <button className="btn btn-primary" style={{ padding: '2px 8px', fontSize: '12px' }} onClick={() => handleAssign(r.id)}>派单</button>
                  )}
                  {r.status === 'assigned' && (
                    <button className="btn btn-info" style={{ padding: '2px 8px', fontSize: '12px' }} onClick={() => handleStart(r.id)}>开始维修</button>
                  )}
                  {r.status === 'repairing' && (
                    <button className="btn btn-success" style={{ padding: '2px 8px', fontSize: '12px' }} onClick={() => handleComplete(r.id)}>完成维修</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default OpsRepair;
