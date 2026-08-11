const fs = require('fs');
const net = require('net');
const maxmind = require('maxmind');
const proxyaddr = require('proxy-addr');

let trustProxy = () => false;
let trustedEntries = [];
let geoReader = null;
let geoState = { configured:false, loaded:false, error:null };

function normalizeAddress(value = '') {
  const raw = String(value || '').trim().replace(/^::ffff:/, '');
  return net.isIP(raw) ? raw : null;
}

function parseList(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function configureTrustedProxy(value = process.env.NAVPILOT_TRUST_PROXY || '') {
  trustedEntries = parseList(value);
  if (!trustedEntries.length) {
    trustProxy = () => false;
    return trustProxy;
  }
  if (trustedEntries.some((entry) => ['true','all','*'].includes(entry.toLowerCase())))
    throw Object.assign(new Error('NAVPILOT_TRUST_PROXY 必须使用明确的代理 IP、CIDR 或 loopback/linklocal/uniquelocal，不能信任全部来源'),{code:'INVALID_TRUST_PROXY'});
  trustProxy = proxyaddr.compile(trustedEntries);
  return trustProxy;
}

function configureAppProxy(app, value = process.env.NAVPILOT_TRUST_PROXY || '') {
  const trust = configureTrustedProxy(value);
  app.set('trust proxy', trust);
  return getGeoStatus();
}

function headerNames() {
  const configured = parseList(process.env.NAVPILOT_GEOIP_HEADERS);
  return (configured.length ? configured : ['cf-ipcountry','x-country-code','x-vercel-ip-country'])
    .map((value) => value.toLowerCase())
    .filter((value) => /^[a-z0-9-]{1,80}$/.test(value));
}

function immediatePeer(req) {
  return normalizeAddress(req?.socket?.remoteAddress || req?.connection?.remoteAddress || '');
}

function countryFromTrustedHeader(req) {
  const peer = immediatePeer(req);
  if (!peer || !trustedEntries.length || !trustProxy(peer)) return null;
  for (const name of headerNames()) {
    const value = String(req?.header?.(name) || '').trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(value) && !['XX'].includes(value)) return value;
  }
  return null;
}

function countryFromDatabase(ip) {
  if (!geoReader || !ip) return null;
  try {
    const record = geoReader.get(ip);
    const value = String(record?.country?.iso_code || record?.registered_country?.iso_code || '').toUpperCase();
    return /^[A-Z]{2}$/.test(value) ? value : null;
  } catch { return null; }
}

function getCountryInfo(req) {
  const fromHeader = countryFromTrustedHeader(req);
  if (fromHeader) return { country:fromHeader, source:'proxy_header' };
  const ip = normalizeAddress(req?.ip || immediatePeer(req));
  const fromDatabase = countryFromDatabase(ip);
  return fromDatabase ? { country:fromDatabase, source:'geoip_database' } : { country:null, source:null };
}

async function initializeGeoIp(filepath = process.env.NAVPILOT_GEOIP_DB_PATH || '') {
  geoReader = null;
  const path = String(filepath || '').trim();
  geoState = { configured:Boolean(path), loaded:false, error:null };
  if (!path) return getGeoStatus();
  if (!fs.existsSync(path)) {
    geoState.error = 'database_not_found';
    console.warn(`[geoip] 数据库不存在，已降级为可信代理国家头: ${path}`);
    return getGeoStatus();
  }
  try {
    geoReader = await maxmind.open(path, {
      watchForUpdates:true,
      watchForUpdatesNonPersistent:true,
      watchForUpdatesHook:() => console.log('[geoip] GeoIP 数据库已热更新'),
    });
    geoState.loaded = true;
    console.log('[geoip] GeoIP 国家数据库已加载');
  } catch (error) {
    geoState.error = 'database_invalid';
    console.warn(`[geoip] 数据库加载失败，已降级为可信代理国家头: ${error.message}`);
  }
  return getGeoStatus();
}

function getGeoStatus() {
  return {
    trustedProxyConfigured:trustedEntries.length > 0,
    trustedProxyEntries:trustedEntries.length,
    geoIpDatabaseConfigured:geoState.configured,
    geoIpDatabaseLoaded:geoState.loaded,
    geoIpError:geoState.error,
    countryHeaders:headerNames(),
  };
}

function setGeoReaderForTest(reader) { geoReader = reader;geoState = {configured:Boolean(reader),loaded:Boolean(reader),error:null}; }

module.exports = { configureTrustedProxy,configureAppProxy,initializeGeoIp,getCountryInfo,getGeoStatus,normalizeAddress,setGeoReaderForTest };
