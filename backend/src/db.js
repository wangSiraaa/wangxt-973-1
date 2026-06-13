import initSqlJs from 'sql.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db;
let SQL;
let inTransaction = false;

export async function initDB(dbPath = null) {
  const dbFile = dbPath || path.join(__dirname, '..', 'data', 'locker.db');
  const dataDir = path.dirname(dbFile);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  if (!SQL) SQL = await initSqlJs();

  let existingBuffer = null;
  if (fs.existsSync(dbFile)) {
    existingBuffer = fs.readFileSync(dbFile);
  }
  db = existingBuffer ? new SQL.Database(existingBuffer) : new SQL.Database();

  db.exec('PRAGMA foreign_keys = ON');
  createTables();
  initSeedData();

  saveDB(dbFile);
  return db;
}

export function getDB() {
  if (!db) throw new Error('DB not initialized');
  return db;
}

export function saveDB(dbPath = null) {
  const dbFile = dbPath || path.join(__dirname, '..', 'data', 'locker.db');
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbFile, buffer);
}

function exec(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function run(sql, params = []) {
  db.run(sql, params);
  if (!inTransaction) saveDB();
  return {
    changes: db.getRowsModified ? db.getRowsModified() : 1,
    lastInsertRowid: exec('SELECT last_insert_rowid() AS id')[0]?.id
  };
}

function transaction(fn) {
  return (...args) => {
    db.exec('BEGIN TRANSACTION');
    inTransaction = true;
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      saveDB();
      return result;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    } finally {
      inTransaction = false;
    }
  };
}

function getOne(sql, params = []) {
  const rows = exec(sql, params);
  return rows[0] || null;
}

