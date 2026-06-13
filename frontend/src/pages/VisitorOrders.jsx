import React, { useState, useEffect } from 'react';
import { orderApi } from '../api.js';
import dayjs from 'dayjs';

function VisitorOrders({ user }) {
  const [phone, setPhone] = useState(user.phone || '');
  const [orders, setOrders] = useState([]);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (phone) loadOrders();
  }, []);

  const loadOrders = async () => {
    if (!phone.trim()) return;
    try {
      const data = await orderApi.visitorOrders(phone);
      setOrders(data);
    } catch (e) {
      alert(e.message);
    }
  };

  const loadDetail = async (id) => {
    const data = await orderApi.detail(id);
    setDetail(data);
  };

  const statusMap = {
    renting: { text: '租赁中', cls: 'badge-info' },
    overtime: { text: '已超时', cls: 'badge-warning' },
    returned: { text: '已归还', cls: 'badge-success' },
    closed: { text: '已关闭', cls: 'badge-default' },
    swap_pending: { text: '换柜待确认', cls: 'badge-warning' }
  };

  const refundMap = {
    pending: { text: '待退款', cls: 'badge-warning' },
    completed: { text: '已退款', cls: 'badge-success' },
    failed: { text: '退款失败', cls: 'badge-danger' }
  };

  return (
    <div>
      <h2 className="page-title">📋 我的订单</h2>

      <div className="card">
        <div className="form-row">
          <label>查询手机号</label>
          <input type="text" value={phone} onChange={e => setPhone(e.target.value)} placeholder="请输入手机号" />
          <button className="btn btn-primary" onClick={loadOrders}>查询</button>
        </div>
      </div>

      {detail && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '16px' }}>📄 订单详情 - {detail.order_no}</h3>
            <button className="btn btn-secondary" onClick={() => setDetail(null)}>返回列表</button>
          </div>
          <div className="detail-section">
            <h3>基本信息</h3>
            <div className="detail-grid">
              <div className="item"><span className="k">订单号：</span><span className="v">{detail.order_no}</span></div>
              <div className="item"><span className="k">状态：</span><span className={`badge ${(statusMap[detail.status] || {}).cls}`}>{(statusMap[detail.status] || {}).text || detail.status}</span></div>
              <div className="item"><span className="k">柜子：</span><span className="v">{detail.locker_code} ({detail.zone})</span></div>
              <div className="item"><span className="k">手机号：</span><span className="v">{detail.visitor_phone}</span></div>
              <div className="item"><span className="k">租赁时间：</span><span className="v">{detail.rent_time}</span></div>
              <div className="item"><span className="k">归还时间：</span><span className="v">{detail.actual_return_time || '-'}</span></div>
            </div>
          </div>
          <div className="detail-section">
            <h3>费用明细</h3>
            <div className="detail-grid">
              <div className="item"><span className="k">押金金额：</span><span className="v">¥{detail.deposit_amount}</span></div>
              <div className="item"><span className="k">优惠抵扣：</span><span className="v">-¥{detail.coupon_discount || 0}</span></div>
              <div className="item"><span className="k">实缴押金：</span><span className="v">¥{detail.actual_deposit}</span></div>
              <div className="item"><span className="k">超时时长：</span><span className="v">{detail.overtime_hours || 0}小时</span></div>
              <div className="item"><span className="k">超时费用：</span><span className="v" style={{ color: detail.overtime_fee ? '#ef4444' : undefined }}>¥{detail.overtime_fee || 0}</span></div>
              <div className="item"><span className="k">应退金额：</span><span className="v" style={{ color: '#10b981', fontWeight: 700 }}>¥{detail.refund_amount || 0}</span></div>
              <div className="item"><span className="k">退款状态：</span><span className={`badge ${(refundMap[detail.refund_status] || {}).cls}`}>{(refundMap[detail.refund_status] || {}).text || '无需退款'}</span></div>
              {detail.refund_fail_reason && <div className="item"><span className="k">失败原因：</span><span className="v" style={{ color: '#ef4444' }}>{detail.refund_fail_reason}</span></div>}
            </div>
          </div>
          {detail.is_force_closed && (
            <div className="detail-section">
              <h3>强制关单信息</h3>
              <div className="detail-grid">
                <div className="item"><span className="k">操作人：</span><span className="v">{detail.force_close_operator}</span></div>
                <div className="item"><span className="k">原因：</span><span className="v" style={{ color: '#ef4444' }}>{detail.force_close_reason}</span></div>
              </div>
            </div>
          )}
          <div className="detail-section">
            <h3>押金流水</h3>
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>类型</th>
                  <th>金额</th>
                  <th>渠道</th>
                  <th>状态</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                {(detail.flows || []).map(f => (
                  <tr key={f.id}>
                    <td>{f.created_at}</td>
                    <td>{{ deposit: '收取押金', refund: '退还押金', overtime_fee: '超时扣费', overtime_reversal: '超时费冲正', force_refund: '强制退款', cash_refund: '现金退款', refund_adjust: '换柜退差价', deposit_adjust: '换柜补差价', refund_exception: '退款异常挂账', refund_retry: '退款重试' }[f.flow_type] || f.flow_type}</td>
                    <td style={{ color: f.flow_type.includes('refund') || f.flow_type.includes('reversal') ? '#10b981' : '#ef4444' }}>
                      {f.flow_type.includes('refund') || f.flow_type.includes('reversal') ? '-' : '+'}¥{f.amount}
                    </td>
                    <td>{f.pay_channel || '-'}</td>
                    <td><span className={`badge ${f.status === 'success' ? 'badge-success' : f.status === 'pending' ? 'badge-warning' : f.status === 'hanging' ? 'badge-info' : 'badge-danger'}`}>
                      {{ success: '成功', pending: '处理中', hanging: '挂账', failed: '失败', written_off: '已核销', resolved: '已解决' }[f.status] || f.status}
                    </span></td>
                    <td>{f.remark || f.fail_reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!detail && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>订单号</th>
                <th>柜号</th>
                <th>区域</th>
                <th>租赁时间</th>
                <th>押金</th>
                <th>应退</th>
                <th>状态</th>
                <th>退款状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan="9" className="empty-state">暂无订单记录</td></tr>
              ) : orders.map(o => (
                <tr key={o.id}>
                  <td>{o.order_no}</td>
                  <td>{o.locker_code}</td>
                  <td>{o.zone}</td>
                  <td>{o.rent_time}</td>
                  <td>¥{o.actual_deposit}</td>
                  <td>¥{o.refund_amount || 0}</td>
                  <td><span className={`badge ${(statusMap[o.status] || {}).cls}`}>{(statusMap[o.status] || {}).text}</span></td>
                  <td><span className={`badge ${(refundMap[o.refund_status] || {}).cls}`}>{(refundMap[o.refund_status] || {}).text || '-'}</span></td>
                  <td>
                    <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={() => loadDetail(o.id)}>详情</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default VisitorOrders;
