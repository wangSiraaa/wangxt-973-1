import { exec, run, getOne, transaction } from '../db.js';
import { generateId, now, today } from '../utils.js';
import { createAudit } from './audit.js';

export function processRefund(params) {
  const { orderId, operator, forceSuccess = false } = params;

  const order = getOne('SELECT * FROM rental_orders WHERE id = ?', [orderId]);
  if (!order) throw new Error('订单不存在');
  if (order.refund_amount <= 0) throw new Error('该订单无退款金额');
  if (order.refund_status === 'completed') throw new Error('该订单已完成退款');

  const settle = getOne('SELECT * FROM daily_settlements WHERE settle_date = ? AND is_locked = 1', [today()]);
  if (settle) {
    throw new Error('今日已完成日结锁定，无法处理退款');
  }

  const pendingFlow = getOne(`
    SELECT * FROM deposit_flows
    WHERE order_id = ? AND flow_type IN ('refund', 'force_refund') AND status = 'pending'
    ORDER BY created_at DESC LIMIT 1
  `, [orderId]);

  const willFail = !forceSuccess && Math.random() < 0.15;

  const tx = transaction(() => {
    if (pendingFlow) {
      run(`
        UPDATE deposit_flows SET status = ?, fail_reason = ?, created_at = ? WHERE id = ?
      `, [willFail ? 'failed' : 'success', willFail ? '第三方支付渠道超时，模拟退款失败' : null, now(), pendingFlow.id]);
    }

    if (willFail) {
      run(`
        UPDATE rental_orders SET refund_status = 'failed', refund_fail_reason = ?,
        refund_retry_count = COALESCE(refund_retry_count, 0) + 1, updated_at = ? WHERE id = ?
      `, ['第三方支付渠道超时，模拟退款失败', now(), orderId]);

      const exceptionFlowId = generateId('flow_');
      run(`
        INSERT INTO deposit_flows (id, order_id, flow_type, amount, pay_channel, status, fail_reason, operator, remark)
        VALUES (?, ?, 'refund_exception', ?, ?, 'hanging', ?, ?, '退款失败挂账，等待人工处理')
      `, [exceptionFlowId, orderId, order.refund_amount, order.pay_channel, '第三方支付渠道超时，模拟退款失败', operator]);
    } else {
      run(`
        UPDATE rental_orders SET refund_status = 'completed', refund_fail_reason = NULL, updated_at = ? WHERE id = ?
      `, [now(), orderId]);
    }
  });
  tx();

  createAudit(operator, 'finance', willFail ? 'refund_failed' : 'refund_success', {
    targetType: 'rental_order',
    targetId: orderId,
    afterData: { amount: order.refund_amount, willFail }
  });

  return {
    orderId,
    amount: order.refund_amount,
    status: willFail ? 'failed' : 'success',
    retryCount: order.refund_retry_count + (willFail ? 1 : 0)
  };
}

export function retryRefund(params) {
  const { orderId, operator } = params;

  const order = getOne('SELECT * FROM rental_orders WHERE id = ?', [orderId]);
  if (!order) throw new Error('订单不存在');
  if (order.refund_status !== 'failed') throw new Error('只有退款失败的订单才能重试');

  const hangingFlow = getOne(`
    SELECT * FROM deposit_flows
    WHERE order_id = ? AND flow_type = 'refund_exception' AND status = 'hanging'
    ORDER BY created_at DESC LIMIT 1
  `, [orderId]);

  const retryFlowId = generateId('flow_');
  run(`
    INSERT INTO deposit_flows (id, order_id, flow_type, amount, pay_channel, status, operator, remark, retry_of)
    VALUES (?, ?, 'refund_retry', ?, ?, 'pending', ?, ?, ?)
  `, [retryFlowId, orderId, order.refund_amount, order.pay_channel, operator,
    `第${(order.refund_retry_count || 0) + 1}次重试退款`,
    hangingFlow?.id || null]);

  run(`UPDATE rental_orders SET refund_status = 'pending', updated_at = ? WHERE id = ?`,
    [now(), orderId]);

  createAudit(operator, 'finance', 'retry_refund', {
    targetType: 'rental_order',
    targetId: orderId,
    afterData: { retryCount: (order.refund_retry_count || 0) + 1 }
  });

  return processRefund({ orderId, operator, forceSuccess: true });
}

