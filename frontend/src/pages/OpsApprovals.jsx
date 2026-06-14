import React, { useState, useEffect } from 'react';
import { approvalApi, lockerApi } from '../api.js';

function OpsApprovals({ user }) {
  const [approvals, setApprovals] = useState([]);
  const [lockers, setLockers] = useState([]);
  const [lockerId, setLockerId] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState(null);

  const canApply = user && ['admin', 'maintenance'].includes(user.role);
  const canApprove = user && user.role === 'finance';

  const loadData = async () => {
    try {
      const [a, l] = await Promise.all([
        approvalApi.list(),
        lockerApi.list()
      ]);
      setApprovals(a || []);
      setLockers(l || []);
    } catch (e) {
      setApprovals([]);
      setLockers([]);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleApply = async () => {
    if (!canApply) {
      setMessage({ type: 'error', text: '当前角色无申请权限' });
      return;
    }
    if (!lockerId || reason.trim().length < 5) {
      setMessage({ type: 'error', text: '请选择柜子并填写原因（至少5字）' });
      return;
    }
    try {
      await approvalApi.apply({ lockerId, reason });
      setMessage({ type: 'success', text: '申请已提交，等待财务审批' });
      setLockerId('');
      setReason('');
      loadData();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  const handleApprove = async (item, approved) => {
    if (!canApprove) {
      setMessage({ type: 'error', text: '仅财务角色可审批强制开柜申请' });
      return;
    }
    if (item.applicant === user.phone) {
      setMessage({ type: 'error', text: '不能审批自己提交的申请' });
      return;
    }
    const remark = approved ? prompt('审批备注（选填）：') : prompt('驳回原因：');
    if (!approved && !remark) return;
    try {
      await approvalApi.approve({
        approvalId: item.id,
        approved,
        remark: remark || ''
      });
      setMessage({ type: 'success', text: approved ? '已审批通过，柜子已解锁' : '已驳回' });
      loadData();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  const statusMap = {
    pending: '待审批',
    approved: '已通过',
    rejected: '已驳回'
  };

  return (
    <div>
      <h2 className="page-title">✅ 强制开柜审批</h2>
      <div className="alert alert-warning">
        管理员越权强制开柜需要财务审批，申请人与审批人须分离，系统会记录完整审计日志
      </div>
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      {canApply && (
        <div className="card">
          <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>提交强制开柜申请</h3>
          <div className="form-row">
            <label>选择柜子</label>
            <select value={lockerId} onChange={e => setLockerId(e.target.value)} style={{ minWidth: 300 }}>
              <option value="">-- 选择需要强制开柜的柜子 --</option>
              {lockers.map(l => (
                <option key={l.id} value={l.id}>
                  {l.zone} - {l.locker_code} [{l.status}]
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>开柜原因</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)}
              rows="3" style={{ minWidth: 400 }}
              placeholder="如：游客遗失腕带、警方取证、紧急情况等（至少5字）" />
          </div>
          <button className="btn btn-warning" onClick={handleApply}>
            提交申请（由财务审批）
          </button>
        </div>
      )}

      {!canApply && !canApprove && (
        <div className="alert alert-info">当前角色无强制开柜申请或审批权限，仅可查看</div>
      )}

      <div className="card">
        <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>审批列表</h3>
        <table>
          <thead>
            <tr>
              <th>申请单号</th>
              <th>柜号</th>
              <th>申请人</th>
              <th>申请角色</th>
              <th>原因</th>
              <th>申请时间</th>
              <th>状态</th>
              <th>审批人</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {approvals.length === 0
              ? <tr><td colSpan="9" className="empty-state">暂无申请记录</td></tr>
              : approvals.map(a => {
                  const isSelf = a.applicant === user?.phone;
                  const canDo = canApprove && a.status === 'pending' && !isSelf;
                  const showDisabledReason = canApprove && a.status === 'pending' && isSelf;
                  return (
                    <tr key={a.id}>
                      <td style={{ fontSize: '12px' }}>{a.id}</td>
                      <td>{a.locker_code}</td>
                      <td>
                        {a.applicant}
                        {isSelf && <span style={{ fontSize: '11px', color: '#6b7280', marginLeft: '4px' }}>（本人）</span>}
                      </td>
                      <td>
                        <span className="badge badge-info">
                          {{ admin: '管理员', maintenance: '运维', finance: '财务' }[a.applicant_role] || a.applicant_role}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', maxWidth: 200 }}>{a.reason}</td>
                      <td style={{ fontSize: '12px' }}>{a.created_at?.slice(0, 16)}</td>
                      <td>
                        <span className={`badge ${
                          a.status === 'approved' ? 'badge-success' :
                          a.status === 'rejected' ? 'badge-danger' : 'badge-warning'
                        }`}>
                          {statusMap[a.status] || a.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px' }}>
                        {a.approver || '-'}
                        {a.approval_time && <div style={{ fontSize: '11px', color: '#6b7280' }}>
                          {a.approval_time.slice(5, 16)}
                        </div>}
                      </td>
                      <td>
                        {canDo ? (
                          <>
                            <button
                              className="btn btn-success"
                              style={{ padding: '2px 8px', fontSize: '12px', marginRight: '4px' }}
                              onClick={() => handleApprove(a, true)}
                            >
                              通过
                            </button>
                            <button
                              className="btn btn-danger"
                              style={{ padding: '2px 8px', fontSize: '12px' }}
                              onClick={() => handleApprove(a, false)}
                            >
                              驳回
                            </button>
                          </>
                        ) : showDisabledReason ? (
                          <span style={{ fontSize: '11px', color: '#ef4444' }}>
                            不能自审
                          </span>
                        ) : a.status === 'pending' ? (
                          <span style={{ fontSize: '11px', color: '#6b7280' }}>
                            {canApprove ? '无权限' : '待处理'}
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#6b7280' }}>
                            {a.executed === 1 ? '已执行' : '已完结'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default OpsApprovals;
