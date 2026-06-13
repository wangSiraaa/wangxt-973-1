import React, { useState, useEffect } from 'react';
import { financeApi, orderApi } from '../api.js';

function FinanceLedger() {
  const [ledger, setLedger] = useState([]);
  const [phone, setPhone] = useState('');
  const [flowType, setFlowType] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [refundOrder, setRefundOrder] = useState(null);
  const [cashAmount, setCashAmount] = useState('');
  const [onlineAmount, setOnlineAmount] = useState('');
  const [message, setMessage] = useState(null);

  const loadData = async () => {
    financeApi.depositLedger({ phone: phone || undefined, flowType: flowType || undefined }).then(setLedger);
  };

  useEffect(() => { loadData(); }, []);

  const handleRefund = async (orderId) => {
    if (!confirm('确认执行退款？系统模拟第三方渠道，可能出现失败挂账')) return;
    try {
      const result = await financeApi.refund({ orderId });
      setMessage({ type: result.data.status === 'success' ? 'success' : 'error',
        text: result.data.status === 'success' ? `退款成功 ¥${result.data.amount}` : `退款失败，已自动挂账，请在异常挂账页面处理` });
      loadData();
    } catch (e) { setMessage({ type: 'error', text: e.message }); }
  };

  const handleRetry = async (orderId) => {
    if (!confirm('确认重试该笔退款？')) return;
    try {
      const result = await financeApi.retryRefund({ orderId });
      setMessage({ type: 'success', text: `重试退款成功！¥${result.data.amount}` });
      loadData();
    } catch (e) { setMessage({ type: 'error', text: e.message }); }
  };

  const handleReversal = async (orderId) => {
    const reason = prompt('请输入超时费冲正原因：');
    if (!reason) return;
    try {
      const result = await financeApi.overtimeReversal({ orderId, reason });
      setMessage({ type: 'success', text: `冲正成功！¥${result.data.reversedAmount}` });
      loadData();
    } catch (e) { setMessage({ type: 'error', text: e.message }); }
  };

  const handleMixRefund = async () => {
    if (!refundOrder) return;
    const cash = parseFloat(cashAmount) || 0;
    const online = parseFloat(onlineAmount) || 0;
    try {
      await financeApi.mixRefund({ orderId: refundOrder, cashAmount: cash, onlineAmount: online });
      setMessage({ type: 'success', text: `混合退款成功！现金¥${cash}，线上¥${online}` });
      setRefundOrder(null); setCashAmount(''); setOnlineAmount('');
      loadData();
    } catch (e) { setMessage({ type: 'error', text: e.message }); }
  };

  const flowTypeLabels = {
    deposit: '收押金', refund: '退押金', overtime_fee: '超时扣费', overtime_reversal: '超时冲正',
    force_refund: '强制退款', cash_refund: '现金退款', refund_adjust: '换柜退差', deposit_adjust: '换柜补差',
    refund_exception: '退款异常', refund_retry: '退款重试'
  };

  return (
    <div>
      <h2 className="page-title">💰 押金账本</h2>
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}
      <div className="card">
        <div className="form-row">
          <label>手机号</label>
          <input type="text" value={phone} onChange={e => setPhone(e.target.value)} placeholder="按手机号筛选" />
          <label>流水类型</label>
          <select value={flowType} onChange={e => setFlowType(e.target.value)}>
            <option value="">全部</option>
            {Object.entries(flowTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn btn-primary" onClick={loadData}>查询</button>
        </div>
      </div>
      {refundOrder && (
        <div className="card">
          <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>💵 混合退款（现金+线上）</h3>
          <div className="form-row">
            <label>现金退款</label>
            <input type="number" value={cashAmount} onChange={e => setCashAmount(e.target.value)} placeholder="现金金额" />
            <label>线上退款</label>
            <input type="number" value={onlineAmount} onChange={e => setOnlineAmount(e.target.value)} placeholder="线上金额" />
            <button className="btn btn-success" onClick={handleMixRefund}>执行混合退款</button>
            <button className="btn btn-secondary" onClick={() => setRefundOrder(null)}>取消</button>
          </div>
        </div>
      )}
      <div className="card">
        <table>
          <thead><tr><th>时间</th><th>订单号</th><th>手机号</th><th>类型</th><th>金额</th><th>渠道</th><th>状态</th><th>备注</th><th>操作</th></tr></thead>
          <tbody>
            {ledger.length === 0 ? <tr><td colSpan="9" className="empty-state">暂无流水记录</td></tr> : ledger.map(f => (
              <tr key={f.id}>
                <td style={{ fontSize: '12px' }}>{f.created_at}</td>
                <td>{f.order_no || '-'}</td>
                <td>{f.visitor_phone || '-'}</td>
                <td>{flowTypeLabels[f.flow_type] || f.flow_type}</td>
                <td style={{ color: f.flow_type.includes('refund') || f.flow_type.includes('reversal') ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                  {f.flow_type.includes('refund') || f.flow_type.includes('reversal') ? '-' : '+'}¥{f.amount}
                </td>
                <td>{f.pay_channel || '-'}</td>
                <td><span className={`badge ${f.status === 'success' ? 'badge-success' : f.status === 'pending' ? 'badge-warning' : f.status === 'hanging' ? 'badge-info' : 'badge-danger'}`}>
                  {{ success: '成功', pending: '待处理', hanging: '挂账', failed: '失败', written_off: '已核销', resolved: '已解决' }[f.status] || f.status}
                </span></td>
                <td style={{ fontSize: '12px', maxWidth: 200 }}>{f.remark || f.fail_reason || '-'}</td>
                <td>
                  {f.flow_type === 'refund' && f.status === 'pending' && (
                    <button className="btn btn-success" style={{ padding: '2px 8px', fontSize: '12px', marginRight: '4px' }} onClick={() => handleRefund(f.order_id)}>执行退款</button>
                  )}
                  {f.status === 'failed' && (
                    <button className="btn btn-warning" style={{ padding: '2px 8px', fontSize: '12px', marginRight: '4px' }} onClick={() => handleRetry(f.order_id)}>重试退款</button>
                  )}
                  {f.flow_type === 'overtime_fee' && f.status === 'success' && (
                    <button className="btn btn-warning" style={{ padding: '2px 8px', fontSize: '12px', marginRight: '4px' }} onClick={() => handleReversal(f.order_id)}>冲正</button>
                  )}
                  <button className="btn btn-info" style={{ padding: '2px 8px', fontSize: '12px' }} onClick={() => setRefundOrder(f.order_id)}>混合退款</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default FinanceLedger;
