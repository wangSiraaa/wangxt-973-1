import React, { useState, useEffect } from 'react';
import { approvalApi, lockerApi } from '../api.js';

function OpsApprovals() {
  const [approvals, setApprovals] = useState([]);
  const [lockers, setLockers] = useState([]);
  const [lockerId, setLockerId] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState(null);

  const loadData = async () => {
    const [a, l] = await Promise.all([approvalApi.list(), lockerApi.list()]);
    setApprovals(a);
    setLockers(l);
  };

  useEffect(() => { loadData(); }, []);

  const handleApply = async () => {
    if (!lockerId || reason.trim().length < 5) {
      setMessage({ type: 'error', text: '请选择柜子并填写原因（至少5字）' });
      return;
    }
    try {
      await approvalApi.apply({ lockerId, reason });
      setMessage({ type: 'success', text: '申请已提交，等待审批' });
      setLockerId(''); setReason('');
      loadData();
    } catch (e) { setMessage({ type: 'error', text: e.message }); }
  };

  const handleApprove = async (id, approved) => {
    const remark = approved ? prompt('审批备注（选填）：') : prompt('驳回原因：');
    if (!approved && !remark) return;
    try {
      await approvalApi.approve({ approvalId: id, approved, remark: remark || '' });
      setMessage({ type: 'success', text: approved ? '已审批通过，柜子已解锁' : '已驳回' });
      loadData();
    } catch (e) { setMessage({ type: 'error', text: e.message }); }
  };

  return (
    <div>
      <h2 className="page-title">✅ 强制开柜审批</h2>
      <div className="alert alert-warning">管理员越权强制开柜需要审批，系统会记录完整审计日志</div>
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}
      <div className="card">
        <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>提交强制开柜申请</h3>
        <div className="form-row">
          <label>选择柜子</label>
          <select value={lockerId} onChange={e => setLockerId(e.target.value)} style={{ minWidth: 300 }}>
            <option value="">-- 选择需要强制开柜的柜子 --</option>
            {lockers.map(l => <option key={l.id} value={l.id}>{l.zone} - {l.locker_code} [{l.status}]</option>)}
          </select>
        </div>
        <div className="form-row">
          <label>开柜原因</label>
          <textarea value={reason} onChange={e => setReason(e.target.value)}
            rows="3" style={{ minWidth: 400 }} placeholder="如：游客遗失腕带、警方取证、紧急情况等（至少5字）" />
        </div>
        <button className="btn btn-warning" onClick={handleApply}>提交申请</button>
      </div>
      <div className="card">
        <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>审批列表</h3>
        <table>
          <thead><tr>
            <th>申请单号</th><th>柜号</th><th>申请人</th><th>原因</th><th>申请时间</th><th>状态</th><th>操作</th>
          </tr></thead>
          <tbody>
            {approvals.length === 0 ? <tr><td colSpan="7" className="empty-state">暂无申请记录</td></tr> : approvals.map(a => (
              <tr key={a.id}>
                <td style={{ fontSize: '12px' }}>{a.id}</td>
                <td>{a.locker_code}</td>
                <td>{a.applicant}</td>
                <td style={{ fontSize: '12px', maxWidth: 200 }}>{a.reason}</td>
                <td style={{ fontSize: '12px' }}>{a.created_at}</td>
                <td><span className={`badge ${a.status === 'approved' ? 'badge-success' : a.status === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>
                  {{ pending: '待审批', approved: '已通过', rejected: '已驳回' }[a.status] || a.status}</span></td>
                <td>
                  {a.status === 'pending' && (
                    <>
                      <button className="btn btn-success" style={{ padding: '2px 8px', fontSize: '12px', marginRight: '4px' }} onClick={() => handleApprove(a.id, true)}>通过</button>
                      <button className="btn btn-danger" style={{ padding: '2px 8px', fontSize: '12px' }} onClick={() => handleApprove(a.id, false)}>驳回</button>
                    </>
                  )}
                  {a.approver && <div style={{ fontSize: '11px', color: '#6b7280' }}>{a.approver} - {a.approval_time?.slice(5, 16)}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default OpsApprovals;