export function processOvertimeFeeReversal(params) {
  const { orderId, reason, operator } = params;

  const order = getOne('SELECT * FROM rental_orders WHERE id = ?', [orderId]);
  if (!order) throw new Error('订单不存在');
  if (!order.overtime_fee || order.overtime_fee <= 0) throw new Error('该订单无超时费用');

  const settle = getOne('SELECT * FROM daily_settlements WHERE settle_date = ? AND is_locked = 1', [today()]);
  if (settle) throw new Error('今日已完成日结锁定，无法冲正');

  const tx = transaction(() => {
    const reversalFlowId = generateId('flow_');
    run(`
      INSERT INTO deposit_flows (id, order_id, flow_type, amount, status, operator, remark)
      VALUES (?, ?, 'overtime_reversal', ?, 'success', ?, ?)
    `, [reversalFlowId, orderId, order.overtime_fee, operator, `超时费冲正：${reason}`]);

    run(`
      UPDATE rental_orders SET
        overtime_fee = 0,
        refund_amount = refund_amount + ?,
        refund_status = CASE WHEN refund_amount + ? > 0 THEN 'pending' ELSE refund_status END,
        updated_at = ? WHERE id = ?
    `, [order.overtime_fee, order.overtime_fee, now(), orderId]);
  });
  tx();

  createAudit(operator, 'finance', 'overtime_reversal', {
    targetType: 'rental_order',
    targetId: orderId,
    afterData: { reversedAmount: order.overtime_fee, reason }
  });

  return { orderId, reversedAmount: order.overtime_fee };
}

export function handleHangingDeposit(params) {
  const { flowId, action, remark, operator } = params;

  const flow = getOne('SELECT * FROM deposit_flows WHERE id = ?', [flowId]);
  if (!flow) throw new Error('挂账流水不存在');
  if (flow.flow_type !== 'refund_exception' || flow.status !== 'hanging') {
    throw new Error('该流水不是挂账状态的退款异常');
  }

  if (action === 'write_off') {
    run(`UPDATE deposit_flows SET status = 'written_off', remark = ?, created_at = ? WHERE id = ?`,
      [`${flow.remark} | 核销：${remark}`, now(), flowId]);
    createAudit(operator, 'finance', 'write_off_hanging', {
      targetType: 'deposit_flow',
      targetId: flowId,
      afterData: { remark }
    });
  } else if (action === 'retry') {
    return retryRefund({ orderId: flow.order_id, operator });
  } else if (action === 'cash_refund') {
    const cashFlowId = generateId('flow_');
    run(`
      INSERT INTO deposit_flows (id, order_id, flow_type, amount, pay_channel, status, operator, remark)
      VALUES (?, ?, 'cash_refund', ?, 'cash', 'success', ?, ?)
    `, [cashFlowId, flow.order_id, flow.amount, operator, `现金退款核销挂账：${remark}`]);
    run(`UPDATE deposit_flows SET status = 'resolved', remark = ?, created_at = ? WHERE id = ?`,
      [`${flow.remark} | 已现金退款`, now(), flowId]);
    run(`UPDATE rental_orders SET refund_status = 'completed', updated_at = ? WHERE id = ?`,
      [now(), flow.order_id]);
    createAudit(operator, 'finance', 'cash_refund_hanging', {
      targetType: 'deposit_flow',
      targetId: flowId,
      afterData: { amount: flow.amount, remark }
    });
  }

  return { flowId, action, status: 'success' };
}

export function getDepositLedger(params = {}) {
  const conditions = [];
  const values = [];
  if (params.phone) {
    conditions.push('o.visitor_phone = ?');
    values.push(params.phone);
  }
  if (params.startDate) {
    conditions.push('f.created_at >= ?');
    values.push(params.startDate);
  }
  if (params.endDate) {
    conditions.push('f.created_at <= ?');
    values.push(params.endDate + ' 23:59:59');
  }
  if (params.flowType) {
    conditions.push('f.flow_type = ?');
    values.push(params.flowType);
  }
  if (params.status) {
    conditions.push('f.status = ?');
    values.push(params.status);
  }
  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  return exec(`
    SELECT f.*, o.order_no, o.visitor_phone, o.visitor_name, o.locker_id
    FROM deposit_flows f
    LEFT JOIN rental_orders o ON f.order_id = o.id
    ${where}
    ORDER BY f.created_at DESC LIMIT ? OFFSET ?
  `, [...values, params.limit || 200, params.offset || 0]);
}

