import React, { useState, useEffect } from 'react';
import { lockerApi, orderApi, couponApi } from '../api.js';

function AdminRent() {
  const [lockers, setLockers] = useState([]);
  const [zones, setZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState('');
  const [selectedLocker, setSelectedLocker] = useState(null);
  const [phone, setPhone] = useState('');
  const [visitorName, setVisitorName] = useState('');
  const [wristbandId, setWristbandId] = useState('');
  const [selectedCoupon, setSelectedCoupon] = useState('');
  const [payChannel, setPayChannel] = useState('online');
  const [coupons, setCoupons] = useState([]);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [l, c] = await Promise.all([lockerApi.list(), couponApi.list().catch(() => [])]);
    setLockers(l);
    setCoupons(c);
    const zs = [...new Set(l.map(x => x.zone))];
    setZones(zs);
    if (zs.length) setSelectedZone(zs[0]);
  };

  const handleRent = async () => {
    if (!selectedLocker || !phone.trim()) {
      setMessage({ type: 'error', text: '请填写手机号并选择柜子' });
      return;
    }
    try {
      setLoading(true);
      const result = await orderApi.rent({
        phone, lockerId: selectedLocker.id, payChannel, visitorName,
        couponCode: selectedCoupon || undefined
      });
      if (wristbandId.trim()) {
        await orderApi.bindWristband({ orderId: result.data.id, wristbandId });
      }
      setMessage({ type: 'success', text: `租柜成功！订单号：${result.data.order_no}` });
      setPhone(''); setVisitorName(''); setWristbandId('');
      setSelectedLocker(null); setSelectedCoupon('');
      loadData();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally { setLoading(false); }
  };

  const filtered = lockers.filter(l => !selectedZone || l.zone === selectedZone);

  return (
    <div>
      <h2 className="page-title">🔑 管理员出租</h2>
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <div className="card">
        <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>📝 租赁信息</h3>
        <div className="form-row">
          <label>游客手机号 *</label>
          <input type="text" value={phone} onChange={e => setPhone(e.target.value)} placeholder="请输入手机号" />
        </div>
        <div className="form-row">
          <label>游客姓名</label>
          <input type="text" value={visitorName} onChange={e => setVisitorName(e.target.value)} />
        </div>
        <div className="form-row">
          <label>腕带编号</label>
          <input type="text" value={wristbandId} onChange={e => setWristbandId(e.target.value)} placeholder="选填，电子腕带ID" />
        </div>
        <div className="form-row">
          <label>支付方式</label>
          <select value={payChannel} onChange={e => setPayChannel(e.target.value)}>
            <option value="online">线上支付</option>
            <option value="cash">现金押金</option>
          </select>
        </div>
        <div className="form-row">
          <label>优惠券</label>
          <select value={selectedCoupon} onChange={e => setSelectedCoupon(e.target.value)}>
            <option value="">不使用</option>
            {coupons.map(c => <option key={c.id} value={c.coupon_code}>{c.coupon_name}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>🗄️ 选择柜子</h3>
        <div className="form-row" style={{ marginBottom: '12px' }}>
          <label>区域</label>
          <select value={selectedZone} onChange={e => setSelectedZone(e.target.value)}>
            <option value="">全部</option>
            {zones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
        <div className="locker-grid">
          {filtered.map(l => {
            const sel = selectedLocker?.id === l.id;
            const disabled = l.status !== 'available';
            return (
              <div key={l.id} className={`locker-box ${l.status}`}
                style={{ opacity: disabled ? 0.5 : 1, border: sel ? '3px solid #667eea' : undefined }}
                onClick={() => !disabled && setSelectedLocker(l)}>
                <div className="code">{l.locker_code}</div>
                <div className="status-text">¥{l.base_deposit}</div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedLocker && (
        <div className="card">
          <div className="detail-grid" style={{ marginBottom: '12px' }}>
            <div className="item"><span className="k">柜号：</span><span className="v">{selectedLocker.locker_code}</span></div>
            <div className="item"><span className="k">类型：</span><span className="v">{selectedLocker.locker_type}</span></div>
            <div className="item"><span className="k">押金：</span><span className="v" style={{ color: '#ef4444' }}>¥{selectedLocker.base_deposit}</span></div>
            <div className="item"><span className="k">时费：</span><span className="v">¥{selectedLocker.hourly_rate}/小时</span></div>
          </div>
          <button className="btn btn-primary" onClick={handleRent} disabled={loading}>
            {loading ? '处理中...' : '确认出租'}
          </button>
        </div>
      )}
    </div>
  );
}

export default AdminRent;
