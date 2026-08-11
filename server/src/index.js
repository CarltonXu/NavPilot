require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');

const categoriesRouter = require('./routes/categories');
const itemsRouter = require('./routes/items');
const searchRouter = require('./routes/search');
const aiRouter = require('./routes/ai');
const settingsRouter = require('./routes/settings');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const analyticsRouter = require('./routes/analytics');
const sharesRouter = require('./routes/shares');
const transferRouter = require('./routes/transfer');
const { optionalSession } = require('./middleware/auth');
const { bootstrapAdmin } = require('./services/authService');
const { cleanupSessions } = require('./services/sessionService');
const { startCron } = require('./cron');
const { configureAppProxy,initializeGeoIp,getGeoStatus } = require('./services/proxyGeoService');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  configureAppProxy(app);
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', optionalSession);
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/admin/analytics', analyticsRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/items', itemsRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/shares', sharesRouter);
  app.use('/api/transfer', transferRouter);
  app.get('/api/health', (req, res) => res.json({ ok: true, geoIp:getGeoStatus() }));
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    console.error('[server]', error.message);
    return res.status(error.status || 500).json({ code: error.code || 'INTERNAL_ERROR', error: error.status ? error.message : '服务器内部错误' });
  });
  return app;
}

async function start() {
  const bootstrapped = await bootstrapAdmin();
  if (bootstrapped) console.log(`[auth] 已创建首个管理员: ${bootstrapped.username}，首次登录必须修改密码`);
  cleanupSessions();
  await initializeGeoIp();
  const app = createApp();
  const port = process.env.PORT || 8787;
  return app.listen(port, () => { console.log(`NavPilot 服务已启动: http://localhost:${port}`); startCron(); });
}

if (require.main === module) start().catch((error) => { console.error(error); process.exit(1); });
module.exports = { createApp, start };
