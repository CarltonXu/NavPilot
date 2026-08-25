const axios = require('axios');
const net = require('net');
const { URL } = require('url');
const db = require('../db');
const { processCheckAlert } = require('./alertService');

const TIMEOUT_MS = parseInt(process.env.CHECK_TIMEOUT_MS || '5000', 10);

/**
 * 通过 HTTP(S) 请求探测目标是否可访问，返回 { status, latencyMs }
 */
async function checkHttp(target) {
  const start = Date.now();
  try {
    // 优先 HEAD，部分站点不支持 HEAD 则回退 GET
    let resp;
    try {
      resp = await axios.head(target, { timeout: TIMEOUT_MS, validateStatus: () => true, maxRedirects: 5 });
    } catch (e) {
      resp = await axios.get(target, { timeout: TIMEOUT_MS, validateStatus: () => true, maxRedirects: 5 });
    }
    const latencyMs = Date.now() - start;
    // 2xx-4xx 均认为服务在线(4xx 说明服务器有响应，只是路径/权限问题)；5xx 或网络异常记为离线
    const online = resp.status >= 200 && resp.status < 500;
    return { status: online ? 'online' : 'offline', latencyMs };
  } catch (err) {
    return { status: 'offline', latencyMs: null };
  }
}

/**
 * 通过 TCP 端口连通性探测，target 形如 host:port
 */
function checkTcp(target) {
  return new Promise((resolve) => {
    const [host, portStr] = target.split(':');
    const port = parseInt(portStr, 10) || 80;
    const start = Date.now();
    const socket = new net.Socket();
    let done = false;

    const finish = (status) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ status, latencyMs: status === 'online' ? Date.now() - start : null });
    };

    socket.setTimeout(TIMEOUT_MS);
    socket.once('connect', () => finish('online'));
    socket.once('timeout', () => finish('offline'));
    socket.once('error', () => finish('offline'));
    socket.connect(port, host);
  });
}

function resolveTarget(item) {
  if (item.check_target && item.check_target.trim()) return item.check_target.trim();
  return item.url;
}

async function checkItem(item, { force = false } = {}) {
  if (!force && (item.check_method === 'none' || !item.check_enabled)) {
    return { status: 'unknown', latencyMs: null };
  }
  const target = resolveTarget(item);
  let result;
  if (item.check_method === 'tcp') {
    result = await checkTcp(target);
  } else {
    // http 默认，若 target 不含协议则补全
    const httpTarget = /^https?:\/\//i.test(target) ? target : `http://${target}`;
    result = await checkHttp(httpTarget);
  }
  return result;
}

async function checkAndPersist(item, options = {}) {
  const result = await checkItem(item, options);
  db.transaction(() => {
    db.prepare(`UPDATE items SET status = ?, latency_ms = ?, last_checked_at = datetime('now') WHERE id = ?`).run(result.status, result.latencyMs, item.id);
    db.prepare(`INSERT INTO resource_health_events(item_id,item_name,scope,owner_id,status,latency_ms,checked_at_ms) VALUES(?,?,?,?,?,?,?)`).run(item.id,item.name,item.scope,item.owner_id||null,result.status,result.latencyMs,Date.now());
  })();
  await processCheckAlert(item, result);
  return result;
}

async function checkItems({ scope = null, ownerId = undefined, force = false } = {}) {
  let items;
  if (scope && ownerId === undefined) items = db.prepare(`SELECT * FROM items WHERE ${force ? '1=1' : 'check_enabled=1'} AND scope=?`).all(scope);
  else if (scope) items = db.prepare(`SELECT * FROM items WHERE ${force ? '1=1' : 'check_enabled=1'} AND scope=? AND owner_id IS ?`).all(scope, ownerId);
  else items = db.prepare('SELECT * FROM items WHERE check_enabled=1').all();
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try { results[index] = await checkAndPersist(items[index], { force }); }
      catch { results[index] = { status:'unknown', latencyMs:null }; }
    }
  }
  const concurrency = Math.min(Math.max(1, Number(process.env.CHECK_CONCURRENCY) || 16), items.length || 1);
  await Promise.all(Array.from({ length: concurrency }, worker));
  const counts = { online:0, offline:0, unknown:0 };
  results.forEach((result) => { counts[result?.status] = (counts[result?.status] || 0) + 1; });
  return { total: items.length, done: results.length, ...counts };
}

async function checkAllItems() {
  return checkItems();
}

module.exports = { checkItem, checkAndPersist, checkItems, checkAllItems };
