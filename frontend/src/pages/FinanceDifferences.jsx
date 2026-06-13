import React, { useState, useEffect } from 'react';
import { financeApi } from '../api.js';
import dayjs from 'dayjs';

function FinanceDifferences() {
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [diffs, setDiffs] = useState(null);

  const loadData = async () => {
    try {
      const data = await financeApi.settlementDiffs(date);
      setDiffs(data);
    } catch (e) { setDiffs(null); }
  };

  useEffect(() => { loadData(); }, [date]);

  return (
    <div>
      <h2 className="page-title">🔍 日结差异明细</h2>
      <div className="card">
        <div className="form-row">
          <label>日期</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          <button className="btn btn-primary" onClick={loadData}>查询差异</button>
        </div>
      </div>
      {diffs && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="label">日结日期</div>
              <div className="value" style={{ fontSize: 20 }}>{diffs.settle?.settle_date}</div>
            </div>
            <div className="stat-card">
              <div className="label">押金收</div>
              <div className="value success">¥{diffs.settle?.total_deposit_collected}</div>
            </div>
            <div className="stat-card">
              <div className="label">押金退</div>
              <div className="value danger">-¥{diffs.settle?.total_deposit_refunded}</div>
            </div>
            <div className="stat-card">
              <div className="label">差异金额</div>
              <div className={`value ${diffs.settle?.difference_amount > 0 ? 'warning' : 'success'}`}>¥{diffs.settle?.difference_amount || 0}</div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>⚠️ 退款挂账</h3>
            <table>
              <thead><tr><th>流水号</th><th>订单号</th><th>手机号</th><th>金额</th><th>失败原因</th></tr></thead>
              <tbody>
                {(diffs.hangingFlows || []).length === 0
                  ? <tr><td colSpan="5" className="empty-state">无挂账</td></tr>
                  : (diffs.hangingFlows || []).map(f => (
                    <tr key={f.id}>
                      <td style={{ fontSize: '12px' }}>{f.id}</td>
                      <td>{f.order_no}</td>
                      <td>{f.visitor_phone}</td>
                      <td style={{ color: '#ef4444' }}>¥{f.amount}</td>
                      <td style={{ fontSize: '12px' }}>{f.fail_reason}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>🔴 待退款订单</h3>
            <table>
              <thead><tr><th>订单号</th><th>手机号</th><th>柜号</th><th>应退金额</th><th>状态</th><th>失败原因</th></tr></thead>
              <tbody>
                {(diffs.pendingRefunds || []).length === 0
                  ? <tr><td colSpan="6" className="empty-state">无待退款</td></tr>
                  : (diffs.pendingRefunds || []).map(o => (
                    <tr key={o.id}>
                      <td>{o.order_no}</td>
                      <td>{o.visitor_phone}</td>
                      <td>{o.locker_code}</td>
                      <td style={{ color: '#10b981' }}>¥{o.refund_amount}</td>
                      <td><span className={`badge ${o.refund_status === 'failed' ? 'badge-danger' : 'badge-warning'}`}>
                        {{ pending: '待退款', failed: '退款失败', completed: '已完成' }[o.refund_status] || o.refund_status}</span></td>
                      <td style={{ fontSize: '12px', color: '#ef4444' }}>{o.refund_fail_reason || '-'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>🔐 强制关单记录</h3>
            <table>
              <thead><tr><th>订单号</th><th>手机号</th><th>柜号</th><th>操作人</th><th>原因</th></tr></thead>
              <tbody>
                {(diffs.forceClosed || []).length === 0
                  ? <tr><td colSpan="5" className="empty-state">无强制关单</td></tr>
                  : (diffs.forceClosed || []).map(o => (
                    <tr key={o.id}>
                      <td>{o.order_no}</td>
                      <td>{o.visitor_phone}</td>
                      <td>{o.locker_code}</td>
                      <td>{o.force_close_operator}</td>
                      <td style={{ fontSize: '12px', color: '#ef4444' }}>{o.force_close_reason}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default FinanceDifferences;
