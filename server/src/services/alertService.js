const crypto = require('crypto');
const axios = require('axios');
const nodemailer = require('nodemailer');
const db = require('../db');

function parse(value, fallback = {}) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function ownerForItem(item) {
  return item.scope === 'public'
    ? { ownerType:'space', ownerId:'public' }
    : { ownerType:'user', ownerId:String(item.owner_id) };
}

function normalizeOwner(scope, user) {
  if (scope === 'public') {
    if (user?.role !== 'admin') throw Object.assign(new Error('只有管理员可以配置公共空间告警'), { code:'ALERT_PUBLIC_ADMIN_REQUIRED', status:403 });
    return { ownerType:'space', ownerId:'public' };
  }
  if (!user?.id) throw Object.assign(new Error('请先登录'), { code:'AUTH_REQUIRED', status:401 });
  return { ownerType:'user', ownerId:String(user.id) };
}

function validateChannel(input, existing = {}) {
  const type = String(input?.type || existing.type || '');
  if (!['email','webhook'].includes(type)) throw Object.assign(new Error('告警渠道类型无效'), { code:'ALERT_CHANNEL_TYPE_INVALID', status:400 });
  const config = { ...parse(existing.config_json), ...(input?.config || {}) };
  for (const key of ['smtpPassword','password','token','secret']) if (config[key] === '••••••••') config[key] = parse(existing.config_json)[key] || '';
  if (type === 'webhook') {
    if (!/^https?:\/\//i.test(String(config.url || ''))) throw Object.assign(new Error('Webhook URL 必须是 HTTP(S) 地址'), { code:'ALERT_WEBHOOK_URL_INVALID', status:400 });
    config.url = String(config.url).trim();
    config.headers = config.headers && typeof config.headers === 'object' ? config.headers : {};
  } else {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(config.to || ''))) throw Object.assign(new Error('Email 接收地址无效'), { code:'ALERT_EMAIL_INVALID', status:400 });
    config.to = String(config.to).trim();
    config.smtpHost = String(config.smtpHost || process.env.ALERT_SMTP_HOST || '').trim();
    config.smtpPort = Number(config.smtpPort || process.env.ALERT_SMTP_PORT || 587);
    config.smtpSecure = Boolean(config.smtpSecure ?? (String(process.env.ALERT_SMTP_SECURE || 'false') === 'true'));
    config.smtpUser = String(config.smtpUser || process.env.ALERT_SMTP_USER || '').trim();
    config.smtpPassword = String(config.smtpPassword || process.env.ALERT_SMTP_PASSWORD || '');
    config.from = String(config.from || process.env.ALERT_SMTP_FROM || config.smtpUser || '').trim();
    if (!config.smtpHost || !config.from) throw Object.assign(new Error('Email 渠道缺少 SMTP 主机或发件人配置'), { code:'ALERT_SMTP_NOT_CONFIGURED', status:400 });
  }
  return { type, name:String(input?.name || existing.name || (type === 'email' ? 'Email' : 'Webhook')).trim().slice(0,80) || type, config };
}

function publicConfig(row) {
  const config = parse(row.config_json);
  const safe = { ...config };
  for (const key of ['smtpPassword','password','token','secret']) if (safe[key]) safe[key] = '••••••••';
  return { id:row.id, type:row.type, name:row.name, enabled:Boolean(row.enabled), config:safe, updatedAtMs:row.updated_at_ms };
}

function getConfig(scope, user) {
  const owner = normalizeOwner(scope, user);
  const channels = db.prepare('SELECT * FROM alert_channels WHERE owner_type=? AND owner_id=? ORDER BY created_at_ms').all(owner.ownerType, owner.ownerId).map(publicConfig);
  const policy = db.prepare('SELECT * FROM alert_policies WHERE owner_type=? AND owner_id=?').get(owner.ownerType, owner.ownerId);
  return {
    scope,
    channels,
    policy: policy ? {
      id:policy.id, failureThreshold:policy.failure_threshold, cooldownMinutes:policy.cooldown_minutes,
      notifyRecovery:Boolean(policy.notify_recovery), enabled:Boolean(policy.enabled), titleTemplate:policy.title_template || '[NavPilot] {status} · {resource}',
    } : { failureThreshold:3, cooldownMinutes:30, notifyRecovery:true, enabled:true },
  };
}

