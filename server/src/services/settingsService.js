const crypto = require('crypto');
const axios = require('axios');
const db = require('../db');

const AI_DEFAULTS = { baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini' };
const AI_SETTING_KEYS = { baseURL: 'ai_base_url', apiKey: 'ai_api_key', model: 'ai_model' };
const AI_MODELS_KEY = 'ai_models_v1';
const AI_DEFAULT_MODEL_KEY = 'ai_default_model_id';
const BRANDING_DEFAULTS = { siteName: 'NavPilot', logoUrl: '', faviconUrl: '' };
const BRANDING_KEYS = { siteName: 'site_name', logoUrl: 'site_logo_url', faviconUrl: 'site_favicon_url' };

function getSettingRow(key) { return db.prepare('SELECT value FROM settings WHERE key = ?').get(key) || null; }
function getSetting(key, fallback = null) { return getSettingRow(key)?.value ?? fallback; }
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
}
function deleteSetting(key) { db.prepare('DELETE FROM settings WHERE key=?').run(key); }
function resolveValue(key, envKey, defaultValue = '') {
  const row = getSettingRow(key);
  if (row) return { value: row.value, source: 'database' };
  if (process.env[envKey]) return { value: process.env[envKey], source: 'environment' };
  return { value: defaultValue, source: defaultValue ? 'default' : 'none' };
}
function validationError(code, message, status = 400) { return Object.assign(new Error(message), { code, status }); }
function maskApiKey(value) { return value ? `••••${value.slice(-4)}` : null; }

