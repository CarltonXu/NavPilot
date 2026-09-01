const cron = require('node-cron');
const { checkDueItems } = require('./services/healthCheck');
const { createHealthRepository } = require('./services/healthRepository');
const db = require('./db');

const healthRepository = createHealthRepository(db);

function startCron() {
  const enabled = String(process.env.AUTO_CHECK_ENABLED || 'true') === 'true';
  if (!enabled) {
    console.log('[cron] 自动探测已关闭 (AUTO_CHECK_ENABLED=false)');
  } else {
    cron.schedule('* * * * *', async () => {
      const start = Date.now();
      const result = await checkDueItems();
      if (result.total) console.log(`[cron] 到期探测完成 total=${result.total} 耗时=${Date.now() - start}ms`);
    });
    console.log('[cron] 已启动按资源周期调度，每分钟扫描到期任务');
    checkDueItems().then((r) => r.total && console.log(`[cron] 启动到期探测完成 total=${r.total}`));
  }
  if (String(process.env.HEALTH_MAINTENANCE_ENABLED || 'true') === 'true') {
    cron.schedule('17 3 * * *', () => {
      const startedAt = Date.now();
      try {
        const result = healthRepository.cleanup();
        console.log(`[health-maintenance] 原始探测清理完成 deleted=${result.deleted} retentionDays=${result.retentionDays} 耗时=${Date.now()-startedAt}ms`);
      } catch (error) {
        console.error('[health-maintenance] 原始探测清理失败',error);
      }
    });
    cron.schedule('47 4 * * 0', () => {
      try { healthRepository.optimize(); console.log('[health-maintenance] SQLite optimize 完成'); }
      catch (error) { console.error('[health-maintenance] SQLite optimize 失败',error); }
    });
    console.log(`[health-maintenance] 已启用，原始探测保留 ${healthRepository.retentionDays()} 天`);
  }
}

module.exports = { startCron };