function saveConfig(scope, user, input = {}) {
  const owner = normalizeOwner(scope, user);
  const channels = Array.isArray(input.channels) ? input.channels.slice(0,10) : [];
  const now = Date.now();
  const policyInput = input.policy || {};
  const threshold = Math.min(20, Math.max(1, Number(policyInput.failureThreshold) || 3));
  const cooldown = Math.min(1440, Math.max(0, Number(policyInput.cooldownMinutes) || 30));
  const titleTemplate = String(policyInput.titleTemplate || '[NavPilot] {status} · {resource}').trim().slice(0,160) || '[NavPilot] {status} · {resource}';
  const upsert = db.transaction(() => {
    const existingRows = db.prepare('SELECT * FROM alert_channels WHERE owner_type=? AND owner_id=?').all(owner.ownerType, owner.ownerId);
    const byId = new Map(existingRows.map((row) => [row.id, row]));
    const seen = new Set();
    for (const inputChannel of channels) {
      const existing = inputChannel.id ? byId.get(String(inputChannel.id)) : null;
      const value = validateChannel(inputChannel, existing || {});
      const id = existing?.id || crypto.randomUUID();
      seen.add(id);
      db.prepare(`INSERT INTO alert_channels(id,owner_type,owner_id,type,name,config_json,enabled,created_at_ms,updated_at_ms)
        VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET type=excluded.type,name=excluded.name,config_json=excluded.config_json,enabled=excluded.enabled,updated_at_ms=excluded.updated_at_ms`)
        .run(id,owner.ownerType,owner.ownerId,value.type,value.name,JSON.stringify(value.config),inputChannel.enabled === false ? 0 : 1,existing?.created_at_ms || now,now);
    }
    for (const row of existingRows) if (!seen.has(row.id)) db.prepare('UPDATE alert_channels SET enabled=0,updated_at_ms=? WHERE id=?').run(now,row.id);
    const id = db.prepare('SELECT id FROM alert_policies WHERE owner_type=? AND owner_id=?').get(owner.ownerType,owner.ownerId)?.id || crypto.randomUUID();
    db.prepare(`INSERT INTO alert_policies(id,owner_type,owner_id,failure_threshold,cooldown_minutes,notify_recovery,title_template,enabled,created_at_ms,updated_at_ms)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_type,owner_id) DO UPDATE SET failure_threshold=excluded.failure_threshold,cooldown_minutes=excluded.cooldown_minutes,notify_recovery=excluded.notify_recovery,title_template=excluded.title_template,enabled=excluded.enabled,updated_at_ms=excluded.updated_at_ms`)
      .run(id,owner.ownerType,owner.ownerId,threshold,cooldown,policyInput.notifyRecovery === false ? 0 : 1,titleTemplate,policyInput.enabled === false ? 0 : 1,now,now);
  });
  upsert();
  return getConfig(scope, user);
}

function eventPayload(event, item, result, policy = null) {
  const recovered = event.event_type === 'recovered';
  const statusLabel = recovered ? '资源已恢复' : '资源不可用';
  const eventLabel = recovered ? 'recovered' : 'down';
  const template = policy?.title_template || '[NavPilot] {status} · {resource}';
  const subject = template.replace(/\{status\}/g, statusLabel).replace(/\{resource\}/g, String(item.name || '')).replace(/\{event\}/g, eventLabel);
  const payload = {
    event:recovered ? 'resource_recovered' : 'resource_down',
    status:result.status,
    resource:{ id:item.id, name:item.name, url:item.url },
    space:{ scope:item.scope },
    message:event.message,
    latencyMs:result.latencyMs ?? null,
    checkedAt:new Date().toISOString(),
  };
  payload.severity = payload.event === 'resource_recovered' ? 'success' : 'critical';
  payload.subject = subject;
  payload.contentType = 'text/html';
  payload.html = renderAlertHtml(payload);
  return payload;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
}