export { exec, run, getOne, transaction };

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT UNIQUE NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'visitor',
      password TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lockers (
      id TEXT PRIMARY KEY,
      locker_code TEXT UNIQUE NOT NULL,
      zone TEXT NOT NULL,
      locker_type TEXT NOT NULL,
      size TEXT NOT NULL DEFAULT 'medium',
      base_deposit REAL NOT NULL DEFAULT 50,
      hourly_rate REAL NOT NULL DEFAULT 5,
      max_overtime_hours INTEGER NOT NULL DEFAULT 24,
      status TEXT NOT NULL DEFAULT 'available',
      lock_status TEXT NOT NULL DEFAULT 'locked',
      last_lock_event TEXT,
      last_lock_event_time TEXT,
      wristband_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rental_orders (
      id TEXT PRIMARY KEY,
      order_no TEXT UNIQUE NOT NULL,
      locker_id TEXT NOT NULL REFERENCES lockers(id),
      visitor_phone TEXT NOT NULL,
      visitor_name TEXT,
      wristband_id TEXT,
      zone TEXT NOT NULL,
      locker_type TEXT NOT NULL,
      deposit_amount REAL NOT NULL,
      pay_channel TEXT NOT NULL DEFAULT 'online',
      coupon_id TEXT,
      coupon_discount REAL DEFAULT 0,
      actual_deposit REAL NOT NULL,
      rent_time TEXT NOT NULL,
      expected_return_time TEXT,
      actual_return_time TEXT,
      overtime_hours REAL DEFAULT 0,
      overtime_fee REAL DEFAULT 0,
      refund_amount REAL DEFAULT 0,
      refund_status TEXT DEFAULT 'pending',
      refund_channel TEXT,
      refund_fail_reason TEXT,
      refund_retry_count INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'renting',
      is_force_closed INTEGER DEFAULT 0,
      force_close_reason TEXT,
      force_close_operator TEXT,
      source_order_id TEXT,
      swap_from_order_id TEXT,
      has_swapped INTEGER DEFAULT 0,
      is_cross_zone INTEGER DEFAULT 0,
      left_items TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deposit_flows (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES rental_orders(id),
      flow_type TEXT NOT NULL,
      amount REAL NOT NULL,
      pay_channel TEXT,
      transaction_id TEXT,
      status TEXT NOT NULL DEFAULT 'success',
      fail_reason TEXT,
      operator TEXT,
      remark TEXT,
      retry_of TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS repair_records (
      id TEXT PRIMARY KEY,
      locker_id TEXT NOT NULL REFERENCES lockers(id),
      report_time TEXT NOT NULL,
      reporter TEXT NOT NULL,
      fault_type TEXT NOT NULL,
      fault_description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      assignee TEXT,
      repair_start_time TEXT,
      repair_end_time TEXT,
      repair_description TEXT,
      parts_cost REAL DEFAULT 0,
      is_accepted INTEGER DEFAULT 0,
      accepted_by TEXT,
      accepted_time TEXT,
      acceptance_remark TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS operation_audits (
      id TEXT PRIMARY KEY,
      operator TEXT NOT NULL,
      operator_role TEXT NOT NULL,
      operation TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      before_data TEXT,
      after_data TEXT,
      ip TEXT,
      user_agent TEXT,
      remark TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_settlements (
      id TEXT PRIMARY KEY,
      settle_date TEXT UNIQUE NOT NULL,
      total_deposit_collected REAL NOT NULL DEFAULT 0,
      total_deposit_refunded REAL NOT NULL DEFAULT 0,
      total_overtime_fee REAL NOT NULL DEFAULT 0,
      total_orders INTEGER NOT NULL DEFAULT 0,
      total_returned INTEGER NOT NULL DEFAULT 0,
      total_pending_refund INTEGER NOT NULL DEFAULT 0,
      total_exception_orders INTEGER NOT NULL DEFAULT 0,
      difference_amount REAL NOT NULL DEFAULT 0,
      difference_detail TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      is_locked INTEGER DEFAULT 0,
      locked_by TEXT,
      locked_at TEXT,
      reconciled_by TEXT,
      reconciled_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id TEXT PRIMARY KEY,
      coupon_code TEXT UNIQUE NOT NULL,
      coupon_name TEXT NOT NULL,
      discount_type TEXT NOT NULL,
      discount_value REAL NOT NULL,
      min_deposit REAL DEFAULT 0,
      max_discount REAL,
      valid_from TEXT,
      valid_to TEXT,
      total_count INTEGER DEFAULT -1,
      used_count INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS left_items (
      id TEXT PRIMARY KEY,
      order_id TEXT REFERENCES rental_orders(id),
      locker_id TEXT NOT NULL REFERENCES lockers(id),
      item_name TEXT NOT NULL,
      item_description TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      found_time TEXT NOT NULL,
      found_by TEXT,
      storage_location TEXT,
      status TEXT NOT NULL DEFAULT 'stored',
      claimed_by TEXT,
      claimed_phone TEXT,
      claimed_time TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS force_open_approvals (
      id TEXT PRIMARY KEY,
      locker_id TEXT NOT NULL REFERENCES lockers(id),
      order_id TEXT REFERENCES rental_orders(id),
      applicant TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      approver TEXT,
      approval_time TEXT,
      approval_remark TEXT,
      executed INTEGER DEFAULT 0,
      executed_by TEXT,
      executed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS locker_batch_operations (
      id TEXT PRIMARY KEY,
      zone TEXT,
      locker_ids TEXT NOT NULL,
      operation TEXT NOT NULL,
      reason TEXT NOT NULL,
      operator TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_rental_orders_phone ON rental_orders(visitor_phone);
    CREATE INDEX IF NOT EXISTS idx_rental_orders_status ON rental_orders(status);
    CREATE INDEX IF NOT EXISTS idx_rental_orders_locker ON rental_orders(locker_id);
    CREATE INDEX IF NOT EXISTS idx_deposit_flows_order ON deposit_flows(order_id);
    CREATE INDEX IF NOT EXISTS idx_repair_records_locker ON repair_records(locker_id);
    CREATE INDEX IF NOT EXISTS idx_repair_records_status ON repair_records(status);
    CREATE INDEX IF NOT EXISTS idx_lockers_zone ON lockers(zone);
    CREATE INDEX IF NOT EXISTS idx_lockers_status ON lockers(status);
    CREATE INDEX IF NOT EXISTS idx_audits_operator ON operation_audits(operator);
    CREATE INDEX IF NOT EXISTS idx_audits_operation ON operation_audits(operation);
  `);
}

function initSeedData() {
  const userCount = getOne('SELECT COUNT(*) as count FROM users').count;
  if (userCount === 0) {
    const insert = (id, phone, name, role, password) => {
      run('INSERT INTO users (id, phone, name, role, password) VALUES (?, ?, ?, ?, ?)', [id, phone, name, role, password]);
    };
    insert('admin_001', '13800000001', '系统管理员', 'admin', 'admin123');
    insert('finance_001', '13800000002', '财务小王', 'finance', 'finance123');
    insert('ops_001', '13800000003', '运维老张', 'maintenance', 'ops123');
    insert('visitor_001', '13900000001', '测试游客1', 'visitor', null);
    insert('visitor_002', '13900000002', '测试游客2', 'visitor', null);
    insert('visitor_003', '13900000003', '测试游客3', 'visitor', null);
  }

  const lockerCount = getOne('SELECT COUNT(*) as count FROM lockers').count;
  if (lockerCount === 0) {
    const zones = ['A区-冲浪池', 'B区-造浪池', 'C区-儿童区', 'D区-漂流河'];
    const types = ['普通柜', '贵重物品柜', '大件行李柜'];
    const sizes = ['small', 'medium', 'large'];
    let idx = 1;
    zones.forEach((zone, zi) => {
      for (let i = 1; i <= 10; i++) {
        const typeIdx = (i - 1) % 3;
        const sizeIdx = (i - 1) % 3;
        const deposit = types[typeIdx] === '贵重物品柜' ? 100 : types[typeIdx] === '大件行李柜' ? 80 : 50;
        const rate = types[typeIdx] === '贵重物品柜' ? 10 : types[typeIdx] === '大件行李柜' ? 8 : 5;
        run(
          'INSERT INTO lockers (id, locker_code, zone, locker_type, size, base_deposit, hourly_rate) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            `locker_${String(idx).padStart(4, '0')}`,
            `${zone.charAt(0)}${String(i).padStart(3, '0')}`,
            zone,
            types[typeIdx],
            sizes[sizeIdx],
            deposit,
            rate
          ]
        );
        idx++;
      }
    });
  }

  const couponCount = getOne('SELECT COUNT(*) as count FROM coupons').count;
  if (couponCount === 0) {
    const insert = (id, code, name, type, val, min, max, status) => {
      run('INSERT INTO coupons (id, coupon_code, coupon_name, discount_type, discount_value, min_deposit, max_discount, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, code, name, type, val, min, max, status]);
    };
    insert('coupon_001', 'NEW10', '新用户立减10元', 'fixed', 10, 50, 10, 'active');
    insert('coupon_002', 'VIP20', 'VIP8折券', 'percent', 0.2, 50, 30, 'active');
    insert('coupon_003', 'FREE5', '5元无门槛', 'fixed', 5, 0, 5, 'active');
  }
}
