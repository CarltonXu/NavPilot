const express = require('express');
const { requireUser, requirePasswordChanged } = require('../middleware/auth');
const { audit } = require('../services/eventService');
const { getConfig, saveConfig, testChannel, listEvents } = require('../services/alertService');

const router = express.Router();

function scopeFor(req) {
  const scope = req.body?.scope || req.query?.scope || 'personal';
  if (!['personal','public'].includes(scope)) {
    const error = new Error('告警空间无效'); error.code = 'ALERT_SCOPE_INVALID'; error.status = 400; throw error;
  }
  return scope;
}

function handleError(res, error) {
  return res.status(error.status || 500).json({ code:error.code || 'ALERT_OPERATION_FAILED', error:error.status ? error.message : '告警操作失败' });
}

router.use(requireUser, requirePasswordChanged);
router.get('/', (req,res) => {
  try { const scope=scopeFor(req); return res.json(getConfig(scope,req.auth.user)); }
  catch (error) { return handleError(res,error); }
});
router.put('/', (req,res) => {
  try { const scope=scopeFor(req); const result=saveConfig(scope,req.auth.user,req.body); audit(req,'alerts.config_updated',{targetType:`${scope}_alerts`,targetId:scope,metadata:{channelCount:result.channels.length}}); return res.json(result); }
  catch (error) { return handleError(res,error); }
});
router.post('/test', async (req,res) => {
  try { const scope=scopeFor(req); await testChannel(scope,req.auth.user,req.body?.channelId); audit(req,'alerts.test_sent',{targetType:`${scope}_alerts`,targetId:req.body?.channelId}); return res.json({ok:true}); }
  catch (error) { return handleError(res,error); }
});
router.get('/events', (req,res) => {
  try { const scope=scopeFor(req); return res.json({ scope, events:listEvents(scope,req.auth.user,req.query.limit) }); }
  catch (error) { return handleError(res,error); }
});

module.exports = router;