function validateBaseURL(value) {
  const normalized = String(value).trim();
  if (!normalized || normalized.length > 2048 || /[\u0000-\u001f\u007f]/.test(normalized)) throw validationError('INVALID_AI_BASE_URL', 'AI Base URL 必须是有效的 HTTP(S) 地址');
  let url; try { url = new URL(normalized); } catch { throw validationError('INVALID_AI_BASE_URL', 'AI Base URL 必须是有效的 HTTP(S) 地址'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw validationError('INVALID_AI_BASE_URL', 'AI Base URL 仅支持不含账号密码的 HTTP(S) 地址');
  return normalized.replace(/\/+$/, '');
}
function validateModel(value) {
  const normalized = String(value).trim();
  if (!normalized || normalized.length > 200 || /[\u0000-\u001f\u007f]/.test(normalized)) throw validationError('INVALID_AI_MODEL', 'AI 模型名称不能为空或包含控制字符');
  return normalized;
}
function validateApiKey(value) {
  const normalized = String(value).trim();
  if (!normalized || normalized.length > 4096 || /[\u0000-\u001f\u007f]/.test(normalized)) throw validationError('INVALID_AI_API_KEY', 'AI API Key 无效');
  return normalized;
}
function validateDisplayName(value, field = '名称') {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > 80 || /[\u0000-\u001f\u007f]/.test(normalized)) throw validationError('INVALID_DISPLAY_NAME', `${field}不能为空且不能超过 80 个字符`);
  return normalized;
}
function validateAssetURL(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (normalized.length > 2048 || /[\u0000-\u001f\u007f]/.test(normalized)) throw validationError('INVALID_BRANDING_URL', '图片地址无效');
  if (normalized.startsWith('/') && !normalized.startsWith('//')) return normalized;
  let url; try { url = new URL(normalized); } catch { throw validationError('INVALID_BRANDING_URL', '图片地址必须是 HTTP(S) URL 或站内绝对路径'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw validationError('INVALID_BRANDING_URL', '图片地址必须是 HTTP(S) URL 或站内绝对路径');
  return normalized;
}

function getBrandingSettings() {
  return {
    siteName: getSetting(BRANDING_KEYS.siteName, BRANDING_DEFAULTS.siteName),
    logoUrl: getSetting(BRANDING_KEYS.logoUrl, BRANDING_DEFAULTS.logoUrl),
    faviconUrl: getSetting(BRANDING_KEYS.faviconUrl, BRANDING_DEFAULTS.faviconUrl),
  };
}

function getStoredAiModels() {
  try {
    const parsed = JSON.parse(getSetting(AI_MODELS_KEY, '[]'));
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.id && item.model && item.baseURL) : [];
  } catch { return []; }
}
function saveAiModels(models) { setSetting(AI_MODELS_KEY, JSON.stringify(models)); }
function effectiveLegacyConfig() {
  const baseURL = resolveValue(AI_SETTING_KEYS.baseURL, 'AI_BASE_URL', AI_DEFAULTS.baseURL);
  const apiKey = resolveValue(AI_SETTING_KEYS.apiKey, 'AI_API_KEY');
  const model = resolveValue(AI_SETTING_KEYS.model, 'AI_MODEL', AI_DEFAULTS.model);
  return { baseURL:baseURL.value, apiKey:apiKey.value, model:model.value, sources:{baseURL:baseURL.source,apiKey:apiKey.source,model:model.source} };
}
function getEffectiveAiConfig() {
  const models = getStoredAiModels();
  if (models.length) {
    const enabled = models.filter((item) => item.enabled !== false);
    const defaultId = getSetting(AI_DEFAULT_MODEL_KEY, '');
    const selected = enabled.find((item) => item.id === defaultId) || enabled[0];
    if (!selected) return { baseURL:'', apiKey:'', model:'', modelId:null, sources:{baseURL:'database',apiKey:'database',model:'database'} };
    return { baseURL:selected.baseURL, apiKey:selected.apiKey || '', model:selected.model, modelId:selected.id, sources:{baseURL:'database',apiKey:'database',model:'database'} };
  }
  return effectiveLegacyConfig();
}
function aiModelView(item, defaultId, { managed = true, source = 'database' } = {}) {
  return { id:item.id, name:item.name, baseURL:item.baseURL, model:item.model, enabled:item.enabled !== false, isDefault:item.id === defaultId, apiKeyConfigured:Boolean(item.apiKey), maskedApiKey:maskApiKey(item.apiKey), managed, source, createdAt:item.createdAt || null, updatedAt:item.updatedAt || null };
}
function getAiModelsView() {
  const models = getStoredAiModels();
  if (models.length) {
    const enabled = models.filter((item) => item.enabled !== false);
    const configuredDefault = getSetting(AI_DEFAULT_MODEL_KEY, '');
    const defaultId = enabled.some((item) => item.id === configuredDefault) ? configuredDefault : enabled[0]?.id || '';
    return { models:models.map((item) => aiModelView(item, defaultId)), defaultId:defaultId || null };
  }
  const legacy = effectiveLegacyConfig();
  const source = legacy.sources.apiKey === 'environment' || legacy.sources.model === 'environment' ? 'environment' : legacy.sources.apiKey;
  return { models:[aiModelView({ id:'fallback-default', name:'Default', baseURL:legacy.baseURL, model:legacy.model, apiKey:legacy.apiKey, enabled:true }, 'fallback-default', { managed:false, source })], defaultId:'fallback-default' };
}

function normalizeAiModel(input, current = null) {
  const now = new Date().toISOString();
  const apiKeyProvided = Object.prototype.hasOwnProperty.call(input, 'apiKey') && String(input.apiKey || '').trim();
  return {
    id: current?.id || crypto.randomUUID(),
    name: validateDisplayName(input.name ?? current?.name, '配置名称'),
    baseURL: validateBaseURL(input.baseURL ?? current?.baseURL),
    model: validateModel(input.model ?? current?.model),
    apiKey: apiKeyProvided ? validateApiKey(input.apiKey) : (current?.apiKey || ''),
    enabled: input.enabled === undefined ? (current?.enabled !== false) : Boolean(input.enabled),
    createdAt: current?.createdAt || now,
    updatedAt: now,
  };
}
function addAiModel(input = {}) {
  const models = getStoredAiModels();
  const model = normalizeAiModel(input);
  models.push(model); saveAiModels(models);
  if (!getSetting(AI_DEFAULT_MODEL_KEY, '') && model.enabled) setSetting(AI_DEFAULT_MODEL_KEY, model.id);
  return getAdminSettingsView();
}
function updateAiModel(id, input = {}) {
  const models = getStoredAiModels(), index = models.findIndex((item) => item.id === id);
  if (index < 0) throw validationError('AI_MODEL_NOT_FOUND', '模型配置不存在', 404);
  models[index] = normalizeAiModel(input, models[index]); saveAiModels(models);
  const defaultId = getSetting(AI_DEFAULT_MODEL_KEY, '');
  if (defaultId === id && !models[index].enabled) {
    const next = models.find((item) => item.enabled && item.id !== id); if (next) setSetting(AI_DEFAULT_MODEL_KEY, next.id); else deleteSetting(AI_DEFAULT_MODEL_KEY);
  }
  return getAdminSettingsView();
}
function deleteAiModel(id) {
  const models = getStoredAiModels(), target = models.find((item) => item.id === id);
  if (!target) throw validationError('AI_MODEL_NOT_FOUND', '模型配置不存在', 404);
  const remaining = models.filter((item) => item.id !== id); saveAiModels(remaining);
  if (getSetting(AI_DEFAULT_MODEL_KEY, '') === id) {
    const next = remaining.find((item) => item.enabled); if (next) setSetting(AI_DEFAULT_MODEL_KEY, next.id); else deleteSetting(AI_DEFAULT_MODEL_KEY);
  }
  return getAdminSettingsView();
}
function setDefaultAiModel(id) {
  const target = getStoredAiModels().find((item) => item.id === id);
  if (!target) throw validationError('AI_MODEL_NOT_FOUND', '模型配置不存在', 404);
  if (!target.enabled) throw validationError('AI_MODEL_DISABLED', '禁用的模型不能设为默认模型', 409);
  setSetting(AI_DEFAULT_MODEL_KEY, id); return getAdminSettingsView();
}
async function testAiConnection(input = {}) {
  let config;
  if (input.id) {
    const target = getStoredAiModels().find((item) => item.id === input.id);
    if (!target) throw validationError('AI_MODEL_NOT_FOUND', '模型配置不存在', 404);
    config = target;
  } else config = normalizeAiModel({ ...input, name:input.name || 'Connection test' });
  if (!config.apiKey) throw validationError('INVALID_AI_API_KEY', '请先填写 API Key');
  const started = Date.now();
  try {
    const response = await axios.get(`${config.baseURL.replace(/\/$/, '')}/models`, { headers:{ Authorization:`Bearer ${config.apiKey}` }, timeout:10000, maxContentLength:1024*1024 });
    const ids = Array.isArray(response.data?.data) ? response.data.data.map((item) => item.id).filter(Boolean) : [];
    return { ok:true, latencyMs:Date.now()-started, modelFound:ids.length ? ids.includes(config.model) : null, availableModelCount:ids.length };
  } catch (error) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') throw validationError('AI_UPSTREAM_TIMEOUT', 'AI 服务连接超时', 504);
    if ([401,403].includes(error.response?.status)) throw validationError('AI_UPSTREAM_AUTH_FAILED', 'AI 服务鉴权失败，请检查 API Key', 502);
    throw validationError('AI_CONNECTION_FAILED', `AI 服务连接失败${error.response?.status ? `（HTTP ${error.response.status}）` : ''}`, 502);
  }
}

function getAdminSettingsView() {
  const config = getEffectiveAiConfig(), aiModels = getAiModelsView();
  return {
    aiPersonalEnabled:getSetting('ai_personal_enabled','false') === 'true',
    branding:getBrandingSettings(), aiModels:aiModels.models, defaultAiModelId:aiModels.defaultId,
    ai:{ baseURL:{value:config.baseURL,source:config.sources.baseURL}, model:{value:config.model,source:config.sources.model}, apiKey:{configured:Boolean(config.apiKey),source:config.sources.apiKey,maskedSuffix:maskApiKey(config.apiKey)} },
  };
}
function validateSettingsUpdate(input = {}) {
  const updates = {};
  if (Object.prototype.hasOwnProperty.call(input,'aiPersonalEnabled')) {
    if (typeof input.aiPersonalEnabled !== 'boolean') throw validationError('INVALID_AI_PERSONAL_ENABLED','个人空间 AI 开关必须是布尔值');
    updates.aiPersonalEnabled = input.aiPersonalEnabled;
  }
  if (input.branding !== undefined) {
    if (!input.branding || typeof input.branding !== 'object' || Array.isArray(input.branding)) throw validationError('INVALID_BRANDING_SETTINGS','品牌设置格式无效');
    updates.branding = {};
    if (Object.prototype.hasOwnProperty.call(input.branding,'siteName')) updates.branding.siteName = validateDisplayName(input.branding.siteName,'网站名称');
    if (Object.prototype.hasOwnProperty.call(input.branding,'logoUrl')) updates.branding.logoUrl = validateAssetURL(input.branding.logoUrl);
    if (Object.prototype.hasOwnProperty.call(input.branding,'faviconUrl')) updates.branding.faviconUrl = validateAssetURL(input.branding.faviconUrl);
  }
  const ai = input.ai;
  if (ai !== undefined) {
    if (!ai || typeof ai !== 'object' || Array.isArray(ai)) throw validationError('INVALID_AI_SETTINGS','AI 设置格式无效');
    for (const field of ['baseURL','model','apiKey']) {
      if (!Object.prototype.hasOwnProperty.call(ai,field)) continue;
      if (ai[field] === null) updates[field] = null;
      else if (typeof ai[field] !== 'string') throw validationError(`INVALID_AI_${field.toUpperCase()}`,`AI ${field} 格式无效`);
      else if (field === 'baseURL') updates.baseURL = validateBaseURL(ai[field]);
      else if (field === 'model') updates.model = validateModel(ai[field]);
      else updates.apiKey = validateApiKey(ai[field]);
    }
  }
  return updates;
}
function updateSystemSettings(input) {
  const updates = validateSettingsUpdate(input);
  db.transaction(() => {
    if (Object.prototype.hasOwnProperty.call(updates,'aiPersonalEnabled')) setSetting('ai_personal_enabled',updates.aiPersonalEnabled?'true':'false');
    if (updates.branding) for (const [field,value] of Object.entries(updates.branding)) setSetting(BRANDING_KEYS[field],value);
    for (const field of ['baseURL','model','apiKey']) if (Object.prototype.hasOwnProperty.call(updates,field)) updates[field] === null ? deleteSetting(AI_SETTING_KEYS[field]) : setSetting(AI_SETTING_KEYS[field],updates[field]);
  })();
  return getAdminSettingsView();
}

module.exports = { getSetting,setSetting,deleteSetting,getBrandingSettings,getEffectiveAiConfig,getAdminSettingsView,updateSystemSettings,validateSettingsUpdate,maskApiKey,addAiModel,updateAiModel,deleteAiModel,setDefaultAiModel,testAiConnection,validateBaseURL,validateModel,validateApiKey };
