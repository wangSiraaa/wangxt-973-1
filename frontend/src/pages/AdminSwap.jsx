import React, { useState, useEffect } from 'react';
import { orderApi, lockerApi } from '../api.js';

function AdminSwap() {
  const [orders, setOrders] = useState([]);
  const [lockers, setLockers] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState('');
  const [newLockerId, setNewLockerId] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState(null);

  const loadData = async () => {
    const [o, l] = await Promise.all([orderApi.list({ status: 'renting' }), lockerApi.list()]);
    setOrders(o);
    setLockers(l);
    orderApi.list({ status: 'swap_pending' }).then(sp => setOrders(prev => [...prev, ...sp]));
  };

  useEffect(() => { loadData(); }, []);

  const handleConfirm = async () => {
    if (!selectedOrder || !newLockerId) {
      setMessage({ type: 'error', text: '请选择原订单和新柜子' });
      return;
    }
    try {
      const order = orders.find(o => o.id === selectedOrder);
      await orderApi.applySwap({ orderId: selectedOrder, reason: reason || '管理员发起换柜', newLockerId, isCrossZone: order?.zone !== lockers.find(l => l.id === newLockerId)?.zone });
      const result = await orderApi.confirmSwap({ orderId: selectedOrder, newLockerId });
      setMessage({ type: 'success', text: `换柜成功！新订单号：${result.data.order_no}` });
      setSelectedOrder(''); setNewLockerId(''); setReason('');
      loadData();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  return (
    <div>
      <h2 className="page-title">🔄 换柜处理</h2>
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}
      <div className="card">
        <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>换柜操作</h3>
        <div className="form-row">
          <label>选择原订单</label>
          <select value={selectedOrder} onChange={e => setSelectedOrder(e.target.value)} style={{ minWidth: 300 }}>
            <option value="">-- 选择原订单 --</option>
            {orders.map(o => (
              <option key={o.id} value={o.id}>
                {o.order_no} | {o.locker_code} | {o.visitor_phone} | ¥{o.actual_deposit}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>选择新柜子</label>
          <select value={newLockerId} onChange={e => setNewLockerId(e.target.value)} style={{ minWidth: 300 }}>
            <option value="">-- 选择新柜子 --</option>
            {lockers.filter(l => l.status === 'available').map(l => (
              <option key={l.id} value={l.id}>
                {l.zone} | {l.locker_code} | {l.locker_type} | ¥{l.base_deposit}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>换柜原因</label>
          <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="请填写换柜原因" style={{ minWidth: 300 }} />
        </div>
        <button className="btn btn-warning" onClick={handleConfirm}>确认换柜</button>
      </div>
      <div className="card">
        <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>换柜待确认订单</h3>
        <table>
          <thead><tr><th>订单号</th><th>原柜号</th><th>手机号</th><th>押金</th><th>状态</th></tr></thead>
          <tbody>
            {orders.filter(o => o.status === 'swap_pending').length === 0
              ? <tr><td colSpan="5" className="empty-state">暂无待确认订单</td></tr>
              : orders.filter(o => o.status === 'swap_pending').map(o => (
                <tr key={o.id}>
                  <td>{o.order_no}</td><td>{o.locker_code}</td>
                  <td>{o.visitor_phone}</td><td>¥{o.actual_deposit}</td>
                  <td><span className="badge badge-warning">换柜待确认</span></td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AdminSwap;
