import React, { useState, useEffect } from 'react';
import { financeApi } from '../api.js';

function FinanceHanging() {
  const [hangings, setHangings] = useState([]);
  const [message, setMessage] = useState(null);

  const loadData = async () => {
    financeApi.hanging().then(setHangings);
  };

  useEffect(() => { loadData(); }, []);

  const handleAction = async (flowId, action) => {
    let remark = '';
    if (action === 'write_off') {
      remark = prompt('请输入核销原因：');
      if (!remark) return;
    }
    try {
      await financeApi.handleHanging({ flowId, action, remark: remark || '人工处理' });
      setMessage({ type: 'success', text: '处理成功' });
      loadData();
    } catch (e) { setMessage({ type: 'error', text: e.message }); }
  };

  return (
    <div>
      <h2 className="page-title">⚠️ 异常挂账</h2>
      <div className="alert alert-info">本页展示退款失败的挂账记录，可执行重试退款、现金退款核销或直接核销处理</div>
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}
      <div className="card">
        <table>
          <thead><tr>
            <th>流水号</th><th>订单号</th><th>手机号</th>
            <th>挂账金额</th><th>失败原因</th><th>挂账时间</th><th>操作</th>
          </tr></thead>
          <tbody>
            {hangings.length === 0 ? <tr><td colSpan="7" className="empty-state">✅ 无挂账记录，状态良好</td></tr> : hangings.map(h => (
              <tr key={h.id}>
                <td style={{ fontSize: '12px' }}>{h.id}</td>
                <td>{h.order_no}</td>
                <td>{h.visitor_phone}</td>
                <td style={{ color: '#ef4444', fontWeight: 600 }}>¥{h.amount}</td>
                <td style={{ fontSize: '12px', color: '#ef4444' }}>{h.remark || h.fail_reason}</td>
                <td style={{ fontSize: '12px' }}>{h.created_at}</td>
                <td>
                  <button className="btn btn-success" style={{ padding: '2px 8px', fontSize: '12px', marginRight: '4px' }}
                    onClick={() => handleAction(h.id, 'retry')}>重试退款</button>
                  <button className="btn btn-warning" style={{ padding: '2px 8px', fontSize: '12px', marginRight: '4px' }}
                    onClick={() => handleAction(h.id, 'cash_refund')}>现金退款</button>
                  <button className="btn btn-danger" style={{ padding: '2px 8px', fontSize: '12px' }}
                    onClick={() => handleAction(h.id, 'write_off')}>核销</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default FinanceHanging;
