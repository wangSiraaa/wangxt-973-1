import { initDB, getDB, saveDB, exec, run as dbRun } from './src/db.js';
import * as rental from './src/services/rental.js';
import * as query from './src/services/query.js';
import * as finance from './src/services/finance.js';
import { v4 as uuidv4 } from 'uuid';

function log(title, data) {
  console.log('\n' + '='.repeat(70));
  console.log(`📋 【${title}】`);
  console.log('='.repeat(70));
  if (data !== undefined) {
    console.log(typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
  }
}

async function runTests() {
  await initDB();
  const db = getDB();

  console.log('\n🏊 水上乐园储物柜系统 - 管理员归还页回归测试');
  console.log('='.repeat(70));

  try {
    dbRun('DELETE FROM rental_orders');
    dbRun('DELETE FROM deposit_flows');
    dbRun('DELETE FROM repair_records');
    dbRun('DELETE FROM audit_logs');
    dbRun('DELETE FROM daily_settlements');
    dbRun('DELETE FROM force_open_approvals');
    saveDB();

    dbRun("UPDATE lockers SET status = 'available', lock_status = 'locked', wristband_id = null WHERE id IN ('locker_0001', 'locker_0002', 'locker_0003', 'locker_0004', 'locker_0005', 'locker_0006', 'locker_0007', 'locker_0008', 'locker_0009', 'locker_0010')");
    saveDB();

    log('测试1: 按状态查询租赁单（核心修复验证）');
    
    const phone1 = '13800000001';
    const phone2 = '13800000002';
    const phone3 = '13800000003';

    const rent1 = rental.rentLocker({
      visitorPhone: phone1,
      lockerId: 'locker_0001',
      deposit: 50,
      payChannel: 'wechat',
      couponCode: '',
      operator: 'admin_001'
    });
    console.log('✅ 租赁中订单创建:', rent1.orderNo);

    const rent2 = rental.rentLocker({
      visitorPhone: phone2,
      lockerId: 'locker_0002',
      deposit: 100,
      payChannel: 'alipay',
      couponCode: '',
      operator: 'admin_001'
    });

    dbRun("UPDATE rental_orders SET status = 'overtime', rent_time = datetime('now', '-3 hours') WHERE id = ?", [rent2.id]);
    saveDB();
    console.log('✅ 超时订单创建（模拟租赁3小时）');

    const rent3 = rental.rentLocker({
      visitorPhone: phone3,
      lockerId: 'locker_0003',
      deposit: 80,
      payChannel: 'cash',
      couponCode: '',
      operator: 'admin_001'
    });

    dbRun("UPDATE rental_orders SET status = 'swap_pending' WHERE id = ?", [rent3.id]);
    saveDB();
    console.log('✅ 换柜待确认订单创建');

    const rentingOrders = query.queryOrders({ status: 'renting' });
    const overtimeOrders = query.queryOrders({ status: 'overtime' });
    const swapPendingOrders = query.queryOrders({ status: 'swap_pending' });
    const returnedOrders = query.queryOrders({ status: 'returned' });

    console.log('\n🔍 查询结果:');
    console.log(`   renting 状态: ${rentingOrders.length} 笔（预期: 1）`);
    console.log(`   overtime 状态: ${overtimeOrders.length} 笔（预期: 1）`);
    console.log(`   swap_pending 状态: ${swapPendingOrders.length} 笔（预期: 1）`);
    console.log(`   returned 状态: ${returnedOrders.length} 笔（预期: 0）`);

    if (rentingOrders.length === 1 && overtimeOrders.length === 1 && swapPendingOrders.length === 1) {
      console.log('\n✅ 测试1通过: 按状态查询联表无歧义，能正确过滤');
    } else {
      console.log('\n❌ 测试1失败: 查询结果数量不符');
      throw new Error('状态查询失败');
    }

    console.log('\n   验证每条记录包含 locker_code 联表字段:');
    rentingOrders.forEach(o => console.log(`     ${o.order_no}: locker_code=${o.locker_code}, status=${o.status}`));
    overtimeOrders.forEach(o => console.log(`     ${o.order_no}: locker_code=${o.locker_code}, status=${o.status}`));
    swapPendingOrders.forEach(o => console.log(`     ${o.order_no}: locker_code=${o.locker_code}, status=${o.status}`));

    log('测试2: 正常归还流程（无超时）');
    
    const returnResult1 = rental.returnLocker({
      orderId: rent1.id,
      operator: 'admin_001'
    });
    console.log('✅ 归还成功');
    console.log(`   应退押金: ¥${returnResult1.refund_amount}`);
    console.log(`   超时费: ¥${returnResult1.overtime_fee || 0}`);
    console.log(`   订单状态: ${returnResult1.status}`);

    const order1After = query.getOrderDetail(rent1.id);
    if (order1After.status === 'returned' && returnResult1.overtime_fee === 0) {
      console.log('\n✅ 测试2通过: 正常归还流程正确');
    } else {
      console.log('\n❌ 测试2失败');
      throw new Error('正常归还失败');
    }

    log('测试3: 超时归还流程（按规则扣押金）');

    const locker2 = query.queryLockers({ lockerCode: 'A002' })[0];
    console.log(`   柜子费率: ¥${locker2.hourly_rate}/小时`);
    console.log(`   已租赁: 3小时（超出免费时长2小时）`);

    const returnResult2 = rental.returnLocker({
      orderId: rent2.id,
      operator: 'admin_001'
    });
    console.log('✅ 超时归还成功');
    console.log(`   押金: ¥${rent2.actualDeposit}`);
    console.log(`   超时费: ¥${returnResult2.overtime_fee}`);
    console.log(`   应退押金: ¥${returnResult2.refund_amount}`);

    const expectedOvertimeFee = locker2.hourly_rate * 2;
    const expectedRefund = rent2.actualDeposit - expectedOvertimeFee;

    if (returnResult2.overtime_fee === expectedOvertimeFee && returnResult2.refund_amount === expectedRefund) {
      console.log(`\n✅ 测试3通过: 超时扣款正确（${expectedOvertimeFee}元 = ${locker2.hourly_rate}元/小时 × 2小时）`);
    } else {
      console.log(`\n❌ 测试3失败: 预期超时费${expectedOvertimeFee}，实际${returnResult2.overtime_fee}`);
      throw new Error('超时扣款计算错误');
    }

    log('测试4: 归还后退款流程');

    const refundResult = finance.processRefund({
      orderId: rent2.id,
      operator: 'finance_001',
      forceSuccess: true
    });
    console.log('✅ 退款成功');
    console.log(`   退款金额: ¥${refundResult.amount}`);
    console.log(`   退款状态: ${refundResult.status}`);

    const flows = query.getOrderDetail(rent2.id).flows;
    const refundFlow = flows.find(f => f.flow_type === 'refund');
    
    if (refundFlow && refundFlow.status === 'completed' && refundFlow.amount === expectedRefund) {
      console.log('\n✅ 测试4通过: 退款流水正确记录');
    } else {
      console.log('\n❌ 测试4失败');
      throw new Error('退款流程失败');
    }

    log('测试5: 归还后状态查询验证');

    const rentingAfter = query.queryOrders({ status: 'renting' });
    const overtimeAfter = query.queryOrders({ status: 'overtime' });
    const returnedAfter = query.queryOrders({ status: 'returned' });

    console.log(`   renting: ${rentingAfter.length}（预期: 0）`);
    console.log(`   overtime: ${overtimeAfter.length}（预期: 0）`);
    console.log(`   returned: ${returnedAfter.length}（预期: 2）`);

    if (rentingAfter.length === 0 && overtimeAfter.length === 0 && returnedAfter.length === 2) {
      console.log('\n✅ 测试5通过: 归还后状态流转正确');
    } else {
      console.log('\n❌ 测试5失败');
      throw new Error('状态流转错误');
    }

    log('测试6: 换柜待确认订单归还验证');

    const returnResult3 = rental.returnLocker({
      orderId: rent3.id,
      operator: 'admin_001'
    });
    console.log(`   换柜待确认订单归还成功，状态: ${returnResult3.status}`);

    const order3After = query.getOrderDetail(rent3.id);
    if (order3After.status === 'returned') {
      console.log('\n✅ 测试6通过: swap_pending 状态订单可正常归还');
    } else {
      console.log('\n❌ 测试6失败');
      throw new Error('换柜待确认订单归还失败');
    }

    log('测试7: 押金未退拦截验证（归还页不应显示）');

    const rent4 = rental.rentLocker({
      visitorPhone: '13800000004',
      lockerId: 'locker_0004',
      deposit: 50,
      payChannel: 'wechat',
      couponCode: '',
      operator: 'admin_001'
    });

    rental.returnLocker({ orderId: rent4.id, operator: 'admin_001' });

    const pendingOrders = query.queryOrders({ status: 'refund_pending' });
    console.log(`   refund_pending 状态订单: ${pendingOrders.length} 笔`);
    console.log(`   这些订单在归还页不会显示（状态不在 renting/overtime/swap_pending 中）`);

    if (pendingOrders.length === 1) {
      console.log('\n✅ 测试7通过: 押金未退订单状态正确分离');
    } else {
      console.log('\n❌ 测试7失败');
      throw new Error('押金未退状态错误');
    }

    console.log('\n' + '🎊'.repeat(30));
    console.log('✅✅✅ 所有回归测试通过！管理员归还页功能正常 ✅✅✅');
    console.log('🎊'.repeat(30) + '\n');

  } catch (e) {
    console.log('\n' + '❌'.repeat(70));
    console.log('回归测试失败:', e.message);
    console.log(e.stack);
    console.log('❌'.repeat(70) + '\n');
    process.exit(1);
  }
}

runTests().catch(e => {
  console.error('启动失败:', e);
  process.exit(1);
});
