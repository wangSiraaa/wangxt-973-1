import { exec, run, getOne } from '../db.js';
import { now } from '../utils.js';

export function deriveLockerStatus(lockerId) {
  const locker = getOne('SELECT * FROM lockers WHERE id = ?', [lockerId]);
  if (!locker) return { status: 'unknown', reason: '柜子不存在' };

  const activeRepair = getOne(`
    SELECT * FROM repair_records
    WHERE locker_id = ? AND status IN ('pending', 'repairing')
    ORDER BY report_time DESC LIMIT 1
  `, [lockerId]);
  if (activeRepair) {
    return {
      status: 'maintenance',
      reason: `维修中: ${activeRepair.fault_description || activeRepair.fault_type}`,
      repairId: activeRepair.id
    };
  }

  const batchDisabled = getOne(`
    SELECT * FROM locker_batch_operations
    WHERE locker_ids LIKE ? AND operation = 'disable' AND status = 'completed'
    ORDER BY created_at DESC LIMIT 1
  `, [`%${lockerId}%`]);
  if (batchDisabled) {
    return {
      status: 'disabled',
      reason: `批量停柜: ${batchDisabled.reason}`,
      batchId: batchDisabled.id
    };
  }

  const activeRental = getOne(`
    SELECT * FROM rental_orders
    WHERE locker_id = ? AND status IN ('renting', 'overtime', 'swap_pending')
    ORDER BY rent_time DESC LIMIT 1
  `, [lockerId]);

  if (activeRental) {
    const unpaidDeposit = getOne(`
      SELECT COUNT(*) as cnt FROM deposit_flows
      WHERE order_id = ? AND flow_type = 'deposit' AND status = 'success'
    `, [activeRental.id]).cnt;

    if (unpaidDeposit === 0) {
      return { status: 'deposit_pending', reason: '押金未支付', orderId: activeRental.id };
    }

    const openLockEvent = getOne(`
      SELECT * FROM rental_orders
      WHERE id = ? AND is_force_closed = 1
    `, [activeRental.id]);
    if (openLockEvent) {
      return {
        status: 'force_opened',
        reason: `强制关单: ${activeRental.force_close_reason}`,
        orderId: activeRental.id
      };
    }

    if (activeRental.status === 'overtime') {
      return { status: 'overtime', reason: '超时未归还', orderId: activeRental.id };
    }

    if (activeRental.status === 'swap_pending') {
      return { status: 'swap_pending', reason: '换柜待确认', orderId: activeRental.id };
    }

    if (locker.lock_status === 'unlocked' && locker.last_lock_event === 'unlock_by_wristband') {
      return { status: 'in_use', reason: '使用中（已开）', orderId: activeRental.id };
    }

    return { status: 'rented', reason: '租赁中', orderId: activeRental.id };
  }

  const forceOpenPending = getOne(`
    SELECT * FROM force_open_approvals
    WHERE locker_id = ? AND status = 'approved' AND executed = 0
    ORDER BY created_at DESC LIMIT 1
  `, [lockerId]);
  if (forceOpenPending) {
    return { status: 'force_open_pending', reason: '强制开柜待执行', approvalId: forceOpenPending.id };
  }

  if (locker.lock_status === 'unlocked') {
    return { status: 'unlocked_idle', reason: '空闲但未上锁' };
  }

  return { status: 'available', reason: '空闲可用' };
}

export function syncLockerDerivedStatus(lockerId) {
  const derived = deriveLockerStatus(lockerId);
  const locker = getOne('SELECT * FROM lockers WHERE id = ?', [lockerId]);
  if (locker && locker.status !== derived.status) {
    run('UPDATE lockers SET status = ?, updated_at = ? WHERE id = ?',
      [derived.status, now(), lockerId]);
  }
  return derived;
}

export function syncAllLockersStatus() {
  const lockers = exec('SELECT id FROM lockers');
  const results = {};
  lockers.forEach(l => {
    results[l.id] = syncLockerDerivedStatus(l.id);
  });
  return results;
}

export function getLockersHeatmap() {
  const zones = exec(`
    SELECT zone, COUNT(*) as total FROM lockers GROUP BY zone
  `);

  const result = {};
  zones.forEach(z => {
    const rented = getOne(`
      SELECT COUNT(*) as cnt FROM lockers l
      WHERE l.zone = ? AND l.status IN ('rented', 'in_use', 'overtime')
    `, [z.zone]).cnt;
    const maintenance = getOne(`
      SELECT COUNT(*) as cnt FROM lockers l
      WHERE l.zone = ? AND l.status IN ('maintenance', 'disabled')
    `, [z.zone]).cnt;
    const available = z.total - rented - maintenance;
    result[z.zone] = {
      total: z.total,
      rented,
      maintenance,
      available,
      occupancyRate: z.total > 0 ? Math.round((rented / z.total) * 100) : 0
    };
  });
  return result;
}