export function getHangingList() {
  return exec(`
    SELECT f.*, o.order_no, o.visitor_phone, o.visitor_name, o.refund_fail_reason
    FROM deposit_flows f
    LEFT JOIN rental_orders o ON f.order_id = o.id
    WHERE f.flow_type = 'refund_exception' AND f.status = 'hanging'
    ORDER BY f.created_at DESC
  `);
}

export function runDailySettlement(params) {
  const { settleDate = today(), operator } = params;

  const existing = getOne('SELECT * FROM daily_settlements WHERE settle_date = ?', [settleDate]);
  if (existing && existing.is_locked) {
    throw new Error('该日期已完成日结锁定');
  }

  const startD = settleDate + ' 00:00:00';
  const endD = settleDate + ' 23:59:59';

  const totalDeposit = getOne(`
    SELECT COALESCE(SUM(amount), 0) as total FROM deposit_flows
    WHERE flow_type IN ('deposit', 'deposit_adjust') AND status = 'success'
    AND created_at BETWEEN ? AND ?
  `, [startD, endD]).total;

  const totalRefund = getOne(`
    SELECT COALESCE(SUM(amount), 0) as total FROM deposit_flows
    WHERE flow_type IN ('refund', 'refund_adjust', 'force_refund', 'cash_refund') AND status = 'success'
    AND created_at BETWEEN ? AND ?
  `, [startD, endD]).total;

  const totalOvertime = getOne(`
    SELECT COALESCE(SUM(amount), 0) as total FROM deposit_flows
    WHERE flow_type = 'overtime_fee' AND status = 'success'
    AND created_at BETWEEN ? AND ?
  `, [startD, endD]).total;

  const totalReversal = getOne(`
    SELECT COALESCE(SUM(amount), 0) as total FROM deposit_flows
    WHERE flow_type = 'overtime_reversal' AND status = 'success'
    AND created_at BETWEEN ? AND ?
  `, [startD, endD]).total;

  const orderCount = getOne(`
    SELECT COUNT(*) as cnt FROM rental_orders WHERE date(rent_time) = ?
  `, [settleDate]).cnt;

  const returnedCount = getOne(`
    SELECT COUNT(*) as cnt FROM rental_orders
    WHERE date(actual_return_time) = ? AND status = 'returned'
  `, [settleDate]).cnt;

  const pendingRefundCount = getOne(`
    SELECT COUNT(*) as cnt FROM rental_orders
    WHERE refund_status IN ('pending', 'failed') AND date(actual_return_time) <= ?
  `, [settleDate]).cnt;

  const exceptionCount = getOne(`
    SELECT COUNT(*) as cnt FROM rental_orders
    WHERE (is_force_closed = 1 OR refund_status = 'failed')
    AND date(created_at) <= ?
  `, [settleDate]).cnt;

  const netExpected = totalDeposit - totalRefund + totalOvertime - totalReversal;
  const hangingAmount = getOne(`
    SELECT COALESCE(SUM(amount), 0) as total FROM deposit_flows
    WHERE flow_type = 'refund_exception' AND status = 'hanging'
    AND date(created_at) <= ?
  `, [settleDate]).total;

  const diffDetail = {
    hangingAmount,
    note: hangingAmount > 0 ? `存在${hangingAmount.toFixed(2)}元退款挂账待处理` : '无差异'
  };

  const tx = transaction(() => {
    if (existing) {
      run(`
        UPDATE daily_settlements SET
          total_deposit_collected = ?, total_deposit_refunded = ?,
          total_overtime_fee = ?, total_orders = ?, total_returned = ?,
          total_pending_refund = ?, total_exception_orders = ?,
          difference_amount = ?, difference_detail = ?,
          status = 'reconciled', reconciled_by = ?, reconciled_at = ?, updated_at = ?
        WHERE settle_date = ?
      `, [totalDeposit, totalRefund, totalOvertime - totalReversal,
        orderCount, returnedCount, pendingRefundCount, exceptionCount,
        hangingAmount, JSON.stringify(diffDetail),
        operator, now(), now(), settleDate]);
    } else {
      const settleId = generateId('settle_');
      run(`
        INSERT INTO daily_settlements (
          id, settle_date, total_deposit_collected, total_deposit_refunded,
          total_overtime_fee, total_orders, total_returned, total_pending_refund,
          total_exception_orders, difference_amount, difference_detail,
          status, reconciled_by, reconciled_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reconciled', ?, ?)
      `, [settleId, settleDate, totalDeposit, totalRefund, totalOvertime - totalReversal,
        orderCount, returnedCount, pendingRefundCount, exceptionCount,
        hangingAmount, JSON.stringify(diffDetail), operator, now()]);
    }
  });
  tx();

  createAudit(operator, 'finance', 'run_daily_settlement', {
    targetType: 'daily_settlement',
    targetId: settleDate,
    afterData: { totalDeposit, totalRefund, netExpected, hangingAmount }
  });

  return getOne('SELECT * FROM daily_settlements WHERE settle_date = ?', [settleDate]);
}

