import { exec, getOne } from '../db.js';

export function queryLockers(params = {}) {
  const conditions = [];
  const values = [];
  if (params.zone) {
    conditions.push('zone = ?');
    values.push(params.zone);
  }
  if (params.status) {
    conditions.push('status = ?');
    values.push(params.status);
  }
  if (params.lockerType) {
    conditions.push('locker_type = ?');
    values.push(params.lockerType);
  }
  if (params.lockerCode) {
    conditions.push('locker_code LIKE ?');
    values.push(`%${params.lockerCode}%`);
  }
  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  return exec(`
    SELECT * FROM lockers ${where} ORDER BY zone, locker_code LIMIT ? OFFSET ?
  `, [...values, params.limit || 200, params.offset || 0]);
}

export function queryOrders(params = {}) {
  const conditions = [];
  const values = [];
  if (params.phone) {
    conditions.push('visitor_phone = ?');
    values.push(params.phone);
  }
  if (params.status) {
    conditions.push('status = ?');
    values.push(params.status);
  }
  if (params.lockerId) {
    conditions.push('locker_id = ?');
    values.push(params.lockerId);
  }
  if (params.orderNo) {
    conditions.push('order_no LIKE ?');
    values.push(`%${params.orderNo}%`);
  }
  if (params.isForceClosed) {
    conditions.push('is_force_closed = 1');
  }
  if (params.startDate) {
    conditions.push('rent_time >= ?');
    values.push(params.startDate);
  }
  if (params.endDate) {
    conditions.push('rent_time <= ?');
    values.push(params.endDate + ' 23:59:59');
  }
  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  return exec(`
    SELECT o.*, l.locker_code
    FROM rental_orders o LEFT JOIN lockers l ON o.locker_id = l.id
    ${where} ORDER BY o.rent_time DESC LIMIT ? OFFSET ?
  `, [...values, params.limit || 200, params.offset || 0]);
}

export function getOrderDetail(orderId) {
  const order = getOne(`
    SELECT o.*, l.locker_code, l.zone, l.locker_type, l.size, l.hourly_rate
    FROM rental_orders o LEFT JOIN lockers l ON o.locker_id = l.id
    WHERE o.id = ?
  `, [orderId]);
  if (!order) return null;
  const flows = exec('SELECT * FROM deposit_flows WHERE order_id = ? ORDER BY created_at', [orderId]);
  const repairs = exec(`
    SELECT r.* FROM repair_records r WHERE r.locker_id = ?
  `, [order.locker_id]);
  return { ...order, flows, repairs };
}

export function getVisitorOrders(phone) {
  return exec(`
    SELECT o.*, l.locker_code, l.zone
    FROM rental_orders o LEFT JOIN lockers l ON o.locker_id = l.id
    WHERE o.visitor_phone = ? ORDER BY o.rent_time DESC LIMIT 50
  `, [phone]);
}

export function getVisitorActiveOrder(phone) {
  return getOne(`
    SELECT o.*, l.locker_code, l.zone, l.locker_type, l.base_deposit, l.hourly_rate
    FROM rental_orders o LEFT JOIN lockers l ON o.locker_id = l.id
    WHERE o.visitor_phone = ? AND o.status IN ('renting', 'overtime', 'swap_pending')
    ORDER BY o.rent_time DESC LIMIT 1
  `, [phone]);
}

export function getCoupons() {
  return exec('SELECT * FROM coupons WHERE status = ?', ['active']);
}

export function getSettlements(params = {}) {
  return exec(`
    SELECT * FROM daily_settlements ORDER BY settle_date DESC LIMIT ? OFFSET ?
  `, [params.limit || 30, params.offset || 0]);
}

export function getUsers() {
  return exec('SELECT id, phone, name, role, created_at FROM users');
}

export function login(phone, password) {
  const user = getOne('SELECT * FROM users WHERE phone = ?', [phone]);
  if (!user) return null;
  if (user.role === 'visitor') {
    return { id: user.id, phone: user.phone, name: user.name, role: user.role };
  }
  if (user.password === password) {
    return { id: user.id, phone: user.phone, name: user.name, role: user.role };
  }
  return null;
}

export function getForceOpenApprovals(params = {}) {
  const conditions = [];
  const values = [];
  if (params.status) {
    conditions.push('status = ?');
    values.push(params.status);
  }
  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  return exec(`
    SELECT a.*, l.locker_code, l.zone
    FROM force_open_approvals a LEFT JOIN lockers l ON a.locker_id = l.id
    ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?
  `, [...values, params.limit || 50, params.offset || 0]);
}
