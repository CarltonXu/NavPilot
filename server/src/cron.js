const cron = require('node-cron');
const { checkAllItems } = require('./services/healthCheck');

function startCron() {
  const enabled = String(process.env.AUTO_CHECK_ENABLED || 'true') === 'true';
  const minutes = Math.max(1, parseInt(process.env.CHECK_INTERVAL_MINUTES || '5', 10));
  if (!enabled) {
    console.log('[cron] 自动探测已关闭 (AUTO_CHECK_ENABLED=false)');
  } else {
    const expr = `*/${minutes} * * * *`;
    cron.schedule(expr, async () => {
      const start = Date.now();
      const result = await checkAllItems();
      console.log(`[cron] 探测完成 total=${result.total} 耗时=${Date.now() - start}ms`);
    });
    console.log(`[cron] 已启动定时探测，每 ${minutes} 分钟一次`);
    checkAllItems().then((r) => console.log(`[cron] 启动即时探测完成 total=${r.total}`));
  }
}

module.exports = { startCron };
