import React, { useState, useEffect } from 'react';
import { itemApi, lockerApi } from '../api.js';

function OpsItems() {
  const [items, setItems] = useState([]);
  const [lockers, setLockers] = useState([]);
  const [lockerId, setLockerId] = useState('');
  const [itemName, setItemName] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState(null);

  const loadData = async () => {
    const [i, l] = await Promise.all([itemApi.list(), lockerApi.list()]);
    setItems(i);
    setLockers(l);
  };

  useEffect(() => { loadData(); }, []);

  const handleRegister = async () => {
    if (!lockerId || !itemName.trim()) {
      setMessage({ type: 'error', text: '请选择柜子并填写物品名称' });
      return;
    }
    try {
      await itemApi.register({ lockerId, itemName, description, quantity });
      setMessage({ type: 'success', text: '遗留物品登记成功' });
      setLockerId(''); setItemName(''); setDescription(''); setQuantity(1);
      loadData();
    } catch (e) { setMessage({ type: 'error', text: e.message }); }
  };

  const handleClaim = async (id) => {
    const name = prompt('领取人姓名：');
    if (!name) return;
    const phone = prompt('领取人手机号：');
    if (!phone) return;
    try {
      await itemApi.claim({ itemId: id, claimantName: name, claimantPhone: phone });
      setMessage({ type: 'success', text: '领取成功' });
      loadData();
    } catch (e) { setMessage({ type: 'error', text: e.message }); }
  };

  return (
    <div>
      <h2 className="page-title">👜 遗留物品登记</h2>
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}
      <div className="card">
        <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>登记新物品</h3>
        <div className="form-row">
          <label>柜子</label>
          <select value={lockerId} onChange={e => setLockerId(e.target.value)} style={{ minWidth: 300 }}>
            <option value="">-- 选择柜子 --</option>
            {lockers.map(l => <option key={l.id} value={l.id}>{l.zone} - {l.locker_code}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label>物品名称</label>
          <input type="text" value={itemName} onChange={e => setItemName(e.target.value)} placeholder="如：儿童泳镜、手机、钥匙等" />
        </div>
        <div className="form-row">
          <label>数量</label>
          <input type="number" value={quantity} onChange={e => setQuantity(parseInt(e.target.value) || 1)} min="1" style={{ minWidth: 100 }} />
          <label>描述</label>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="颜色、品牌、特征等" style={{ minWidth: 300 }} />
        </div>
        <button className="btn btn-primary" onClick={handleRegister}>登记物品</button>
      </div>
      <div className="card">
        <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>物品列表</h3>
        <table>
          <thead><tr>
            <th>柜号</th><th>物品</th><th>数量</th><th>发现时间</th><th>存放位置</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            {items.length === 0 ? <tr><td colSpan="7" className="empty-state">暂无遗留物品记录</td></tr> : items.map(i => (
              <tr key={i.id}>
                <td>{i.locker_code} ({i.zone})</td>
                <td>{i.item_name} <span style={{ color: '#6b7280', fontSize: '12px' }}>{i.item_description ? ` - ${i.item_description}` : ''}</span></td>
                <td>{i.quantity}</td>
                <td style={{ fontSize: '12px' }}>{i.found_time}</td>
                <td>{i.storage_location || '服务台'}</td>
                <td><span className={`badge ${i.status === 'stored' ? 'badge-info' : 'badge-success'}`}>
                  {{ stored: '待领取', claimed: '已领取' }[i.status] || i.status}</span></td>
                <td>
                  {i.status === 'stored' && (
                    <button className="btn btn-success" style={{ padding: '2px 8px', fontSize: '12px' }} onClick={() => handleClaim(i.id)}>确认领取</button>
                  )}
                  {i.claimed_by && <div style={{ fontSize: '11px', color: '#6b7280' }}>{i.claimed_by} {i.claimed_phone}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default OpsItems;
