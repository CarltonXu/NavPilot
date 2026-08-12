const fs = require('fs');
const net = require('net');
const maxmind = require('maxmind');
const proxyaddr = require('proxy-addr');

let trustProxy = () => false;
let trustedEntries = [];
let countryReader = null;
let cityReader = null;
let geoState = {
  country:{ configured:false, loaded:false, error:null },
  city:{ configured:false, loaded:false, error:null },
};

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
  if (!countryReader || !ip) return null;
  try {
    const record = countryReader.get(ip);
    const value = String(record?.country?.iso_code || record?.registered_country?.iso_code || '').toUpperCase();
    return /^[A-Z]{2}$/.test(value) ? value : null;
  } catch { return null; }
}

function cityFromDatabase(ip) {
  if (!cityReader || !ip) return null;
  try {
    const record = cityReader.get(ip);
    const raw = typeof record?.city === 'string'
      ? record.city
      : record?.city?.names?.['zh-CN'] || record?.city?.names?.en || record?.city?.name || '';
    const value = String(raw || '').trim();
    return value && value.length <= 100 ? value : null;
  } catch { return null; }
}

function getGeoInfo(req) {
  const fromHeader = countryFromTrustedHeader(req);
  const ip = normalizeAddress(req?.ip || immediatePeer(req));
  const fromDatabase = countryFromDatabase(ip);
  const city = cityFromDatabase(ip);
  return {
    country:fromHeader || fromDatabase || null,
    source:fromHeader ? 'proxy_header' : fromDatabase ? 'geoip_database' : null,
    city,
    citySource:city ? 'city_database' : null,
  };
}

function getCountryInfo(req) { return getGeoInfo(req); }

async function openDatabase(filepath, kind) {
  const path = String(filepath || '').trim();
  const state = { configured:Boolean(path), loaded:false, error:null };
  if (!path) return { reader:null, state };
  if (!fs.existsSync(path)) {
    state.error = 'database_not_found';
    console.warn(`[geoip] ${kind} 数据库不存在: ${path}`);
    return { reader:null, state };
  }
  try {
    const reader = await maxmind.open(path, {
      watchForUpdates:true,
      watchForUpdatesNonPersistent:true,
      watchForUpdatesHook:() => console.log(`[geoip] ${kind} 数据库已热更新`),
    });
    state.loaded = true;
    console.log(`[geoip] ${kind} 数据库已加载`);
    return { reader, state };
  } catch (error) {
    state.error = 'database_invalid';
    console.warn(`[geoip] ${kind} 数据库加载失败: ${error.message}`);
    return { reader:null, state };
  }
}

async function initializeGeoIp(
  countryPath = process.env.NAVPILOT_GEOIP_DB_PATH || '',
  cityPath = process.env.NAVPILOT_GEOIP_CITY_DB_PATH || '',
) {
  countryReader = null;
  cityReader = null;
  const [country, city] = await Promise.all([
    openDatabase(countryPath, '国家'),
    openDatabase(cityPath, '城市'),
  ]);
  countryReader = country.reader;
  cityReader = city.reader;
  geoState = { country:country.state, city:city.state };
  return getGeoStatus();
}

function getGeoStatus() {
  return {
    trustedProxyConfigured:trustedEntries.length > 0,
    trustedProxyEntries:trustedEntries.length,
    geoIpDatabaseConfigured:geoState.country.configured,
    geoIpDatabaseLoaded:geoState.country.loaded,
    geoIpError:geoState.country.error,
    cityDatabaseConfigured:geoState.city.configured,
    cityDatabaseLoaded:geoState.city.loaded,
    cityDatabaseError:geoState.city.error,
    countryHeaders:headerNames(),
  };
}

function setGeoReaderForTest(reader) {
  countryReader = reader;
  geoState.country = {configured:Boolean(reader),loaded:Boolean(reader),error:null};
}
function setCityReaderForTest(reader) {
  cityReader = reader;
  geoState.city = {configured:Boolean(reader),loaded:Boolean(reader),error:null};
}

module.exports = { configureTrustedProxy,configureAppProxy,initializeGeoIp,getCountryInfo,getGeoInfo,getGeoStatus,normalizeAddress,setGeoReaderForTest,setCityReaderForTest };
