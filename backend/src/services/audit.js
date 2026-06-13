import { exec, run } from '../db.js';
import { generateId, now } from '../utils.js';

export function createAudit(operator, operatorRole, operation, opts = {}) {
  const auditId = generateId('audit_');
  run(`
    INSERT INTO operation_audits (id, operator, operator_role, operation, target_type, target_id, before_data, after_data, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    auditId,
    operator,
    operatorRole,
    operation,
    opts.targetType || null,
    opts.targetId || null,
    opts.beforeData ? JSON.stringify(opts.beforeData) : null,
    opts.afterData ? JSON.stringify(opts.afterData) : null,
    opts.remark || null
  ]);
  return auditId;
}

export function queryAudits(params = {}) {
  const conditions = [];
  const values = [];
  if (params.operator) {
    conditions.push('operator = ?');
    values.push(params.operator);
  }
  if (params.operation) {
    conditions.push('operation LIKE ?');
    values.push(`%${params.operation}%`);
  }
  if (params.targetType) {
    conditions.push('target_type = ?');
    values.push(params.targetType);
  }
  if (params.startDate) {
    conditions.push('created_at >= ?');
    values.push(params.startDate);
  }
  if (params.endDate) {
    conditions.push('created_at <= ?');
    values.push(params.endDate + ' 23:59:59');
  }
  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  return exec(`
    SELECT * FROM operation_audits ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?
  `, [...values, params.limit || 100, params.offset || 0]);
}
