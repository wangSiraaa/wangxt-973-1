import { exec, run, getOne, transaction } from '../db.js';
import { generateId, generateOrderNo, now, addHours, diffHoursCeil, today } from '../utils.js';
import { deriveLockerStatus, syncLockerDerivedStatus } from './lockerStatus.js';
import { createAudit } from './audit.js';

const PHONE_RENT_LOCK = new Map();

export function rentLocker(params) {
  const { phone, lockerId, payChannel = 'online', couponCode = null, visitorName = null, operator = 'system' } = params;

  if (!phone || !lockerId) {
    throw new Error('手机号和柜子ID不能为空');
  }

  if (PHONE_RENT_LOCK.get(phone)) {
    throw new Error('该手机号正在处理租柜请求，请勿重复提交');
  }

  PHONE_RENT_LOCK.set(phone, true);
  try {
    const activeRental = getOne(`
      SELECT * FROM rental_orders
      WHERE visitor_phone = ? AND status IN ('renting', 'overtime', 'swap_pending')
      LIMIT 1
    `, [phone]);
    if (activeRental) {
      throw new Error('该手机号有未完成的租赁订单（含未退押金），请先归还或退款');
    }

    const pendingRefund = getOne(`
      SELECT COUNT(*) as cnt FROM rental_orders
      WHERE visitor_phone = ? AND refund_status = 'pending' AND status IN ('returned', 'closed')
    `, [phone]).cnt;
    if (pendingRefund > 0) {
      throw new Error('该手机号存在押金待退款，请等待退款完成后再租柜');
    }

    const lockerStatus = deriveLockerStatus(lockerId);
    if (lockerStatus.status !== 'available') {
      throw new Error(`柜子不可出租：${lockerStatus.reason}`);
    }

    const locker = getOne('SELECT * FROM lockers WHERE id = ?', [lockerId]);
    let actualDeposit = locker.base_deposit;
    let couponDiscount = 0;
    let couponId = null;

    if (couponCode) {
      const coupon = getOne('SELECT * FROM coupons WHERE coupon_code = ? AND status = ?', [couponCode, 'active']);
      if (!coupon) {
        throw new Error('优惠券无效或已过期');
      }
      if (coupon.total_count !== -1 && coupon.used_count >= coupon.total_count) {
        throw new Error('优惠券已用完');
      }
      if (coupon.valid_from && new Date(now()) < new Date(coupon.valid_from)) {
        throw new Error('优惠券尚未生效');
      }
      if (coupon.valid_to && new Date(now()) > new Date(coupon.valid_to)) {
        throw new Error('优惠券已过期');
      }
      if (actualDeposit < coupon.min_deposit) {
        throw new Error(`押金金额不满足优惠券使用条件（最低${coupon.min_deposit}元）`);
      }
      if (coupon.discount_type === 'fixed') {
        couponDiscount = coupon.discount_value;
      } else {
        couponDiscount = actualDeposit * coupon.discount_value;
      }
      if (coupon.max_discount && couponDiscount > coupon.max_discount) {
        couponDiscount = coupon.max_discount;
      }
      actualDeposit = Math.max(0, actualDeposit - couponDiscount);
      couponId = coupon.id;
      run('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', [couponId]);
    }

    const orderId = generateId('order_');
    const orderNo = generateOrderNo();
    const rentTime = now();
    const expectedReturn = addHours(rentTime, 4);

    const tx = transaction(() => {
      run(`
        INSERT INTO rental_orders (
          id, order_no, locker_id, visitor_phone, visitor_name, zone, locker_type,
          deposit_amount, pay_channel, coupon_id, coupon_discount, actual_deposit,
          rent_time, expected_return_time, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        orderId, orderNo, lockerId, phone, visitorName, locker.zone, locker.locker_type,
        locker.base_deposit, payChannel, couponId, couponDiscount, actualDeposit,
        rentTime, expectedReturn, 'renting'
      ]);

      const depositFlowId = generateId('flow_');
      run(`
        INSERT INTO deposit_flows (id, order_id, flow_type, amount, pay_channel, status, operator, remark)
        VALUES (?, ?, 'deposit', ?, ?, 'success', ?, ?)
      `, [depositFlowId, orderId, actualDeposit, payChannel, operator,
        couponDiscount > 0 ? `使用优惠券抵扣${couponDiscount}元` : null]);

      run(`
        UPDATE lockers SET lock_status = 'unlocked', last_lock_event = 'unlock_by_rent',
        last_lock_event_time = ?, updated_at = ? WHERE id = ?
      `, [now(), now(), lockerId]);

      syncLockerDerivedStatus(lockerId);
    });
    tx();

    createAudit(operator, 'admin', 'rent_locker', {
      targetType: 'rental_order',
      targetId: orderId,
      afterData: { orderNo, lockerId, phone, actualDeposit }
    });

    return getOne('SELECT * FROM rental_orders WHERE id = ?', [orderId]);
  } finally {
    PHONE_RENT_LOCK.delete(phone);
  }
}

export function returnLocker(params) {
  const { orderId, operator = 'system' } = params;

  const order = getOne('SELECT * FROM rental_orders WHERE id = ?', [orderId]);
  if (!order) {
    throw new Error('租赁订单不存在');
  }
  if (order.status === 'returned' || order.status === 'closed') {
    throw new Error('该订单已归还或关闭');
  }

  const settle = getOne('SELECT * FROM daily_settlements WHERE settle_date = ? AND is_locked = 1', [today()]);
  if (settle) {
    throw new Error('今日已完成日结锁定，无法修改订单');
  }

  const locker = getOne('SELECT * FROM lockers WHERE id = ?', [order.locker_id]);
  const returnTime = now();
  const totalHours = diffHoursCeil(order.rent_time, returnTime);
  const freeHours = 4;
  const overtimeHours = Math.max(0, totalHours - freeHours);
  const overtimeFee = overtimeHours * locker.hourly_rate;
  const refundAmount = Math.max(0, order.actual_deposit - overtimeFee);

  const tx = transaction(() => {
    run(`
      UPDATE rental_orders SET
        actual_return_time = ?, overtime_hours = ?, overtime_fee = ?,
        refund_amount = ?, refund_status = ?, status = 'returned',
        updated_at = ? WHERE id = ?
    `, [returnTime, overtimeHours, overtimeFee, refundAmount,
      refundAmount > 0 ? 'pending' : 'completed', now(), orderId]);

    if (overtimeFee > 0) {
      const feeFlowId = generateId('flow_');
      run(`
        INSERT INTO deposit_flows (id, order_id, flow_type, amount, status, operator, remark)
        VALUES (?, ?, 'overtime_fee', ?, 'success', ?, ?)
      `, [feeFlowId, orderId, overtimeFee, operator,
        `超时${overtimeHours}小时，每小时${locker.hourly_rate}元`]);
    }

    if (refundAmount > 0) {
      const refundFlowId = generateId('flow_');
      run(`
        INSERT INTO deposit_flows (id, order_id, flow_type, amount, pay_channel, status, operator, remark)
        VALUES (?, ?, 'refund', ?, ?, 'pending', ?, '押金退还')
      `, [refundFlowId, orderId, refundAmount, order.pay_channel, operator]);
    }

    run(`
      UPDATE lockers SET lock_status = 'locked', last_lock_event = 'lock_by_return',
      last_lock_event_time = ?, wristband_id = NULL, updated_at = ? WHERE id = ?
    `, [now(), now(), order.locker_id]);

    syncLockerDerivedStatus(order.locker_id);
  });
  tx();

  createAudit(operator, 'admin', 'return_locker', {
    targetType: 'rental_order',
    targetId: orderId,
    beforeData: { status: order.status },
    afterData: { status: 'returned', overtimeHours, overtimeFee, refundAmount }
  });

  return getOne('SELECT * FROM rental_orders WHERE id = ?', [orderId]);
}

export function applySwapLocker(params) {
  const { orderId, reason, newLockerId, operator = 'system', isCrossZone = false } = params;

  const order = getOne('SELECT * FROM rental_orders WHERE id = ?', [orderId]);
  if (!order) throw new Error('订单不存在');
  if (order.status !== 'renting') throw new Error('只有租赁中的订单才能换柜');
  if (order.has_swapped) throw new Error('该订单已换过柜');

  const newLockerStatus = deriveLockerStatus(newLockerId);
  if (newLockerStatus.status !== 'available') {
    throw new Error(`目标柜子不可用：${newLockerStatus.reason}`);
  }

  const newLocker = getOne('SELECT * FROM lockers WHERE id = ?', [newLockerId]);
  const depositDiff = newLocker.base_deposit - order.deposit_amount;

  const tx = transaction(() => {
    run(`
      UPDATE rental_orders SET status = 'swap_pending', has_swapped = 1,
      updated_at = ? WHERE id = ?
    `, [now(), orderId]);

    syncLockerDerivedStatus(order.locker_id);
  });
  tx();

  createAudit(operator, 'admin', 'apply_swap', {
    targetType: 'rental_order',
    targetId: orderId,
    afterData: { newLockerId, reason, isCrossZone, depositDiff }
  });

  return {
    orderId,
    newLockerId,
    depositDiff,
    message: depositDiff > 0 ? `需补交押金差价${depositDiff}元` : depositDiff < 0 ? `将退还押金差价${Math.abs(depositDiff)}元` : '无需补差价'
  };
}

export function confirmSwapLocker(params) {
  const { orderId, newLockerId, operator = 'system' } = params;

  const order = getOne('SELECT * FROM rental_orders WHERE id = ?', [orderId]);
  if (!order || order.status !== 'swap_pending') {
    throw new Error('换柜申请不存在或状态不正确');
  }

  const newLocker = getOne('SELECT * FROM lockers WHERE id = ?', [newLockerId]);
  const depositDiff = newLocker.base_deposit - order.deposit_amount;

  const newOrderId = generateId('order_');
  const newOrderNo = generateOrderNo();

  const tx = transaction(() => {
    run(`
      UPDATE rental_orders SET status = 'returned', actual_return_time = ?,
      refund_amount = refund_amount, updated_at = ? WHERE id = ?
    `, [now(), now(), orderId]);

    const newActualDeposit = order.actual_deposit + depositDiff;
    run(`
      INSERT INTO rental_orders (
        id, order_no, locker_id, visitor_phone, visitor_name, zone, locker_type,
        deposit_amount, pay_channel, coupon_id, coupon_discount, actual_deposit,
        rent_time, expected_return_time, status, swap_from_order_id, is_cross_zone
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'renting', ?, ?)
    `, [
      newOrderId, newOrderNo, newLockerId, order.visitor_phone, order.visitor_name,
      newLocker.zone, newLocker.locker_type, newLocker.base_deposit, order.pay_channel,
      order.coupon_id, order.coupon_discount, newActualDeposit, now(),
      addHours(now(), 4), orderId, newLocker.zone !== order.zone ? 1 : 0
    ]);

    if (depositDiff > 0) {
      const flowId = generateId('flow_');
      run(`
        INSERT INTO deposit_flows (id, order_id, flow_type, amount, pay_channel, status, operator, remark)
        VALUES (?, ?, 'deposit_adjust', ?, ?, 'success', ?, '换柜补押金差价')
      `, [flowId, newOrderId, depositDiff, order.pay_channel, operator]);
    } else if (depositDiff < 0) {
      const flowId = generateId('flow_');
      run(`
        INSERT INTO deposit_flows (id, order_id, flow_type, amount, pay_channel, status, operator, remark)
        VALUES (?, ?, 'refund_adjust', ?, ?, 'success', ?, '换柜退押金差价')
      `, [flowId, orderId, Math.abs(depositDiff), order.pay_channel, operator]);
    }

    run(`
      UPDATE lockers SET lock_status = 'locked', last_lock_event = 'lock_by_swap_out',
      last_lock_event_time = ?, updated_at = ? WHERE id = ?
    `, [now(), now(), order.locker_id]);

    run(`
      UPDATE lockers SET lock_status = 'unlocked', last_lock_event = 'unlock_by_swap_in',
      last_lock_event_time = ?, updated_at = ? WHERE id = ?
    `, [now(), now(), newLockerId]);

    syncLockerDerivedStatus(order.locker_id);
    syncLockerDerivedStatus(newLockerId);
  });
  tx();

  createAudit(operator, 'admin', 'confirm_swap', {
    targetType: 'rental_order',
    targetId: newOrderId,
    afterData: { fromOrder: orderId, newLockerId, depositDiff }
  });

  return getOne('SELECT * FROM rental_orders WHERE id = ?', [newOrderId]);
}

export function forceCloseOrder(params) {
  const { orderId, reason, operator, operatorRole } = params;

  if (!reason || reason.trim().length < 5) {
    throw new Error('强制关单必须填写原因（至少5个字）');
  }
  if (operatorRole !== 'admin' && operatorRole !== 'finance') {
    throw new Error('只有管理员或财务才能执行强制关单');
  }

  const order = getOne('SELECT * FROM rental_orders WHERE id = ?', [orderId]);
  if (!order) throw new Error('订单不存在');
  if (order.status === 'closed' || order.status === 'returned') {
    throw new Error('该订单已关闭或归还');
  }

  const settle = getOne('SELECT * FROM daily_settlements WHERE settle_date = ? AND is_locked = 1', [today()]);
  if (settle) {
    throw new Error('今日已完成日结锁定，无法强制关单');
  }

  const tx = transaction(() => {
    run(`
      UPDATE rental_orders SET status = 'closed', is_force_closed = 1,
      force_close_reason = ?, force_close_operator = ?,
      refund_status = CASE WHEN actual_deposit > 0 THEN 'pending' ELSE 'completed' END,
      refund_amount = actual_deposit, updated_at = ? WHERE id = ?
    `, [reason, operator, now(), orderId]);

    if (order.actual_deposit > 0) {
      const flowId = generateId('flow_');
      run(`
        INSERT INTO deposit_flows (id, order_id, flow_type, amount, pay_channel, status, operator, remark)
        VALUES (?, ?, 'force_refund', ?, ?, 'pending', ?, ?)
      `, [flowId, orderId, order.actual_deposit, order.pay_channel, operator, `强制关单：${reason}`]);
    }

    run(`
      UPDATE lockers SET lock_status = 'locked', last_lock_event = 'lock_by_force_close',
      last_lock_event_time = ?, wristband_id = NULL, updated_at = ? WHERE id = ?
    `, [now(), now(), order.locker_id]);

    syncLockerDerivedStatus(order.locker_id);
  });
  tx();

  createAudit(operator, operatorRole, 'force_close_order', {
    targetType: 'rental_order',
    targetId: orderId,
    beforeData: { status: order.status },
    afterData: { status: 'closed', reason, refundAmount: order.actual_deposit }
  });

  return getOne('SELECT * FROM rental_orders WHERE id = ?', [orderId]);
}

export function reportFault(params) {
  const { lockerId, faultType, description, reporter, operator = reporter } = params;

  const locker = getOne('SELECT * FROM lockers WHERE id = ?', [lockerId]);
  if (!locker) throw new Error('柜子不存在');

  const activeOrder = getOne(`
    SELECT * FROM rental_orders
    WHERE locker_id = ? AND status IN ('renting', 'overtime')
    ORDER BY rent_time DESC LIMIT 1
  `, [lockerId]);

  const repairId = generateId('repair_');
  run(`
    INSERT INTO repair_records (id, locker_id, report_time, reporter, fault_type, fault_description, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `, [repairId, lockerId, now(), reporter, faultType, description]);

  if (activeOrder) {
    run(`UPDATE rental_orders SET status = 'swap_pending', updated_at = ? WHERE id = ?`,
      [now(), activeOrder.id]);
  }

  syncLockerDerivedStatus(lockerId);

  createAudit(operator, 'admin', 'report_fault', {
    targetType: 'locker',
    targetId: lockerId,
    afterData: { repairId, faultType, description }
  });

  return { repairId, lockerId, activeOrderId: activeOrder?.id };
}

export function bindWristband(params) {
  const { orderId, wristbandId, operator = 'system' } = params;

  const order = getOne('SELECT * FROM rental_orders WHERE id = ?', [orderId]);
  if (!order) throw new Error('订单不存在');
  if (order.status !== 'renting') throw new Error('只有租赁中的订单才能绑定腕带');

  const existing = getOne(`
    SELECT id FROM lockers WHERE wristband_id = ?
  `, [wristbandId]);
  if (existing) {
    throw new Error('该腕带已绑定其他柜子');
  }

  run(`UPDATE lockers SET wristband_id = ?, updated_at = ? WHERE id = ?`,
    [wristbandId, now(), order.locker_id]);
  run(`UPDATE rental_orders SET wristband_id = ?, updated_at = ? WHERE id = ?`,
    [wristbandId, now(), orderId]);

  createAudit(operator, 'admin', 'bind_wristband', {
    targetType: 'rental_order',
    targetId: orderId,
    afterData: { wristbandId }
  });

  return { success: true, wristbandId };
}

export function recordLockEvent(params) {
  const { lockerId, eventType, source = 'wristband' } = params;

  const validEvents = ['lock_by_wristband', 'unlock_by_wristband', 'lock_by_admin', 'unlock_by_admin', 'lock_fault'];
  if (!validEvents.includes(eventType)) {
    throw new Error('无效的锁事件类型');
  }

  run(`
    UPDATE lockers SET
      lock_status = CASE WHEN ? LIKE 'unlock%' THEN 'unlocked' ELSE 'locked' END,
      last_lock_event = ?, last_lock_event_time = ?, updated_at = ?
    WHERE id = ?
  `, [eventType, eventType, now(), now(), lockerId]);

  syncLockerDerivedStatus(lockerId);

  return { lockerId, eventType, time: now() };
}

export function registerLeftItem(params) {
  const { lockerId, orderId, itemName, description, quantity = 1, foundBy } = params;

  const itemId = generateId('item_');
  run(`
    INSERT INTO left_items (id, order_id, locker_id, item_name, item_description, quantity, found_time, found_by, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'stored')
  `, [itemId, orderId || null, lockerId, itemName, description, quantity, now(), foundBy]);

  if (orderId) {
    const order = getOne('SELECT * FROM rental_orders WHERE id = ?', [orderId]);
    const existing = order.left_items ? JSON.parse(order.left_items) : [];
    existing.push({ itemId, itemName, quantity });
    run('UPDATE rental_orders SET left_items = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(existing), now(), orderId]);
  }

  createAudit(foundBy, 'admin', 'register_left_item', {
    targetType: 'left_item',
    targetId: itemId,
    afterData: { lockerId, itemName, quantity }
  });

  return { itemId };
}

export function batchDisableLockers(params) {
  const { zone, lockerIds, reason, operator } = params;

  if (!lockerIds || lockerIds.length === 0) {
    throw new Error('请选择要停柜的柜子');
  }
  if (!reason || reason.length < 5) {
    throw new Error('请填写停柜原因（至少5个字）');
  }

  const batchId = generateId('batch_');
  const tx = transaction(() => {
    lockerIds.forEach(id => {
      const status = deriveLockerStatus(id);
      if (status.status === 'rented' || status.status === 'in_use' || status.status === 'overtime') {
        throw new Error(`柜子${id}正在使用中，不能停柜`);
      }
      run('UPDATE lockers SET status = ?, updated_at = ? WHERE id = ?',
        ['disabled', now(), id]);
    });

    run(`
      INSERT INTO locker_batch_operations (id, zone, locker_ids, operation, reason, operator)
      VALUES (?, ?, ?, 'disable', ?, ?)
    `, [batchId, zone || null, JSON.stringify(lockerIds), reason, operator]);

    lockerIds.forEach(id => syncLockerDerivedStatus(id));
  });
  tx();

  createAudit(operator, 'maintenance', 'batch_disable_lockers', {
    targetType: 'locker_batch',
    targetId: batchId,
    afterData: { count: lockerIds.length, reason }
  });

  return { batchId, disabledCount: lockerIds.length };
}