function renderAlertHtml(payload) {
  const recovered = payload.event === 'resource_recovered';
  const accent = recovered ? '#159b68' : '#d3485d';
  const surface = recovered ? '#ecfbf4' : '#fff1f3';
  const statusLabel = recovered ? '已恢复 · Recovered' : '不可用 · Down';
  const checkedAt = escapeHtml(payload.checkedAt);
  const resourceName = escapeHtml(payload.resource?.name);
  const resourceUrl = escapeHtml(payload.resource?.url);
  const message = escapeHtml(payload.message);
  const latency = payload.latencyMs == null ? '—' : `${escapeHtml(payload.latencyMs)} ms`;
  const resourceRow = resourceUrl ? `<a href="${resourceUrl}" style="color:#336fca;text-decoration:none;word-break:break-all">${resourceUrl}</a>` : '<span style="color:#748198">渠道测试，不对应具体资源</span>';
  const openButton = resourceUrl ? `<div style="margin-top:22px"><a href="${resourceUrl}" style="display:inline-block;padding:10px 15px;border-radius:8px;background:#336fca;color:#fff;text-decoration:none;font-size:12px;font-weight:600">打开资源</a></div>` : '';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(payload.subject)}</title></head><body style="margin:0;padding:0;background:#f4f7fb;color:#172033;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${message}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border:1px solid #dfe6f0;border-radius:14px;overflow:hidden;box-shadow:0 8px 28px rgba(25,45,75,.08)"><tr><td style="padding:22px 26px;background:linear-gradient(120deg,#1d293b,#314b70);color:#fff"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.75">NAVPILOT ALERT</div><div style="margin-top:7px;font-size:22px;font-weight:700">${escapeHtml(payload.subject)}</div><div style="margin-top:5px;font-size:12px;opacity:.78">${resourceName}</div></td></tr><tr><td style="padding:24px 26px"><div style="display:inline-block;padding:6px 10px;border-radius:999px;background:${surface};color:${accent};font-size:12px;font-weight:700">● ${statusLabel}</div><p style="margin:18px 0 20px;font-size:15px;line-height:1.65;color:#334155">${message}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e3e9f2;border-radius:10px;background:#f8fafc"><tr><td style="padding:13px 15px;border-bottom:1px solid #e3e9f2;color:#748198;font-size:12px">资源地址</td><td style="padding:13px 15px;border-bottom:1px solid #e3e9f2;text-align:right;font-size:12px">${resourceRow}</td></tr><tr><td style="padding:13px 15px;border-bottom:1px solid #e3e9f2;color:#748198;font-size:12px">响应时间</td><td style="padding:13px 15px;border-bottom:1px solid #e3e9f2;text-align:right;color:#172033;font-size:12px;font-weight:600">${latency}</td></tr><tr><td style="padding:13px 15px;color:#748198;font-size:12px">检测时间</td><td style="padding:13px 15px;text-align:right;color:#172033;font-size:12px">${checkedAt}</td></tr></table>${openButton}</td></tr><tr><td style="padding:15px 26px;border-top:1px solid #e3e9f2;color:#8a96a8;font-size:11px">此通知由 NavPilot 可用性监控发送。请勿直接回复此邮件。</td></tr></table></td></tr></table></body></html>`;
}