export function lockDailySettlement(params) {
  const { settleDate, operator } = params;

  const settle = getOne('SELECT * FROM daily_settlements WHERE settle_date = ?', [settleDate]);
  if (!settle) throw new Error('该日期尚未进行日结');
  if (settle.is_locked) throw new Error('该日期已锁定');
  if (settle.status !== 'reconciled') throw new Error('日结尚未对账完成，不能锁定');

  const pendingHanging = getOne(`
    SELECT COUNT(*) as cnt FROM deposit_flows
    WHERE flow_type = 'refund_exception' AND status = 'hanging'
  `).cnt;
  if (pendingHanging > 0) {
    throw new Error(`存在${pendingHanging}笔挂账未处理，请先处理后再锁定`);
  }

  run(`
    UPDATE daily_settlements SET is_locked = 1, locked_by = ?, locked_at = ?, updated_at = ?
    WHERE settle_date = ?
  `, [operator, now(), now(), settleDate]);

  createAudit(operator, 'finance', 'lock_daily_settlement', {
    targetType: 'daily_settlement',
    targetId: settleDate
  });

  return { settleDate, locked: true };
}

export function getSettlementDifferences(settleDate) {
  const settle = getOne('SELECT * FROM daily_settlements WHERE settle_date = ?', [settleDate]);
  if (!settle) return [];

  const hangingFlows = exec(`
    SELECT f.*, o.order_no, o.visitor_phone, o.refund_fail_reason
    FROM deposit_flows f LEFT JOIN rental_orders o ON f.order_id = o.id
    WHERE f.flow_type = 'refund_exception' AND f.status = 'hanging'
  `);

  const pendingRefunds = exec(`
    SELECT o.*, l.locker_code
    FROM rental_orders o LEFT JOIN lockers l ON o.locker_id = l.id
    WHERE o.refund_status IN ('pending', 'failed')
  `);

  const forceClosed = exec(`
    SELECT o.*, l.locker_code
    FROM rental_orders o LEFT JOIN lockers l ON o.locker_id = l.id
    WHERE o.is_force_closed = 1
  `);

  return {
    settle,
    hangingFlows,
    pendingRefunds,
    forceClosed
  };
}

export function mixCashOnlineRefund(params) {
  const { orderId, cashAmount, onlineAmount, operator } = params;

  const order = getOne('SELECT * FROM rental_orders WHERE id = ?', [orderId]);
  if (!order) throw new Error('订单不存在');
  if (Math.abs((cashAmount || 0) + (onlineAmount || 0) - order.refund_amount) > 0.01) {
    throw new Error('现金退款+线上退款金额必须等于应退金额');
  }

  const tx = transaction(() => {
    if (cashAmount > 0) {
      const flowId = generateId('flow_');
      run(`
        INSERT INTO deposit_flows (id, order_id, flow_type, amount, pay_channel, status, operator, remark)
        VALUES (?, ?, 'cash_refund', ?, 'cash', 'success', ?, '现金部分退款')
      `, [flowId, orderId, cashAmount, operator]);
    }
    if (onlineAmount > 0) {
      const flowId = generateId('flow_');
      run(`
        INSERT INTO deposit_flows (id, order_id, flow_type, amount, pay_channel, status, operator, remark)
        VALUES (?, ?, 'refund', ?, 'online', 'pending', ?, '线上部分退款')
      `, [flowId, orderId, onlineAmount, operator]);
    }
    run(`UPDATE rental_orders SET refund_status = ?, updated_at = ? WHERE id = ?`,
      [onlineAmount > 0 ? 'pending' : 'completed', now(), orderId]);
  });
  tx();

  createAudit(operator, 'finance', 'mix_refund', {
    targetType: 'rental_order',
    targetId: orderId,
    afterData: { cashAmount, onlineAmount }
  });

  return { orderId, cashAmount, onlineAmount };
}
