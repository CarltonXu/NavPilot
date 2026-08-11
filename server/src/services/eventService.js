const crypto = require('crypto');
const net = require('net');
const db = require('../db');
const { getCountryInfo } = require('./proxyGeoService');

function ipPrefix(value = '') {
  const raw = String(value).replace(/^::ffff:/, '');
  if (net.isIP(raw) === 4) { const parts = raw.split('.'); return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`; }
  if (net.isIP(raw) === 6) {
    if (raw === '::1') return '::1/128';
    const sections = raw.split(':');
    const prefix = sections.slice(0, 3).map((part) => part || '0').join(':');
    return `${prefix}::/48`;
  }
  return null;
}
function clientInfo(req) {
  const ua = String(req?.header?.('user-agent') || '');
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Other';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS|Macintosh/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const device = /iPad|Tablet/.test(ua) ? 'tablet' : /Mobile|Android|iPhone/.test(ua) ? 'mobile' : 'desktop';
  const geo = getCountryInfo(req);
  return { ipPrefix: ipPrefix(req?.ip), country:geo.country, countrySource:geo.source, browser, os, device };
}
function safeValue(value, blocked, depth = 0) {
  if (depth > 3) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => safeValue(item, blocked, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !blocked.test(key)).slice(0, 30).map(([key,item]) => [key, safeValue(item, blocked, depth + 1)]));
  return typeof value === 'string' ? value.slice(0, 500) : value;
}
function safeMetadata(value = {}) {
  const blocked = /password|hash|salt|token|cookie|secret|api.?key|prompt|query/i;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !blocked.test(key)).slice(0,20).map(([key,val]) => [key, safeValue(val, blocked)]));
}
function writeAudit(targetDb, req, eventType, { outcome = 'success', targetType = null, targetId = null, metadata = {} } = {}) {
  const client = clientInfo(req); const actor = req?.auth?.user;
  targetDb.prepare(`INSERT INTO security_audit_events(id,occurred_at_ms,event_type,outcome,actor_user_id,actor_username,actor_role,target_type,target_id,ip_prefix,browser_family,os_family,device_class,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),Date.now(),eventType,outcome,actor?.id||null,actor?.username||null,actor?.role||null,targetType,targetId===null?null:String(targetId),client.ipPrefix,client.browser,client.os,client.device,JSON.stringify(safeMetadata(metadata)));
}
function audit(req, eventType, options = {}) { writeAudit(db, req, eventType, options); }
function auditWith(targetDb, req, eventType, options = {}) { writeAudit(targetDb, req, eventType, options); }
function analytics(req, eventName, { itemId = null, categoryId = null, scope = null, surface = null, viewMode = null, resource = null, properties = {}, eventId = null } = {}) {
  const client = clientInfo(req); const id = eventId && /^[a-zA-Z0-9_-]{8,100}$/.test(eventId) ? eventId : crypto.randomUUID();
  try { db.prepare(`INSERT INTO analytics_events(id,occurred_at_ms,event_name,user_id,item_id,category_id,scope,surface,view_mode,browser_family,os_family,device_class,ip_prefix,country_code,country_source,item_name,item_url,item_description,item_icon,item_owner_id,properties_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,Date.now(),eventName,req?.auth?.user?.id||null,itemId,categoryId,scope,surface,viewMode,client.browser,client.os,client.device,client.ipPrefix,client.country,client.countrySource,resource?.name||null,resource?.url||null,resource?.description||null,resource?.icon||null,resource?.owner_id||null,JSON.stringify(safeMetadata(properties))); return true; } catch (error) { if (String(error.code).includes('CONSTRAINT')) return false; throw error; }
}
module.exports = { audit, auditWith, analytics, clientInfo, ipPrefix, safeMetadata };
