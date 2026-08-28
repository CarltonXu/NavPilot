require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const compression = require('compression');

const categoriesRouter = require('./routes/categories');
const itemsRouter = require('./routes/items');
const searchRouter = require('./routes/search');
const aiRouter = require('./routes/ai');
const settingsRouter = require('./routes/settings');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const analyticsRouter = require('./routes/analytics');
const publicInsightsRouter = require('./routes/publicInsights');
const sharesRouter = require('./routes/shares');
const transferRouter = require('./routes/transfer');
const workspaceRouter = require('./routes/workspace');
const alertsRouter = require('./routes/alerts');
const { optionalSession } = require('./middleware/auth');
const { bootstrapAdmin } = require('./services/authService');
const { cleanupSessions } = require('./services/sessionService');
const { createHealthRepository } = require('./services/healthRepository');
const { startCron } = require('./cron');
const { configureAppProxy,initializeGeoIp,getGeoStatus } = require('./services/proxyGeoService');
const { getBrandingSettings, getPublicInsightsSettings, getSetting } = require('./services/settingsService');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[character]);
}
function serializeBootstrap(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
function renderClientIndex(template, settings) {
  const branding = settings.branding || {};
  const title = escapeHtml(branding.siteName || 'NavPilot');
  const favicon = escapeHtml(branding.faviconUrl || branding.logoUrl || '');
  return template
    .replace(/<!--NAVPILOT_TITLE-->([\s\S]*?)<!--\/NAVPILOT_TITLE-->/, title)
    .replace(/<!--NAVPILOT_FAVICON-->([\s\S]*?)<!--\/NAVPILOT_FAVICON-->/, (_, fallback) => favicon || fallback)
    .replace(/<!--NAVPILOT_BOOTSTRAP-->[\s\S]*?<!--\/NAVPILOT_BOOTSTRAP-->/, serializeBootstrap(settings));
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  configureAppProxy(app);
  // Compress JSON, HTML and other text responses. Streaming AI responses are
  // deliberately excluded so chunks reach the browser immediately.
  app.use(compression({
    threshold: 1024,
    filter: (req, res) => {
      if (req.path.startsWith('/api/ai') || res.getHeader('X-Accel-Buffering') === 'no') return false;
      return compression.filter(req, res);
    },
  }));
  app.use(express.json({ limit: '6mb' }));
  app.use('/api', optionalSession);
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/admin/analytics', analyticsRouter);
  app.use('/api/insights/public', publicInsightsRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/items', itemsRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/shares', sharesRouter);
  app.use('/api/transfer', transferRouter);
  app.use('/api/workspace', workspaceRouter);
  app.use('/api/alerts', alertsRouter);
  app.get('/api/health', (req, res) => res.json({ ok: true, geoIp:getGeoStatus() }));
  app.use('/uploads', express.static(require('./services/uploadService').getUploadRoot(), {
    index:false,
    fallthrough:false,
    immutable:true,
    maxAge:'1y',
    dotfiles:'deny',
  }));
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    const indexTemplate = fs.readFileSync(path.join(clientDist, 'index.html'), 'utf8');
    app.use('/assets', express.static(path.join(clientDist, 'assets'), {
      index: false,
      immutable: true,
      maxAge: '1y',
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }));
    app.use(express.static(clientDist, { index:false, maxAge: '1h' }));
    app.get(/^\/(?!api).*/, (req, res) => {
      const settings = {
        bootstrapGeneratedAt: Date.now(),
        ai_personal_enabled: getSetting('ai_personal_enabled', 'false') === 'true',
        branding: getBrandingSettings(),
        publicInsights: getPublicInsightsSettings(),
      };
      res.set('Cache-Control', 'no-cache').type('html').send(renderClientIndex(indexTemplate, settings));
    });
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
  const healthInitialization = createHealthRepository(require('./db')).initialize();
  if (!healthInitialization.skipped) console.log(`[health-data] 历史回填完成 events=${healthInitialization.eventCount} daily=${healthInitialization.dailyCount} incidents=${healthInitialization.incidentCount} 耗时=${healthInitialization.durationMs}ms`);
  await initializeGeoIp();
  const app = createApp();
  const port = process.env.PORT || 8787;
  return app.listen(port, () => {
    console.log(`NavPilot 服务已启动: http://localhost:${port}`);
    if (String(process.env.NAVPILOT_ENABLE_CRON || 'true') === 'true') startCron();
    else console.log('[cron] API 进程已禁用定时任务，由独立 worker 负责');
  });
}

if (require.main === module) start().catch((error) => { console.error(error); process.exit(1); });
module.exports = { createApp, start, renderClientIndex };
