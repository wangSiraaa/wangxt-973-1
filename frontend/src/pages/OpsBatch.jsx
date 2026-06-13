import React, { useState, useEffect } from 'react';
import { lockerApi, batchApi } from '../api.js';

function OpsBatch() {
  const [lockers, setLockers] = useState([]);
  const [zones, setZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState(null);

  useEffect(() => {
    lockerApi.list().then(l => {
      setLockers(l);
      setZones([...new Set(l.map(x => x.zone))]);
    });
  }, []);

  const filtered = lockers.filter(l => !selectedZone || l.zone === selectedZone)
    .filter(l => l.status !== 'rented' && l.status !== 'in_use');

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAll = () => {
    setSelectedIds(filtered.map(l => l.id));
  };

  const clearAll = () => setSelectedIds([]);

  const handleDisable = async () => {
    if (selectedIds.length === 0) {
      setMessage({ type: 'error', text: '请选择要停柜的柜子' });
      return;
    }
    if (reason.trim().length < 5) {
      setMessage({ type: 'error', text: '请填写停柜原因（至少5个字）' });
      return;
    }
    if (!confirm(`确认停用 ${selectedIds.length} 个柜子？`)) return;
    try {
      const result = await batchApi.disable({ zone: selectedZone, lockerIds: selectedIds, reason });
      setMessage({ type: 'success', text: `批量停柜成功！已停用 ${result.data.disabledCount} 个柜子` });
      setSelectedIds([]); setReason('');
      lockerApi.list().then(setLockers);
    } catch (e) { setMessage({ type: 'error', text: e.message }); }
  };

  return (
    <div>
      <h2 className="page-title">📦 批量停柜</h2>
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}
      <div className="card">
        <div className="form-row">
          <label>区域筛选</label>
          <select value={selectedZone} onChange={e => setSelectedZone(e.target.value)}>
            <option value="">全部区域</option>
            {zones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
          <button className="btn btn-secondary" onClick={selectAll}>全选当前</button>
          <button className="btn btn-secondary" onClick={clearAll}>清空选择</button>
          <span>已选择: <strong style={{ color: '#ef4444' }}>{selectedIds.length}</strong> 个</span>
        </div>
        <div className="form-row">
          <label>停柜原因 *</label>
          <input type="text" value={reason} onChange={e => setReason(e.target.value)}
            placeholder="如：区域消毒、设备升级、漏水维修等（至少5字）"
            style={{ minWidth: 400 }} />
          <button className="btn btn-danger" onClick={handleDisable}>执行批量停柜</button>
        </div>
      </div>
      <div className="card">
        <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>可停柜柜子（使用中的柜子已自动排除）</h3>
        <div className="locker-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))' }}>
          {filtered.map(l => {
            const sel = selectedIds.includes(l.id);
            return (
              <div key={l.id} className={`locker-box ${l.status}`}
                onClick={() => toggleSelect(l.id)}
                style={{ border: sel ? '3px solid #ef4444' : undefined }}>
                <div className="code">{l.locker_code}</div>
                <div className="status-text">{sel ? '✓ 已选' : l.status}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default OpsBatch;
