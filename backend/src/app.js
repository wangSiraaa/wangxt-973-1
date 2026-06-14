import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB } from './db.js';
import * as rental from './services/rental.js';
import * as finance from './services/finance.js';
import * as maintenance from './services/maintenance.js';
import * as query from './services/query.js';
import * as audit from './services/audit.js';
import * as lockerStatus from './services/lockerStatus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createApp() {
  await initDB();
  lockerStatus.syncAllLockersStatus();

  const app = express();
  app.use(cors());
  app.use(express.json());

  const roleAuth = (allowedRoles) => (req, res, next) => {
    const role = req.headers['x-user-role'] || 'visitor';
    if (!allowedRoles.includes('*') && !allowedRoles.includes(role)) {
      return res.status(403).json({ error: '权限不足' });
    }
    req.userRole = role;
    req.userPhone = req.headers['x-user-phone'] || 'system';
    req.userName = req.headers['x-user-name'] || 'system';
    next();
  };

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.post('/api/auth/login', (req, res) => {
    try {
      const { phone, password } = req.body;
      const user = query.login(phone, password);
      if (!user) {
        return res.status(401).json({ error: '手机号或密码错误' });
      }
      res.json({ success: true, user });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/users', roleAuth(['admin', 'finance']), (req, res) => {
    res.json(query.getUsers());
  });

  app.post('/api/visitor/rent', roleAuth(['*']), (req, res) => {
    try {
      const result = rental.rentLocker({
        ...req.body,
        operator: req.userPhone
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/visitor/orders/:phone', roleAuth(['*']), (req, res) => {
    res.json(query.getVisitorOrders(req.params.phone));
  });

  app.get('/api/visitor/active-order/:phone', roleAuth(['*']), (req, res) => {
    res.json(query.getVisitorActiveOrder(req.params.phone));
  });

  app.post('/api/visitor/apply-swap', roleAuth(['*']), (req, res) => {
    try {
      const result = rental.applySwapLocker({
        ...req.body,
        operator: req.userPhone
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/lockers', roleAuth(['*']), (req, res) => {
    res.json(query.queryLockers(req.query));
  });

  app.get('/api/lockers/heatmap', roleAuth(['*']), (req, res) => {
    res.json(lockerStatus.getLockersHeatmap());
  });

  app.get('/api/lockers/:id/status', roleAuth(['*']), (req, res) => {
    res.json(lockerStatus.deriveLockerStatus(req.params.id));
  });

  app.get('/api/orders', roleAuth(['admin', 'finance', 'maintenance']), (req, res) => {
    const params = { ...req.query };
    if (params.statuses) {
      if (typeof params.statuses === 'string') {
        params.statuses = params.statuses.split(',').map(s => s.trim()).filter(Boolean);
      } else if (!Array.isArray(params.statuses)) {
        delete params.statuses;
      }
    }
    res.json(query.queryOrders(params));
  });

  app.get('/api/orders/:id', roleAuth(['*']), (req, res) => {
    res.json(query.getOrderDetail(req.params.id));
  });

  app.post('/api/admin/return', roleAuth(['admin']), (req, res) => {
    try {
      const result = rental.returnLocker({
        ...req.body,
        operator: req.userPhone
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/admin/swap/confirm', roleAuth(['admin']), (req, res) => {
    try {
      const result = rental.confirmSwapLocker({
        ...req.body,
        operator: req.userPhone
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/admin/fault/report', roleAuth(['admin', 'maintenance']), (req, res) => {
    try {
      const result = rental.reportFault({
        ...req.body,
        reporter: req.userPhone
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/admin/force-close', roleAuth(['admin', 'finance']), (req, res) => {
    try {
      const result = rental.forceCloseOrder({
        ...req.body,
        operator: req.userPhone,
        operatorRole: req.userRole
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/admin/wristband/bind', roleAuth(['admin']), (req, res) => {
    try {
      const result = rental.bindWristband({
        ...req.body,
        operator: req.userPhone
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/admin/lock-event', roleAuth(['admin']), (req, res) => {
    try {
      const result = rental.recordLockEvent(req.body);
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/admin/left-item/register', roleAuth(['admin']), (req, res) => {
    try {
      const result = rental.registerLeftItem({
        ...req.body,
        foundBy: req.userPhone
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/admin/batch-disable', roleAuth(['maintenance', 'admin']), (req, res) => {
    try {
      const result = rental.batchDisableLockers({
        ...req.body,
        operator: req.userPhone
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/repairs', roleAuth(['admin', 'finance', 'maintenance']), (req, res) => {
    res.json(maintenance.queryRepairs(req.query));
  });

  app.post('/api/repair/assign', roleAuth(['maintenance', 'admin']), (req, res) => {
    try {
      const result = maintenance.assignRepair({
        ...req.body,
        operator: req.userPhone
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/repair/start', roleAuth(['maintenance']), (req, res) => {
    try {
      const result = maintenance.startRepair({
        ...req.body,
        operator: req.userPhone
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/repair/complete', roleAuth(['maintenance']), (req, res) => {
    try {
      const result = maintenance.completeRepair({
        ...req.body,
        operator: req.userPhone
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/repair/accept', roleAuth(['admin', 'finance']), (req, res) => {
    try {
      const result = maintenance.acceptRepair({
        ...req.body,
        operator: req.userPhone
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/left-items', roleAuth(['*']), (req, res) => {
    res.json(maintenance.queryLeftItems(req.query));
  });

  app.post('/api/left-item/claim', roleAuth(['admin']), (req, res) => {
    try {
      const result = maintenance.claimLeftItem({
        ...req.body,
        operator: req.userPhone
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/force-open/apply', roleAuth(['admin', 'maintenance']), (req, res) => {
    try {
      const result = maintenance.applyForceOpen({
        ...req.body,
        applicant: req.userPhone,
        applicantRole: req.userRole
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/force-open/approve', roleAuth(['finance']), (req, res) => {
    try {
      const result = maintenance.approveForceOpen({
        ...req.body,
        approver: req.userPhone,
        approverRole: req.userRole
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(403).json({ error: e.message });
    }
  });

  app.get('/api/force-open/approvals', roleAuth(['admin', 'finance', 'maintenance']), (req, res) => {
    res.json(query.getForceOpenApprovals(req.query));
  });

  app.get('/api/finance/deposit-ledger', roleAuth(['finance', 'admin']), (req, res) => {
    res.json(finance.getDepositLedger(req.query));
  });

  app.get('/api/finance/hanging', roleAuth(['finance', 'admin']), (req, res) => {
    res.json(finance.getHangingList());
  });

  app.post('/api/finance/refund', roleAuth(['finance']), (req, res) => {
    try {
      const result = finance.processRefund({
        ...req.body,
        operator: req.userPhone
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/finance/refund/retry', roleAuth(['finance']), (req, res) => {
    try {
      const result = finance.retryRefund({
        ...req.body,
        operator: req.userPhone
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/finance/overtime-reversal', roleAuth(['finance']), (req, res) => {
    try {
      const result = finance.processOvertimeFeeReversal({
        ...req.body,
        operator: req.userPhone
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/finance/hanging/handle', roleAuth(['finance']), (req, res) => {
    try {
      const result = finance.handleHangingDeposit({
        ...req.body,
        operator: req.userPhone
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/finance/mix-refund', roleAuth(['finance']), (req, res) => {
    try {
      const result = finance.mixCashOnlineRefund({
        ...req.body,
        operator: req.userPhone
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/finance/settlements', roleAuth(['finance', 'admin']), (req, res) => {
    res.json(query.getSettlements(req.query));
  });

  app.post('/api/finance/settlement/run', roleAuth(['finance']), (req, res) => {
    try {
      const result = finance.runDailySettlement({
        ...req.body,
        operator: req.userPhone
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/finance/settlement/lock', roleAuth(['finance']), (req, res) => {
    try {
      const result = finance.lockDailySettlement({
        ...req.body,
        operator: req.userPhone
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/finance/settlement/differences/:date', roleAuth(['finance', 'admin']), (req, res) => {
    res.json(finance.getSettlementDifferences(req.params.date));
  });

  app.get('/api/coupons', roleAuth(['*']), (req, res) => {
    res.json(query.getCoupons());
  });

  app.get('/api/audits', roleAuth(['admin', 'finance', 'maintenance']), (req, res) => {
    res.json(audit.queryAudits(req.query));
  });

  const frontendDir = path.join(__dirname, '..', '..', 'frontend', 'dist');
  app.use(express.static(frontendDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(frontendDir, 'index.html'));
  });

  return app;
}
