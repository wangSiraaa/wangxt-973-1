import { exec, run, getOne, transaction } from '../db.js';
import { now } from '../utils.js';
import { syncLockerDerivedStatus } from './lockerStatus.js';
import { createAudit } from './audit.js';

export function assignRepair(params) {
  const { repairId, assignee, operator } = params;

  const repair = getOne('SELECT * FROM repair_records WHERE id = ?', [repairId]);
  if (!repair) throw new Error('维修记录不存在');
  if (repair.status !== 'pending') throw new Error('只有待处理的维修才能派单');

  run(`
    UPDATE repair_records SET status = 'assigned', assignee = ?, updated_at = ? WHERE id = ?
  `, [assignee, now(), repairId]);

  createAudit(operator, 'maintenance', 'assign_repair', {
    targetType: 'repair_record',
    targetId: repairId,
    afterData: { assignee }
  });

  return { repairId, assignee };
}

export function startRepair(params) {
  const { repairId, operator } = params;

  const repair = getOne('SELECT * FROM repair_records WHERE id = ?', [repairId]);
  if (!repair) throw new Error('维修记录不存在');
  if (repair.status !== 'assigned') throw new Error('只有已派单的维修才能开始');

  run(`
    UPDATE repair_records SET status = 'repairing', repair_start_time = ?, updated_at = ? WHERE id = ?
  `, [now(), now(), repairId]);

  createAudit(operator, 'maintenance', 'start_repair', {
    targetType: 'repair_record',
    targetId: repairId
  });

  return { repairId, startTime: now() };
}

export function completeRepair(params) {
  const { repairId, description, partsCost = 0, operator } = params;

  const repair = getOne('SELECT * FROM repair_records WHERE id = ?', [repairId]);
  if (!repair) throw new Error('维修记录不存在');
  if (repair.status !== 'repairing') throw new Error('只有维修中的记录才能完成');

  run(`
    UPDATE repair_records SET status = 'pending_acceptance', repair_end_time = ?,
    repair_description = ?, parts_cost = ?, updated_at = ? WHERE id = ?
  `, [now(), description, partsCost, now(), repairId]);

  createAudit(operator, 'maintenance', 'complete_repair', {
    targetType: 'repair_record',
    targetId: repairId,
    afterData: { partsCost }
  });

  return { repairId, endTime: now(), status: 'pending_acceptance' };
}

export function acceptRepair(params) {
  const { repairId, passed, remark, operator } = params;

  const repair = getOne('SELECT * FROM repair_records WHERE id = ?', [repairId]);
  if (!repair) throw new Error('维修记录不存在');
  if (repair.status !== 'pending_acceptance') throw new Error('只有待验收的维修才能验收');

  const status = passed ? 'completed' : 'rejected';

  if (passed) {
    const tx = transaction(() => {
      run(`
        UPDATE repair_records SET is_accepted = ?, accepted_by = ?, accepted_time = ?,
        acceptance_remark = ?, status = ?, updated_at = ? WHERE id = ?
      `, [1, operator, now(), remark, status, now(), repairId]);
      syncLockerDerivedStatus(repair.locker_id);
    });
    tx();
  } else {
    run(`
      UPDATE repair_records SET is_accepted = ?, accepted_by = ?, accepted_time = ?,
      acceptance_remark = ?, status = ?, updated_at = ? WHERE id = ?
    `, [0, operator, now(), remark, status, now(), repairId]);
    run(`
      UPDATE repair_records SET status = 'repairing', updated_at = ? WHERE id = ?
    `, [now(), repairId]);
  }

  createAudit(operator, 'maintenance', passed ? 'accept_repair_pass' : 'accept_repair_reject', {
    targetType: 'repair_record',
    targetId: repairId,
    afterData: { passed, remark }
  });

  return { repairId, status, passed };
}

export function queryRepairs(params = {}) {
  const conditions = [];
  const values = [];
  if (params.status) {
    conditions.push('status = ?');
    values.push(params.status);
  }
  if (params.lockerId) {
    conditions.push('locker_id = ?');
    values.push(params.lockerId);
  }
  if (params.assignee) {
    conditions.push('assignee = ?');
    values.push(params.assignee);
  }
  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  return exec(`
    SELECT r.*, l.locker_code, l.zone, l.locker_type
    FROM repair_records r LEFT JOIN lockers l ON r.locker_id = l.id
    ${where} ORDER BY r.report_time DESC LIMIT ? OFFSET ?
  `, [...values, params.limit || 100, params.offset || 0]);
}

