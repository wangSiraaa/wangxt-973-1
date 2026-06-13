import React, { useState, useEffect } from 'react';
import { orderApi } from '../api.js';

function AdminForceClose() {
  const [orders, setOrders] = useState([]);
  const [orderId, setOrderId] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState(null);

  const loadOrders = async () => {
    orderApi.list().then(o => setOrders(o.filter(x => ['renting', 'overtime', 'swap_pending'].includes(x.status))));
  };

  useEffect(() => { loadOrders(); }, []);

  const handleClose = async () => {
    if (!orderId) { setMessage({ type: 'error', text: '请选择订单' }); return; }
    if (reason.trim().length < 5) { setMessage({ type: 'error', text: '强制关单原因至少5个字' }); return; }
    if (!confirm('确认强制关单？此操作将退还押金并记录审计')) return;
    try {
      await orderApi.forceClose({ orderId, reason });
      setMessage({ type: 'success', text: '强制关单成功！已记录操作审计' });
      setOrderId(''); setReason('');
      loadOrders();
    } catch (e) { setMessage({ type: 'error', text: e.message }); }
  };

  return (
    <div>
      <h2 className="page-title">🔐 强制关单</h2>
      <div className="alert alert-warning">注意：强制关单需要填写原因，系统会记录操作审计并自动发起押金退还</div>
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}
      <div className="card">
        <div className="form-row">
          <label>选择订单</label>
          <select value={orderId} onChange={e => setOrderId(e.target.value)} style={{ minWidth: 400 }}>
            <option value="">-- 选择需要强制关单的订单 --</option>
            {orders.map(o => (
              <option key={o.id} value={o.id}>
                {o.order_no} | {o.locker_code} | {o.visitor_phone} | 押金¥{o.actual_deposit} | {o.rent_time}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>关单原因 *</label>
          <textarea value={reason} onChange={e => setReason(e.target.value)}
            rows="3" style={{ minWidth: 400 }} placeholder="请详细填写强制关单原因（至少5个字），如：财物被盗警方介入需封存、游客突发疾病紧急处理等" />
        </div>
        <div style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 12px 100px' }}>
          已输入 {reason.length} 字（最少5字）
        </div>
        <button className="btn btn-danger" onClick={handleClose}>执行强制关单</button>
      </div>
      <div className="card">
        <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>可强制关单的订单列表</h3>
        <table>
          <thead><tr><th>订单号</th><th>柜号</th><th>手机号</th><th>押金</th><th>租赁时间</th><th>状态</th></tr></thead>
          <tbody>
            {orders.length === 0 ? <tr><td colSpan="6" className="empty-state">暂无符合条件的订单</td></tr> : orders.map(o => (
              <tr key={o.id}>
                <td>{o.order_no}</td><td>{o.locker_code}</td><td>{o.visitor_phone}</td>
                <td>¥{o.actual_deposit}</td><td>{o.rent_time}</td>
                <td><span className={`badge ${o.status === 'overtime' ? 'badge-warning' : 'badge-info'}`}>{o.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AdminForceClose;
