import React, { useState, useEffect } from 'react';
import { financeApi } from '../api.js';
import dayjs from 'dayjs';

function FinanceSettlement() {
  const [settlements, setSettlements] = useState([]);
  const [settleDate, setSettleDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [message, setMessage] = useState(null);

  const loadData = async () => {
    financeApi.settlements().then(setSettlements);
  };

  useEffect(() => { loadData(); }, []);

  const handleRun = async () => {
    if (!confirm(`确认对 ${settleDate} 进行日结对账？`)) return;
    try {
      const result = await financeApi.runSettlement({ settleDate });
      setMessage({ type: 'success', text: `日结完成！收款¥${result.data.total_deposit_collected}，退款¥${result.data.total_deposit_refunded}，超时费净收入¥${result.data.total_overtime_fee}` });
      loadData();
    } catch (e) { setMessage({ type: 'error', text: e.message }); }
  };

  const handleLock = async (date) => {
    if (!confirm(`确认锁定 ${date} 日结？锁定后将无法修改当日所有订单和退款！`)) return;
    try {
      await financeApi.lockSettlement({ settleDate: date });
      setMessage({ type: 'success', text: `日结已锁定：${date}` });
      loadData();
    } catch (e) { setMessage({ type: 'error', text: e.message }); }
  };

  return (
    <div>
      <h2 className="page-title">📊 日结对账</h2>
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}
      <div className="card">
        <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>执行日结</h3>
        <div className="form-row">
          <label>日期</label>
          <input type="date" value={settleDate} onChange={e => setSettleDate(e.target.value)} />
          <button className="btn btn-primary" onClick={handleRun}>执行对账</button>
        </div>
        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
          日结将汇总当日押金收退、超时费用，并列出差异明细。请先处理完所有挂账后再锁定。
        </div>
      </div>
      <div className="card">
        <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>历史日结</h3>
        <table>
          <thead><tr>
            <th>日期</th><th>收押金</th><th>退押金</th><th>超时费(净)</th>
            <th>订单数</th><th>归还数</th><th>待退款</th><th>异常单</th>
            <th>差异金额</th><th>状态</th><th>操作</th>
          </tr></thead>
          <tbody>
            {settlements.length === 0 ? <tr><td colSpan="11" className="empty-state">暂无日结记录</td></tr> : settlements.map(s => (
              <tr key={s.id}>
                <td style={{ fontWeight: 600 }}>{s.settle_date}</td>
                <td style={{ color: '#10b981' }}>+¥{s.total_deposit_collected}</td>
                <td style={{ color: '#ef4444' }}>-¥{s.total_deposit_refunded}</td>
                <td>¥{s.total_overtime_fee}</td>
                <td>{s.total_orders}</td>
                <td>{s.total_returned}</td>
                <td>{s.total_pending_refund}</td>
                <td><span className="badge badge-warning">{s.total_exception_orders}</span></td>
                <td style={{ color: s.difference_amount > 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                  {s.difference_amount > 0 ? '¥' + s.difference_amount : '-'}
                </td>
                <td>
                  {s.is_locked ? <span className="badge badge-default">已锁定</span>
                    : s.status === 'reconciled' ? <span className="badge badge-info">已对账</span>
                    : <span className="badge badge-warning">草稿</span>}
                </td>
                <td>
                  {!s.is_locked && s.status === 'reconciled' && (
                    <button className="btn btn-danger" style={{ padding: '2px 8px', fontSize: '12px' }}
                      onClick={() => handleLock(s.settle_date)}>锁定</button>
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

export default FinanceSettlement;
