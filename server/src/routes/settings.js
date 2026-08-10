const express = require('express');
const { requireAdmin, requirePasswordChanged } = require('../middleware/auth');
const {
  getSetting,
  setSetting,
  getBrandingSettings,
  getAdminSettingsView,
  updateSystemSettings,
  addAiModel,
  updateAiModel,
  deleteAiModel,
  setDefaultAiModel,
  testAiConnection,
  updateEmbeddingConfig,
  testEmbeddingConnection,
} = require('../services/settingsService');

const router = express.Router();
const { audit } = require('../services/eventService');
const { contentIntelligence } = require('../services/ai/runtime');

router.get('/public', (req, res) => {
  res.json({
    ai_personal_enabled: getSetting('ai_personal_enabled', 'false') === 'true',
    branding: getBrandingSettings(),
  });
});

router.get('/admin', requireAdmin, requirePasswordChanged, (req, res) => {
  res.json(getAdminSettingsView());
});

router.put('/admin', requireAdmin, requirePasswordChanged, (req, res) => {
  try {
    const result = updateSystemSettings(req.body);
    audit(req,'settings.updated',{targetType:'settings',targetId:'system',metadata:{changedFields:[...Object.keys(req.body||{}),...Object.keys(req.body?.ai||{}).map((key)=>`ai.${key}`)]}});
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      code: error.code || 'SETTINGS_UPDATE_FAILED',
      error: error.status ? error.message : '系统设置保存失败',
    });
  }
});

router.put('/ai-personal-enabled', requireAdmin, requirePasswordChanged, (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ code: 'INVALID_AI_PERSONAL_ENABLED', error: '个人空间 AI 开关必须是布尔值' });
  }
  setSetting('ai_personal_enabled', enabled ? 'true' : 'false');
  return res.json({ ai_personal_enabled: enabled });
});

function sendSettingsError(res, error) {
  return res.status(error.status || 500).json({ code:error.code || 'SETTINGS_UPDATE_FAILED', error:error.status ? error.message : '系统设置操作失败' });
}

router.post('/admin/ai-models', requireAdmin, requirePasswordChanged, (req, res) => {
  try { const result=addAiModel(req.body); audit(req,'settings.ai_model.created',{targetType:'ai_model',metadata:{name:req.body.name,model:req.body.model}}); return res.status(201).json(result); }
  catch (error) { return sendSettingsError(res,error); }
});
router.patch('/admin/ai-models/:id', requireAdmin, requirePasswordChanged, (req, res) => {
  try { const result=updateAiModel(req.params.id,req.body); audit(req,'settings.ai_model.updated',{targetType:'ai_model',targetId:req.params.id,metadata:{changedFields:Object.keys(req.body||{})}}); return res.json(result); }
  catch (error) { return sendSettingsError(res,error); }
});
router.delete('/admin/ai-models/:id', requireAdmin, requirePasswordChanged, (req, res) => {
  try { const result=deleteAiModel(req.params.id); audit(req,'settings.ai_model.deleted',{targetType:'ai_model',targetId:req.params.id}); return res.json(result); }
  catch (error) { return sendSettingsError(res,error); }
});
router.post('/admin/ai-models/:id/default', requireAdmin, requirePasswordChanged, (req, res) => {
  try { const result=setDefaultAiModel(req.params.id); audit(req,'settings.ai_model.default_changed',{targetType:'ai_model',targetId:req.params.id}); return res.json(result); }
  catch (error) { return sendSettingsError(res,error); }
});
router.post('/admin/ai-models/test', requireAdmin, requirePasswordChanged, async (req, res) => {
  try { const result=await testAiConnection(req.body); audit(req,'settings.ai_model.connection_tested',{targetType:'ai_model',targetId:req.body.id||null,metadata:{outcome:'success',latencyMs:result.latencyMs}}); return res.json(result); }
  catch (error) { audit(req,'settings.ai_model.connection_tested',{outcome:'failure',targetType:'ai_model',targetId:req.body.id||null,metadata:{reason:error.code||'AI_CONNECTION_FAILED'}}); return sendSettingsError(res,error); }
});
router.put('/admin/embedding', requireAdmin, requirePasswordChanged, (req,res)=>{
  try { const embedding=updateEmbeddingConfig(req.body);audit(req,'settings.embedding.updated',{targetType:'settings',targetId:'embedding',metadata:{changedFields:Object.keys(req.body||{})}});return res.json({...getAdminSettingsView(),embedding}); }
  catch(error){return sendSettingsError(res,error);}
});
router.post('/admin/embedding/test', requireAdmin, requirePasswordChanged, async(req,res)=>{
  try { const result=await testEmbeddingConnection(req.body||null);audit(req,'settings.embedding.connection_tested',{targetType:'settings',targetId:'embedding',metadata:{latencyMs:result.latencyMs,dimensions:result.dimensions}});return res.json(result); }
  catch(error){audit(req,'settings.embedding.connection_tested',{outcome:'failure',targetType:'settings',targetId:'embedding',metadata:{reason:error.code||'AI_CONNECTION_FAILED'}});return sendSettingsError(res,error);}
});
router.get('/admin/content-domains',requireAdmin,requirePasswordChanged,(req,res)=>res.json(contentIntelligence.policies()));
router.put('/admin/content-domain',requireAdmin,requirePasswordChanged,(req,res)=>{try{const value=contentIntelligence.setPolicy(req.auth.user,req.body.hostname,req.body.allowContent===true);audit(req,'settings.ai_content_policy.updated',{targetType:'domain',targetId:value.hostname,metadata:{allowContent:Boolean(value.allowContent)}});return res.json(value);}catch(error){return sendSettingsError(res,error);}});
router.get('/admin/ai-usage',requireAdmin,requirePasswordChanged,(req,res)=>{const days=Math.min(90,Math.max(1,Number(req.query.days)||30)),since=Date.now()-days*86400000,rows=require('../db').prepare('SELECT feature,COALESCE(provider_model,\'unknown\') AS model,COUNT(*) AS calls,SUM(success) AS successes,ROUND(AVG(latency_ms)) AS averageLatencyMs,SUM(COALESCE(input_tokens,0)+COALESCE(output_tokens,0)) AS tokens FROM ai_usage_events WHERE created_at_ms>=? GROUP BY feature,provider_model ORDER BY calls DESC').all(since).map(row=>({...row,successRate:row.calls?Number((row.successes/row.calls).toFixed(3)):0}));res.json({days,rows});});

module.exports = router;
