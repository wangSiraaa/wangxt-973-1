import React, { useState, useEffect } from 'react';
import { auditApi } from '../api.js';
import dayjs from 'dayjs';

function OpsAudit() {
  const [audits, setAudits] = useState([]);
  const [operator, setOperator] = useState('');
  const [operation, setOperation] = useState('');
  const [startDate, setStartDate] = useState(dayjs().subtract(7, 'day').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(dayjs().format('YYYY-MM-DD'));

  const loadData = async () => {
    auditApi.list({ operator: operator || undefined, operation: operation || undefined, startDate, endDate }).then(setAudits);
  };

  useEffect(() => { loadData(); }, []);

  const opLabels = {
    rent_locker: '租柜', return_locker: '归还', report_fault: '报修',
    confirm_swap: '确认换柜', apply_swap: '申请换柜', force_close_order: '强制关单',
    bind_wristband: '绑定腕带', assign_repair: '派单', start_repair: '开始维修',
    complete_repair: '完成维修', accept_repair_pass: '验收通过', accept_repair_reject: '验收驳回',
    refund_success: '退款成功', refund_failed: '退款失败', retry_refund: '重试退款',
    overtime_reversal: '超时费冲正', write_off_hanging: '核销挂账', cash_refund_hanging: '现金退款核销',
    run_daily_settlement: '日结对账', lock_daily_settlement: '日结锁定',
    batch_disable_lockers: '批量停柜', register_left_item: '登记遗留物品', claim_left_item: '领取遗留物品',
    apply_force_open: '申请强制开柜', approve_force_open: '审批通过开柜', reject_force_open: '驳回开柜',
    mix_refund: '混合退款'
  };

  return (
    <div>
      <h2 className="page-title">📝 操作审计</h2>
      <div className="card">
        <div className="form-row">
          <label>操作人</label>
          <input type="text" value={operator} onChange={e => setOperator(e.target.value)} placeholder="手机号/工号" />
          <label>操作类型</label>
          <input type="text" value={operation} onChange={e => setOperation(e.target.value)} placeholder="如：rent_locker" />
        </div>
        <div className="form-row">
          <label>开始日期</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <label>结束日期</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          <button className="btn btn-primary" onClick={loadData}>查询</button>
        </div>
      </div>
      <div className="card">
        <table>
          <thead><tr>
            <th>时间</th><th>操作人</th><th>角色</th><th>操作</th><th>目标类型</th><th>目标ID</th><th>备注</th>
          </tr></thead>
          <tbody>
            {audits.length === 0 ? <tr><td colSpan="7" className="empty-state">暂无审计记录</td></tr> : audits.map(a => (
              <tr key={a.id}>
                <td style={{ fontSize: '12px' }}>{a.created_at}</td>
                <td>{a.operator}</td>
                <td><span className="badge badge-info">{{ visitor: '游客', admin: '管理员', finance: '财务', maintenance: '运维', system: '系统' }[a.operator_role] || a.operator_role}</span></td>
                <td style={{ fontWeight: 600 }}>{opLabels[a.operation] || a.operation}</td>
                <td>{a.target_type || '-'}</td>
                <td style={{ fontSize: '11px', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.target_id || '-'}</td>
                <td style={{ fontSize: '12px', maxWidth: 250 }}>
                  {a.remark || (a.after_data ? (() => { try { return JSON.stringify(JSON.parse(a.after_data)).slice(0, 100); } catch { return ''; } })() : '')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default OpsAudit;
