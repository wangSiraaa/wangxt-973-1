import { initDB, saveDB } from './src/db.js';
import * as maintenance from './src/services/maintenance.js';
import * as audit from './src/services/audit.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const DEFAULT_DB = path.join(dataDir, 'locker.db');
const BACKUP = path.join(dataDir, 'locker_backup_approval_test.db');

if (fs.existsSync(DEFAULT_DB)) {
  fs.copyFileSync(DEFAULT_DB, BACKUP);
  fs.unlinkSync(DEFAULT_DB);
}

await initDB();

const log = (title, data) => {
  console.log(`\n======================================================================`);
  console.log(`📋 ${title}`);
  console.log(`======================================================================`);
  if (data !== undefined) console.log(JSON.stringify(data, null, 2));
};

log('🧪 强制开柜审批权限校验 - 回归验证');

let testPassed = false;
let step = 0;

const expectThrow = async (fn, expectedMsg) => {
  try {
    const result = fn();
    return { threw: false, result };
  } catch (e) {
    return { threw: true, message: e.message, hit: expectedMsg ? e.message.includes(expectedMsg) : true };
  }
};

try {
  step++;
  log(`Step ${step}: 管理员 admin_001 提交强制开柜申请`);
  const apply1 = maintenance.applyForceOpen({
    lockerId: 'locker_0005',
    reason: '游客遗失腕带，急需取出随身物品',
    applicant: 'admin_001',
    applicantRole: 'admin'
  });
  saveDB();
  log('  ✅ 申请提交成功', {
    approvalId: apply1.approvalId,
    status: apply1.status
  });

  step++;
  log(`Step ${step}: 同一管理员 admin_001 审批自己的申请 → 应被拦截（自审自批）`);
  const selfApprove = expectThrow(() =>
    maintenance.approveForceOpen({
      approvalId: apply1.approvalId,
      approved: true,
      remark: '同意',
      approver: 'admin_001',
      approverRole: 'admin'
    }),
    '自审自批'
  );
  log('  🚫 自审自批拦截结果', {
    threw: selfApprove.threw,
    message: selfApprove.message,
    符合预期: selfApprove.threw && selfApprove.hit ? '✅ 是' : '❌ 否'
  });
  if (!selfApprove.threw || !selfApprove.hit) {
    throw new Error('自审自批未被正确拦截！');
  }

  step++;
  log(`Step ${step}: 另一位管理员 admin_002 审批 → 应被拦截（角色无权限）`);
  const roleBlock = expectThrow(() =>
    maintenance.approveForceOpen({
      approvalId: apply1.approvalId,
      approved: true,
      remark: '同意',
      approver: 'admin_002',
      approverRole: 'admin'
    }),
    '无强制开柜审批权限'
  );
  log('  🚫 角色权限拦截结果', {
    threw: roleBlock.threw,
    message: roleBlock.message,
    符合预期: roleBlock.threw && roleBlock.hit ? '✅ 是' : '❌ 否'
  });
  if (!roleBlock.threw || !roleBlock.hit) {
    throw new Error('管理员角色审批未被正确拦截！');
  }

  step++;
  log(`Step ${step}: 运维人员 ops_001 审批 → 应被拦截（角色无权限）`);
  const opsBlock = expectThrow(() =>
    maintenance.approveForceOpen({
      approvalId: apply1.approvalId,
      approved: true,
      remark: '同意',
      approver: 'ops_001',
      approverRole: 'maintenance'
    }),
    '无强制开柜审批权限'
  );
  log('  🚫 运维角色拦截结果', {
    threw: opsBlock.threw,
    message: opsBlock.message,
    符合预期: opsBlock.threw && opsBlock.hit ? '✅ 是' : '❌ 否'
  });
  if (!opsBlock.threw || !opsBlock.hit) {
    throw new Error('运维角色审批未被正确拦截！');
  }

  step++;
  log(`Step ${step}: 财务 finance_001 审批通过 → 应成功，并解锁柜子`);
  const approveOk = maintenance.approveForceOpen({
    approvalId: apply1.approvalId,
    approved: true,
    remark: '情况属实，同意强制开柜',
    approver: 'finance_001',
    approverRole: 'finance'
  });
  saveDB();
  log('  ✅ 财务审批通过', {
    approvalId: approveOk.approvalId,
    status: approveOk.status,
    executed: approveOk.executed
  });
  if (approveOk.status !== 'approved' || approveOk.executed !== 1) {
    throw new Error('财务审批未成功执行！');
  }

  step++;
  log(`Step ${step}: 重复审批同一申请 → 应被拦截（已处理）`);
  const dupBlock = expectThrow(() =>
    maintenance.approveForceOpen({
      approvalId: apply1.approvalId,
      approved: false,
      remark: '驳回',
      approver: 'finance_002',
      approverRole: 'finance'
    }),
    '已通过'
  );
  log('  🚫 重复审批拦截结果', {
    threw: dupBlock.threw,
    message: dupBlock.message,
    符合预期: dupBlock.threw && dupBlock.hit ? '✅ 是' : '❌ 否'
  });
  if (!dupBlock.threw || !dupBlock.hit) {
    throw new Error('重复审批未被正确拦截！');
  }

  step++;
  log(`Step ${step}: 验证审计记录（申请/审批/执行 三类）`);
  const audits = audit.queryAudits({ targetType: 'force_open', targetId: apply1.approvalId });
  const opsAudits = audit.queryAudits({ operation: 'execute_force_open' });
  log('  📋 审计统计', {
    force_open相关审计数: audits.length,
    强制开柜执行审计数: opsAudits.length,
    操作类型: audits.map(a => a.operation + ' | ' + a.operator + ' | ' + a.operator_role)
  });
  const opTypes = new Set(audits.map(a => a.operation));
  if (!opTypes.has('apply_force_open') || !opTypes.has('approve_force_open') || opsAudits.length === 0) {
    throw new Error('审计记录不完整！');
  }

  step++;
  log(`Step ${step}: 第二场景 - 财务驳回申请`);
  const apply2 = maintenance.applyForceOpen({
    lockerId: 'locker_0006',
    reason: '管理员想自己开柜拿私人物品',
    applicant: 'admin_001',
    applicantRole: 'admin'
  });
  const rejectResult = maintenance.approveForceOpen({
    approvalId: apply2.approvalId,
    approved: false,
    remark: '理由不充分，非紧急情况，驳回',
    approver: 'finance_001',
    approverRole: 'finance'
  });
  saveDB();
  log('  ✅ 财务驳回成功', {
    approvalId: rejectResult.approvalId,
    status: rejectResult.status,
    executed: rejectResult.executed
  });
  if (rejectResult.status !== 'rejected' || rejectResult.executed !== 0) {
    throw new Error('驳回结果不正确！');
  }

  step++;
  log(`Step ${step}: 运维也能提交申请（扩展权限验证）`);
  const apply3 = maintenance.applyForceOpen({
    lockerId: 'locker_0007',
    reason: '维修需要临时开柜检查锁具',
    applicant: 'ops_001',
    applicantRole: 'maintenance'
  });
  saveDB();
  log('  ✅ 运维提交申请成功', {
    approvalId: apply3.approvalId,
    申请人: 'ops_001',
    角色: 'maintenance'
  });

  testPassed = true;
  console.log('\n\n🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊');
  console.log('    ✅ 强制开柜审批权限校验 - 全部回归验证通过');
  console.log('');
  console.log('    验证项：');
  console.log('      ✅ 管理员自审自批 → 被拦截');
  console.log('      ✅ 管理员审批他人 → 被拦截（角色无权限）');
  console.log('      ✅ 运维角色审批 → 被拦截（角色无权限）');
  console.log('      ✅ 财务审批通过 → 成功，柜子解锁');
  console.log('      ✅ 重复审批 → 被拦截（状态校验）');
  console.log('      ✅ 财务驳回 → 正常，不执行解锁');
  console.log('      ✅ 审计记录完整 → 申请/审批/执行 三类齐全');
  console.log('      ✅ 运维也能提交申请');
  console.log('🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊\n');

} catch (e) {
  console.log('\n');
  console.log(`❌ 回归验证失败 (Step ${step}):`, e.message);
  console.log(e.stack);
} finally {
  if (fs.existsSync(BACKUP)) {
    fs.copyFileSync(BACKUP, DEFAULT_DB);
    fs.unlinkSync(BACKUP);
  }
  process.exit(testPassed ? 0 : 1);
}