export function queryLeftItems(params = {}) {
  const conditions = [];
  const values = [];
  if (params.status) {
    conditions.push('status = ?');
    values.push(params.status);
  }
  if (params.lockerId) {
    conditions.push('locker_id = ?');
    values.push(params.lockerId);
  }
  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  return exec(`
    SELECT i.*, l.locker_code, l.zone, o.order_no, o.visitor_phone
    FROM left_items i
    LEFT JOIN lockers l ON i.locker_id = l.id
    LEFT JOIN rental_orders o ON i.order_id = o.id
    ${where} ORDER BY i.found_time DESC LIMIT ? OFFSET ?
  `, [...values, params.limit || 100, params.offset || 0]);
}

export function claimLeftItem(params) {
  const { itemId, claimantName, claimantPhone, operator } = params;

  const item = getOne('SELECT * FROM left_items WHERE id = ?', [itemId]);
  if (!item) throw new Error('遗留物品不存在');
  if (item.status !== 'stored') throw new Error('该物品已被领取');

  run(`
    UPDATE left_items SET status = 'claimed', claimed_by = ?, claimed_phone = ?,
    claimed_time = ? WHERE id = ?
  `, [claimantName, claimantPhone, now(), itemId]);

  createAudit(operator, 'admin', 'claim_left_item', {
    targetType: 'left_item',
    targetId: itemId,
    afterData: { claimantName, claimantPhone }
  });

  return { itemId, claimed: true };
}

export function applyForceOpen(params) {
  const { lockerId, orderId, reason, applicant, applicantRole = 'admin' } = params;

  if (!reason || reason.length < 5) throw new Error('请填写开柜原因（至少5字）');
  if (!applicant) throw new Error('申请人不能为空');

  const locker = getOne('SELECT * FROM lockers WHERE id = ?', [lockerId]);
  if (!locker) throw new Error('柜子不存在');

  const approvalId = 'approve_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  run(`
    INSERT INTO force_open_approvals (id, locker_id, order_id, applicant, applicant_role, reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [approvalId, lockerId, orderId || null, applicant, applicantRole, reason]);

  createAudit(applicant, applicantRole, 'apply_force_open', {
    targetType: 'force_open',
    targetId: approvalId,
    afterData: { lockerId, lockerCode: locker.locker_code, reason, applicantRole }
  });

  return { approvalId, status: 'pending' };
}

const APPROVAL_ROLES = ['finance'];

export function approveForceOpen(params) {
  const { approvalId, approved, remark, approver, approverRole = 'admin' } = params;

  if (!approver) throw new Error('审批人不能为空');

  const approval = getOne('SELECT * FROM force_open_approvals WHERE id = ?', [approvalId]);
  if (!approval) throw new Error('审批申请不存在');

  if (approval.status !== 'pending') {
    throw new Error(`该申请已${
      approval.status === 'approved' ? '通过' :
      approval.status === 'rejected' ? '驳回' : '处理'
    }，无法重复审批`);
  }

  if (!APPROVAL_ROLES.includes(approverRole)) {
    throw new Error(`当前角色（${approverRole}）无强制开柜审批权限，需财务及以上权限`);
  }

  if (approval.applicant === approver) {
    throw new Error('申请人与审批人不能为同一人，禁止自审自批');
  }

  const tx = transaction(() => {
    run(`
      UPDATE force_open_approvals
      SET status = ?, approver = ?, approver_role = ?, approval_time = ?, approval_remark = ?
      WHERE id = ?
    `, [
      approved ? 'approved' : 'rejected',
      approver,
      approverRole,
      now(),
      remark || '',
      approvalId
    ]);

    if (approved) {
      run(`
        UPDATE lockers
        SET lock_status = 'unlocked',
            last_lock_event = 'unlock_by_approval',
            last_lock_event_time = ?,
            updated_at = ?
        WHERE id = ?
      `, [now(), now(), approval.locker_id]);

      run(`
        UPDATE force_open_approvals
        SET executed = 1, executed_by = ?, executed_at = ?
        WHERE id = ?
      `, [approver, now(), approvalId]);

      syncLockerDerivedStatus(approval.locker_id);
    }
  });
  tx();

  createAudit(approver, approverRole, approved ? 'approve_force_open' : 'reject_force_open', {
    targetType: 'force_open',
    targetId: approvalId,
    beforeData: { status: 'pending', applicant: approval.applicant, reason: approval.reason },
    afterData: { approved, remark, executed: approved ? 1 : 0 }
  });

  if (approved) {
    createAudit(approver, approverRole, 'execute_force_open', {
      targetType: 'locker',
      targetId: approval.locker_id,
      afterData: { approvalId, lockStatus: 'unlocked' }
    });
  }

  return { approvalId, status: approved ? 'approved' : 'rejected', executed: approved ? 1 : 0 };
}