async function deliver(channel, payload) {
  const config = parse(channel.config_json);
  try {
    if (channel.type === 'webhook') {
      await axios.post(config.url, payload, { timeout:10000, headers:{ 'Content-Type':'application/json', ...(config.headers || {}) } });
      return;
    }
    const transporter = nodemailer.createTransport({ host:config.smtpHost, port:Number(config.smtpPort || 587), secure:Boolean(config.smtpSecure), auth:config.smtpUser ? { user:config.smtpUser, pass:config.smtpPassword } : undefined, connectionTimeout:10000, greetingTimeout:10000, socketTimeout:10000 });
    try {
      await transporter.sendMail({ from:config.from, to:config.to, subject:payload.subject, text:`${payload.message}\n${payload.resource.name}\n${payload.resource.url}\n状态：${payload.status}\n时间：${payload.checkedAt}`, html:payload.html });
    } finally { transporter.close(); }
  } catch (error) {
    const code = error.code || '';
    let message = '告警发送失败，请检查渠道配置';
    if (code === 'ETIMEDOUT' || code === 'ECONNABORTED' || code === 'ESOCKET') message = channel.type === 'email' ? 'SMTP 连接超时，请检查主机、端口和网络；465 端口通常需要开启 SSL/TLS' : 'Webhook 请求超时，请检查地址和网络';
    else if (code === 'ECONNREFUSED' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') message = '无法连接告警服务，请检查地址、端口和网络';
    else if (code === 'EAUTH' || error.responseCode === 535) message = 'SMTP 认证失败，请检查用户名和密码';
    else if (error.response?.status) message = `Webhook 返回 HTTP ${error.response.status}`;
    else if (error.message && /certificate|tls|ssl/i.test(error.message)) message = 'TLS/SSL 握手失败，请检查 SSL/TLS 开关和端口';
    throw Object.assign(new Error(message), { code:'ALERT_DELIVERY_FAILED', status:502, causeCode:code });
  }
}

async function dispatch(event, item, result, channels, policy) {
  const payload = eventPayload(event, item, result, policy);
  for (const channel of channels.filter((row) => row.enabled)) {
    try {
      await deliver(channel, payload);
      db.prepare('INSERT INTO alert_deliveries(id,event_id,channel_id,status,attempted_at_ms) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),event.id,channel.id,'sent',Date.now());
    } catch (error) {
      db.prepare('INSERT INTO alert_deliveries(id,event_id,channel_id,status,error,attempted_at_ms) VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),event.id,channel.id,'failed',String(error.message || error).slice(0,500),Date.now());
    }
  }
}

async function processCheckAlert(item, result) {
  const owner = ownerForItem(item);
  const policy = db.prepare('SELECT * FROM alert_policies WHERE owner_type=? AND owner_id=? AND enabled=1').get(owner.ownerType,owner.ownerId);
  if (!policy || !item.check_enabled || item.check_method === 'none') return;
  const channels = db.prepare('SELECT * FROM alert_channels WHERE owner_type=? AND owner_id=? AND enabled=1').all(owner.ownerType,owner.ownerId);
  const now = Date.now();
  let event = null;
  if (result.status === 'offline') {
    const count = Number(item.alert_failure_count || 0) + 1;
    const active = Boolean(item.alert_active);
    const cooldownMs = Number(policy.cooldown_minutes || 0) * 60000;
    const canRepeat = !active || !item.alert_last_triggered_at_ms || now - Number(item.alert_last_triggered_at_ms) >= cooldownMs;
    db.prepare('UPDATE items SET alert_failure_count=?,alert_active=?,alert_last_triggered_at_ms=? WHERE id=?').run(count,active && !canRepeat ? 1 : (count >= policy.failure_threshold ? 1 : 0),active && !canRepeat ? item.alert_last_triggered_at_ms : (count >= policy.failure_threshold ? now : null),item.id);
    if (count >= policy.failure_threshold && canRepeat) {
      event = { id:crypto.randomUUID(), event_type:'down', message:`连续 ${count} 次探测失败` };
      db.prepare('INSERT INTO alert_events(id,owner_type,owner_id,item_id,event_type,status,message,created_at_ms) VALUES(?,?,?,?,?,?,?,?)').run(event.id,owner.ownerType,owner.ownerId,item.id,event.event_type,result.status,event.message,now);
    }
  } else if (result.status === 'online') {
    if (item.alert_active && policy.notify_recovery) {
      event = { id:crypto.randomUUID(), event_type:'recovered', message:'资源已恢复正常' };
      db.prepare('INSERT INTO alert_events(id,owner_type,owner_id,item_id,event_type,status,message,created_at_ms) VALUES(?,?,?,?,?,?,?,?)').run(event.id,owner.ownerType,owner.ownerId,item.id,event.event_type,result.status,event.message,now);
      db.prepare('UPDATE alert_events SET resolved_at_ms=? WHERE item_id=? AND owner_type=? AND owner_id=? AND event_type="down" AND resolved_at_ms IS NULL').run(now,item.id,owner.ownerType,owner.ownerId);
    }
    db.prepare('UPDATE items SET alert_failure_count=0,alert_active=0,alert_last_triggered_at_ms=NULL WHERE id=?').run(item.id);
  }
  if (event) await dispatch(event,item,result,channels,policy);
}

async function testChannel(scope, user, channelId) {
  const owner = normalizeOwner(scope, user);
  const channel = db.prepare('SELECT * FROM alert_channels WHERE id=? AND owner_type=? AND owner_id=?').get(channelId,owner.ownerType,owner.ownerId);
  if (!channel) throw Object.assign(new Error('告警渠道不存在'), { code:'ALERT_CHANNEL_NOT_FOUND', status:404 });
  const policy = db.prepare('SELECT * FROM alert_policies WHERE owner_type=? AND owner_id=?').get(owner.ownerType,owner.ownerId);
  const template = policy?.title_template || '[NavPilot] 渠道测试';
  const payload = { event:'resource_recovered', status:'online', resource:{id:0,name:'渠道测试',url:''}, space:{scope}, message:'这是一条渠道测试通知，不对应任何具体资源。', latencyMs:1, checkedAt:new Date().toISOString() };
  payload.severity = 'success'; payload.subject = template.replace(/\{status\}/g,'渠道测试').replace(/\{resource\}/g,'渠道测试').replace(/\{event\}/g,'test'); payload.contentType = 'text/html'; payload.html = renderAlertHtml(payload);
  await deliver(channel,payload);
  return { ok:true };
}

function listEvents(scope, user, limit = 50) {
  const owner = normalizeOwner(scope,user);
  return db.prepare(`SELECT e.id,e.item_id itemId,i.name itemName,i.url,e.event_type eventType,e.status,e.message,e.created_at_ms createdAtMs,e.resolved_at_ms resolvedAtMs,
    (SELECT COUNT(*) FROM alert_deliveries d WHERE d.event_id=e.id AND d.status='sent') deliveredCount,
    (SELECT COUNT(*) FROM alert_deliveries d WHERE d.event_id=e.id AND d.status='failed') failedCount
    FROM alert_events e LEFT JOIN items i ON i.id=e.item_id WHERE e.owner_type=? AND e.owner_id=? ORDER BY e.created_at_ms DESC LIMIT ?`).all(owner.ownerType,owner.ownerId,Math.min(200,Math.max(1,Number(limit)||50)));
}

module.exports = { getConfig, saveConfig, testChannel, listEvents, processCheckAlert };
