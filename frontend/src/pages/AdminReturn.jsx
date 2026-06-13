import React, { useState, useEffect } from 'react';
import { orderApi } from '../api.js';

function AdminReturn() {
  const [orders, setOrders] = useState([]);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState(null);

  const loadOrders = async () => {
    try {
      const data = await orderApi.list({ statuses: 'renting,overtime,swap_pending' });
      setOrders(data || []);
    } catch (e) {
      setOrders([]);
    }
  };

  useEffect(() => { loadOrders(); }, []);

  const handleReturn = async (orderId) => {
    if (!confirm('确认归还该柜子？系统将自动计算超时费用')) return;
    orderApi.adminReturn({ orderId: orderId }).then(r => {
      setMessage({ type: 'success', text: `归还成功！应退押金 ¥${r.data.refund_amount}元，超时费 ¥${r.data.overtime_fee || 0}元` });
      loadOrders();
    }).catch(e => setMessage({ type: 'error', text: e.message }));
  };

  const handleSearch = async () => {
    if (phone.trim()) {
      try {
        const o = await orderApi.visitorActive(phone);
        setOrders(o ? [o] : []);
      } catch (e) { setOrders([]); }
    } else {
      loadOrders();
    }
  };

  const statusMap = { renting: '租赁中', overtime: '已超时', swap_pending: '换柜待确认' };

  return (
    <div>
      <h2 className="page-title">↩️ 归还处理</h2>
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}
      <div className="card">
        <div className="form-row">
          <label>手机号搜索</label>
          <input type="text" value={phone} onChange={e => setPhone(e.target.value)} placeholder="输入手机号快速查找" />
          <button className="btn btn-primary" onClick={handleSearch}>搜索</button>
          <button className="btn btn-secondary" onClick={() => { setPhone(''); loadOrders(); }}>显示全部</button>
        </div>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>订单号</th><th>柜号</th><th>手机号</th><th>租赁时间</th><th>押金</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            {orders.length === 0 ? <tr><td colSpan="7" className="empty-state">暂无待归还订单</td></tr> : orders.map(o => (
              <tr key={o.id}>
                <td>{o.order_no}</td><td>{o.locker_code}</td><td>{o.visitor_phone}</td>
                <td>{o.rent_time}</td><td>¥{o.actual_deposit}</td>
                <td><span className={`badge ${o.status === 'overtime' ? 'badge-warning' : 'badge-info'}`}>{statusMap[o.status] || o.status}</span></td>
                <td><button className="btn btn-success" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={() => handleReturn(o.id)}>确认归还</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AdminReturn;
