import React, { useState, useEffect } from 'react';
import { lockerApi, orderApi, couponApi } from '../api.js';

const statusLabels = {
  available: { text: '空闲', cls: 'badge-success' },
  rented: { text: '已租', cls: 'badge-danger' },
  in_use: { text: '使用中', cls: 'badge-danger' },
  overtime: { text: '超时', cls: 'badge-warning' },
  maintenance: { text: '维修', cls: 'badge-default' },
  disabled: { text: '停用', cls: 'badge-default' },
  deposit_pending: { text: '待付押金', cls: 'badge-info' },
  force_opened: { text: '强制开柜', cls: 'badge-warning' },
  swap_pending: { text: '换柜待确认', cls: 'badge-info' },
  unlocked_idle: { text: '未上锁', cls: 'badge-warning' }
};

function VisitorRent({ user }) {
  const [lockers, setLockers] = useState([]);
  const [zones, setZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState('');
  const [selectedLocker, setSelectedLocker] = useState(null);
  const [phone, setPhone] = useState(user.phone || '');
  const [visitorName, setVisitorName] = useState('');
  const [coupons, setCoupons] = useState([]);
  const [selectedCoupon, setSelectedCoupon] = useState('');
  const [payChannel, setPayChannel] = useState('online');
  const [activeOrder, setActiveOrder] = useState(null);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
    if (phone) loadActiveOrder();
  }, []);

  const loadData = async () => {
    const [lockerData, couponData] = await Promise.all([
      lockerApi.list(),
      couponApi.list().catch(() => [])
    ]);
    setLockers(lockerData);
    setCoupons(couponData);
    const zs = [...new Set(lockerData.map(l => l.zone))];
    setZones(zs);
    if (zs.length > 0) setSelectedZone(zs[0]);
  };

  const loadActiveOrder = async () => {
    try {
      const order = await orderApi.visitorActive(phone);
      setActiveOrder(order);
    } catch { setActiveOrder(null); }
  };

  const filteredLockers = lockers.filter(l => !selectedZone || l.zone === selectedZone);

  const handleRent = async () => {
    if (!selectedLocker) { setMessage({ type: 'error', text: '请选择要租赁的柜子' }); return; }
    if (!phone.trim()) { setMessage({ type: 'error', text: '请输入手机号' }); return; }
    try {
      setLoading(true);
      const result = await orderApi.rent({
        phone, lockerId: selectedLocker.id, payChannel,
        couponCode: selectedCoupon || undefined, visitorName: visitorName || undefined
      });
      setMessage({ type: 'success', text: `租柜成功！订单号：${result.data.order_no}` });
      setSelectedLocker(null);
      loadData();
      loadActiveOrder();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally { setLoading(false); }
  };

  const handleApplySwap = async () => {
    if (!selectedLocker) { setMessage({ type: 'error', text: '请选择新柜子' }); return; }
    try {
      setLoading(true);
      const result = await orderApi.applySwap({
        orderId: activeOrder.id, reason: '游客申请换柜',
        newLockerId: selectedLocker.id, isCrossZone: selectedLocker.zone !== activeOrder.zone
      });
      setMessage({ type: 'success', text: `换柜申请已提交：${result.data.message}` });
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally { setLoading(false); }
  };

  return (
    <div>
      <h2 className="page-title">🏊 游客租柜</h2>

      {activeOrder && (
        <div className="card">
          <div className="alert alert-info">
            <strong>您有正在进行的订单</strong><br />
            订单号：{activeOrder.order_no} | 柜号：{activeOrder.locker_code} | 区域：{activeOrder.zone}
            <br />租赁时间：{activeOrder.rent_time} | 押金：¥{activeOrder.actual_deposit}
          </div>
          <div className="form-row">
            <label>选择新柜换柜</label>
            <select value={selectedLocker?.id || ''} onChange={e => {
              const l = lockers.find(x => x.id === e.target.value);
              setSelectedLocker(l);
            }}>
              <option value="">-- 选择柜子 --</option>
              {lockers.filter(l => l.status === 'available').map(l => (
                <option key={l.id} value={l.id}>{l.zone} - {l.locker_code} (¥{l.base_deposit})</option>
              ))}
            </select>
            <button className="btn btn-warning" onClick={handleApplySwap} disabled={loading}>
              申请换柜
            </button>
          </div>
        </div>
      )}

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      {!activeOrder && (
        <div className="card">
          <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>🔐 租赁信息</h3>
          <div className="form-row">
            <label>手机号</label>
            <input type="text" value={phone} onChange={e => setPhone(e.target.value)}
              onBlur={loadActiveOrder} placeholder="请输入手机号" />
          </div>
          <div className="form-row">
            <label>姓名</label>
            <input type="text" value={visitorName} onChange={e => setVisitorName(e.target.value)}
              placeholder="选填" />
          </div>
          <div className="form-row">
            <label>支付方式</label>
            <select value={payChannel} onChange={e => setPayChannel(e.target.value)}>
              <option value="online">线上支付</option>
              <option value="cash">现金押金</option>
              <option value="mix">混合支付</option>
            </select>
          </div>
          <div className="form-row">
            <label>优惠券</label>
            <select value={selectedCoupon} onChange={e => setSelectedCoupon(e.target.value)}>
              <option value="">不使用优惠券</option>
              {coupons.map(c => (
                <option key={c.id} value={c.coupon_code}>
                  {c.coupon_name} ({c.discount_type === 'fixed' ? `减${c.discount_value}元` : `${(1 - c.discount_value) * 10}折`})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="card">
        <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>🗄️ 选择柜子</h3>
        <div className="form-row" style={{ marginBottom: '16px' }}>
          <label>区域</label>
          <select value={selectedZone} onChange={e => setSelectedZone(e.target.value)}>
            <option value="">全部区域</option>
            {zones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>

        <div className="locker-grid">
          {filteredLockers.map(l => {
            const isSelected = selectedLocker?.id === l.id;
            const disabled = l.status !== 'available';
            return (
              <div
                key={l.id}
                className={`locker-box ${l.status}`}
                onClick={() => !disabled && setSelectedLocker(l)}
                style={{ opacity: disabled ? 0.5 : 1, border: isSelected ? '3px solid #667eea' : undefined }}
                title={`${l.locker_type} - ¥${l.base_deposit}`}
              >
                <div className="code">{l.locker_code}</div>
                <div className="status-text">{(statusLabels[l.status] || {}).text || l.status}</div>
              </div>
            );
          })}
        </div>
      </div>

      {!activeOrder && selectedLocker && (
        <div className="card">
          <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>✅ 确认租赁</h3>
          <div className="detail-grid" style={{ marginBottom: '16px' }}>
            <div className="item"><span className="k">柜子编号：</span><span className="v">{selectedLocker.locker_code}</span></div>
            <div className="item"><span className="k">所在区域：</span><span className="v">{selectedLocker.zone}</span></div>
            <div className="item"><span className="k">柜子类型：</span><span className="v">{selectedLocker.locker_type}</span></div>
            <div className="item"><span className="k">押金金额：</span><span className="v" style={{ color: '#ef4444', fontWeight: 700 }}>¥{selectedLocker.base_deposit}</span></div>
            <div className="item"><span className="k">每小时费用：</span><span className="v">¥{selectedLocker.hourly_rate}</span></div>
            <div className="item"><span className="k">免费时长：</span><span className="v">4小时</span></div>
          </div>
          <button className="btn btn-primary" onClick={handleRent} disabled={loading}>
            {loading ? '处理中...' : '确认租赁并支付押金'}
          </button>
        </div>
      )}
    </div>
  );
}

export default VisitorRent;
