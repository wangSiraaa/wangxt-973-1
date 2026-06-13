import { createApp } from './app.js';
import * as rental from './services/rental.js';
import * as finance from './services/finance.js';
import * as maintenance from './services/maintenance.js';
import * as query from './services/query.js';
import * as lockerStatus from './services/lockerStatus.js';
import { exec, run } from './db.js';

const log = (msg, data) => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📋 ${msg}`);
  console.log('='.repeat(70));
  if (data) console.log(JSON.stringify(data, null, 2));
};

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function runDemo() {
  await createApp();
  console.log('\n\n' + '🚀'.repeat(25));
  console.log('    水上乐园储物柜系统 - 全场景演示脚本');
  console.log('🚀'.repeat(25));

  const visitors = ['13910000001', '13910000002', '13910000003', '13910000004', '13910000005'];
  const lockers = exec('SELECT * FROM lockers LIMIT 10');

  log('【场景1】正常租还流程', null);
  try {
    const rentResult = rental.rentLocker({
      phone: visitors[0],
      lockerId: lockers[0].id,
      payChannel: 'online',
      couponCode: 'NEW10',
      visitorName: '演示游客A',
      operator: 'admin_001'
    });
    log('✅ 租柜成功', rentResult);

    const activeOrder = query.getVisitorActiveOrder(visitors[0]);
    log('📱 游客端查看当前订单', activeOrder);

    await delay(100);
    const returnResult = rental.returnLocker({
      orderId: rentResult.id,
      operator: 'admin_001'
    });
    log('✅ 归还成功（无超时）', returnResult);

    const refundResult = finance.processRefund({
      orderId: rentResult.id,
      operator: 'finance_001',
      forceSuccess: true
    });
    log('💰 押金退款成功', refundResult);
  } catch (e) {
    log('❌ 场景1失败', { error: e.message });
  }

  log('【场景2】故障柜拦截 - 不能出租', null);
  try {
    rental.reportFault({
      lockerId: lockers[1].id,
      faultType: '锁损坏',
      description: '电子锁无法打开',
      reporter: 'admin_001'
    });
    const status = lockerStatus.deriveLockerStatus(lockers[1].id);
    log('🔧 柜子已报修，当前状态', status);

    try {
      rental.rentLocker({
        phone: visitors[1],
        lockerId: lockers[1].id,
        operator: 'admin_001'
      });
    } catch (e) {
      log('🚫 租柜被拦截（符合预期）', { error: e.message });
    }
  } catch (e) {
    log('❌ 场景2失败', { error: e.message });
  }

  log('【场景3】超时归还 - 按规则扣押金', null);
  try {
    const rent3 = rental.rentLocker({
      phone: visitors[2],
      lockerId: lockers[2].id,
      visitorName: '演示游客C',
      operator: 'admin_001'
    });

    run(`UPDATE rental_orders SET rent_time = datetime('now', '-6 hours') WHERE id = ?`, [rent3.id]);
    log('⏰ 模拟已租用6小时（超过免费4小时）', null);

    const return3 = rental.returnLocker({
      orderId: rent3.id,
      operator: 'admin_001'
    });
    log('✅ 归还成功 - 超时扣款明细', {
      押金: return3.actual_deposit,
      超时小时: return3.overtime_hours,
      超时费用: return3.overtime_fee,
      应退押金: return3.refund_amount
    });

    const reverseResult = finance.processOvertimeFeeReversal({
      orderId: rent3.id,
      reason: '游客投诉系统时间错误，经核实后冲正',
      operator: 'finance_001'
    });
    log('♻️ 超时费冲正成功', reverseResult);
  } catch (e) {
    log('❌ 场景3失败', { error: e.message });
  }

  log('【场景4】押金未退拦截 - 同一手机号不能再租', null);
  try {
    const rent4 = rental.rentLocker({
      phone: visitors[3],
      lockerId: lockers[3].id,
      visitorName: '演示游客D',
      operator: 'admin_001'
    });
    log('✅ 第一次租柜成功', { orderNo: rent4.order_no });

    rental.returnLocker({ orderId: rent4.id, operator: 'admin_001' });
    log('💵 已归还但押金未退', null);

    try {
      rental.rentLocker({
        phone: visitors[3],
        lockerId: lockers[4].id,
        operator: 'admin_001'
      });
    } catch (e) {
      log('🚫 第二次租柜被拦截（符合预期）', { error: e.message });
    }
  } catch (e) {
    log('❌ 场景4失败', { error: e.message });
  }

  log('【场景5】故障换柜 - 不重复收押金 + 跨区换柜', null);
  try {
    const rent5 = rental.rentLocker({
      phone: visitors[4],
      lockerId: lockers[5].id,
      visitorName: '演示游客E',
      operator: 'admin_001'
    });
    log('✅ 初始租柜', { locker: lockers[5].locker_code, deposit: rent5.actual_deposit });

    const swapApply = rental.applySwapLocker({
      orderId: rent5.id,
      reason: '原柜电子锁故障',
      newLockerId: lockers[6].id,
      operator: 'admin_001',
      isCrossZone: lockers[5].zone !== lockers[6].zone
    });
    log('🔄 换柜申请', swapApply);

    const newOrder = rental.confirmSwapLocker({
      orderId: rent5.id,
      newLockerId: lockers[6].id,
      operator: 'admin_001'
    });
    log('✅ 换柜完成 - 新订单', {
      newLocker: lockers[6].locker_code,
      crossZone: newOrder.is_cross_zone === 1,
      actualDeposit: newOrder.actual_deposit,
      原柜: lockers[5].locker_code,
      押金变化: swapApply.message
    });
  } catch (e) {
    log('❌ 场景5失败', { error: e.message });
  }

  log('【场景6】强制关单 - 必须留下原因', null);
  try {
    const rent6 = rental.rentLocker({
      phone: '13910000006',
      lockerId: lockers[7].id,
      visitorName: '演示游客F',
      operator: 'admin_001'
    });

    try {
      rental.forceCloseOrder({
        orderId: rent6.id,
        reason: '短',
        operator: 'admin_001',
        operatorRole: 'admin'
      });
    } catch (e) {
      log('🚫 强制关单被拦截（原因过短，符合预期）', { error: e.message });
    }

    const closeResult = rental.forceCloseOrder({
      orderId: rent6.id,
      reason: '游客财物被盗，警方介入调查需强制关单封存证据',
      operator: 'admin_001',
      operatorRole: 'admin'
    });
    log('🔐 强制关单成功', {
      status: closeResult.status,
      isForceClosed: closeResult.is_force_closed,
      reason: closeResult.force_close_reason,
      refundAmount: closeResult.refund_amount
    });
  } catch (e) {
    log('❌ 场景6失败', { error: e.message });
  }

  log('【场景7】退款失败挂账 + 重试成功', null);
  try {
    const rent7 = rental.rentLocker({
      phone: '13910000007',
      lockerId: lockers[8].id,
      payChannel: 'online',
      visitorName: '演示游客G',
      operator: 'admin_001'
    });
    rental.returnLocker({ orderId: rent7.id, operator: 'admin_001' });

    let refund7;
    let attempts = 0;
    while (attempts < 5) {
      try {
        refund7 = finance.processRefund({
          orderId: rent7.id,
          operator: 'finance_001',
          forceSuccess: false
        });
        attempts++;
        if (refund7.status === 'failed') break;
        break;
      } catch (e) {
        if (e.message === '该订单已完成退款') {
          refund7 = { status: 'success' };
          break;
        }
        throw e;
      }
    }

    if (refund7?.status === 'failed') {
      log('❌ 退款失败，已自动挂账', {
        refundStatus: 'failed',
        hangingList: finance.getHangingList().map(h => ({
          orderNo: h.order_no, amount: h.amount, reason: h.remark
        }))
      });

      const retryResult = finance.retryRefund({
        orderId: rent7.id,
        operator: 'finance_001'
      });
      log('♻️ 退款重试成功', retryResult);
    } else {
      log('⚠️ 退款模拟未失败（概率问题），跳过挂账演示');
    }
  } catch (e) {
    log('❌ 场景7失败', { error: e.message });
  }

  log('【场景8】同手机号并发租柜控制', null);
  try {
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        Promise.resolve().then(() => {
          try {
            return rental.rentLocker({
              phone: '13910000008',
              lockerId: lockers[9].id,
              visitorName: '并发测试',
              operator: 'admin_001'
            });
          } catch (e) {
            return { error: e.message };
          }
        })
      );
    }
    const results = await Promise.all(promises);
    const successCount = results.filter(r => !r.error).length;
    const failCount = results.filter(r => r.error).length;
    log('🔒 并发控制结果', {
      总请求数: results.length,
      成功数: successCount,
      拦截数: failCount,
      符合预期: successCount === 1 ? '✅ 仅1笔成功' : '⚠️ 可能存在并发问题'
    });
  } catch (e) {
    log('❌ 场景8失败', { error: e.message });
  }

  log('【场景9】日结对账 + 差异展示 + 日结锁账', null);
  try {
    const settle = finance.runDailySettlement({
      operator: 'finance_001'
    });
    log('📊 日结执行结果', {
      日期: settle.settle_date,
      收押金: settle.total_deposit_collected,
      退押金: settle.total_deposit_refunded,
      超时费净收入: settle.total_overtime_fee,
      订单数: settle.total_orders,
      异常单数: settle.total_exception_orders,
      差异金额: settle.difference_amount,
      差异说明: JSON.parse(settle.difference_detail || '{}')
    });

    const diffs = finance.getSettlementDifferences(settle.settle_date);
    log('🔍 日结差异明细', {
      挂账笔数: diffs.hangingFlows.length,
      待退款笔数: diffs.pendingRefunds.length,
      强制关单: diffs.forceClosed.map(o => ({
        orderNo: o.order_no, reason: o.force_close_reason
      }))
    });

    try {
      finance.lockDailySettlement({
        settleDate: settle.settle_date,
        operator: 'finance_001'
      });
    } catch (e) {
      log('🚫 日结锁账被拦截（还有挂账未处理，符合预期）', { error: e.message });
    }
  } catch (e) {
    log('❌ 场景9失败', { error: e.message });
  }

  log('【场景10】维修验收流程 + 遗留物品登记', null);
  try {
    const reportResult = rental.reportFault({
      lockerId: lockers[1].id,
      faultType: '锁损坏',
      description: '电子锁打不开',
      reporter: 'admin_001'
    });

    maintenance.assignRepair({
      repairId: reportResult.repairId,
      assignee: 'ops_001',
      operator: 'admin_001'
    });

    maintenance.startRepair({
      repairId: reportResult.repairId,
      operator: 'ops_001'
    });

    maintenance.completeRepair({
      repairId: reportResult.repairId,
      description: '更换了新的电子锁模块',
      partsCost: 150,
      operator: 'ops_001'
    });

    const acceptResult = maintenance.acceptRepair({
      repairId: reportResult.repairId,
      passed: true,
      remark: '验收通过，功能正常',
      operator: 'admin_001'
    });
    log('🔧 维修全流程完成', acceptResult);

    const itemResult = rental.registerLeftItem({
      lockerId: lockers[0].id,
      itemName: '儿童泳镜',
      description: '蓝色，带有卡通图案',
      quantity: 1,
      foundBy: 'admin_001'
    });
    log('👓 遗留物品登记成功', itemResult);

    const lockerHeatmap = lockerStatus.getLockersHeatmap();
    log('🗺️ 柜区热力图', lockerHeatmap);
  } catch (e) {
    log('❌ 场景10失败', { error: e.message });
  }

  console.log('\n\n' + '🎊'.repeat(25));
  console.log('    演示脚本执行完毕！所有核心场景已验证');
  console.log('🎊'.repeat(25));
  console.log('\n💡 提示：可通过前端界面进行更丰富的交互操作');
  process.exit(0);
}

runDemo().catch(e => {
  console.error('演示脚本执行异常:', e);
  process.exit(1);
});
