import React, { useState, useEffect } from 'react';
import { repairApi } from '../api.js';

function OpsAcceptance() {
  const [repairs, setRepairs] = useState([]);
  const [message, setMessage] = useState(null);

  const loadData = async () => {
    repairApi.list({ status: 'pending_acceptance' }).then(setRepairs);
    repairApi.list({ status: 'completed' }).then(r => setRepairs(prev => [...prev, ...r]));
  };

  useEffect(() => { loadData(); }, []);

  const handleAccept = async (id, passed) => {
    const remark = prompt(passed ? '验收备注（选填）：' : '驳回原因：');
    if (!passed && !remark) return;
    try {
      await repairApi.accept({ repairId: id, passed, remark: remark || '' });
      setMessage({ type: 'success', text: passed ? '验收通过！柜子已恢复可用状态' : '已驳回维修' });
      loadData();
    } catch (e) { setMessage({ type: 'error', text: e.message }); }
  };

  return (
    <div>
      <h2 className="page-title">✔️ 维修验收</h2>
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}
      <div className="card">
        <table>
          <thead><tr>
            <th>维修单号</th><th>柜号</th><th>故障描述</th><th>维修描述</th>
            <th>配件费</th><th>维修人</th><th>状态</th><th>操作</th>
          </tr></thead>
          <tbody>
            {repairs.length === 0 ? <tr><td colSpan="8" className="empty-state">暂无待验收维修</td></tr> : repairs.map(r => (
              <tr key={r.id}>
                <td style={{ fontSize: '12px' }}>{r.id}</td>
                <td>{r.locker_code}</td>
                <td style={{ fontSize: '12px' }}>{r.fault_description}</td>
                <td style={{ fontSize: '12px' }}>{r.repair_description || '-'}</td>
                <td>{r.parts_cost ? `¥${r.parts_cost}` : '-'}</td>
                <td>{r.assignee || '-'}</td>
                <td><span className={`badge ${r.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>
                  {{ pending_acceptance: '待验收', completed: '已验收通过', rejected: '验收驳回' }[r.status] || r.status}
                </span></td>
                <td>
                  {r.status === 'pending_acceptance' && (
                    <>
                      <button className="btn btn-success" style={{ padding: '2px 8px', fontSize: '12px', marginRight: '4px' }} onClick={() => handleAccept(r.id, true)}>验收通过</button>
                      <button className="btn btn-danger" style={{ padding: '2px 8px', fontSize: '12px' }} onClick={() => handleAccept(r.id, false)}>驳回</button>
                    </>
                  )}
                  {r.acceptance_remark && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>备注：{r.acceptance_remark}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default OpsAcceptance;
