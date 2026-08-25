const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const {
  normalizeRequestedUrl,
  resolvePublicAddresses,
} = require('./urlMetadataService');
const { getUploadRoot } = require('./uploadService');

const MAX_ICON_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;
const SERVER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
function isSafeSvg(buffer) {
  const source = buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
  if (!/^(?:<\?xml[^>]*>\s*)?<svg\b/i.test(source)) return false;
  return !(
    /<!doctype|<!entity|<script\b|<foreignObject\b|<iframe\b|<object\b|<embed\b|<image\b/i.test(source) ||
    /\son[a-z]+\s*=/i.test(source) ||
    /(?:href|xlink:href)\s*=\s*["']\s*(?!#)/i.test(source) ||
    /url\(\s*["']?\s*(?!#)/i.test(source)
  );
}
const TYPES = [
  { extension: 'png', type: 'image/png', matches: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) },
  { extension: 'jpg', type: 'image/jpeg', matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { extension: 'webp', type: 'image/webp', matches: (b) => b.length >= 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  { extension: 'gif', type: 'image/gif', matches: (b) => b.length >= 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString()) },
  { extension: 'ico', type: 'image/x-icon', matches: (b) => b.length >= 4 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0 },
  { extension: 'svg', type: 'image/svg+xml', matches: isSafeSvg },
];

function iconError(code, message, status = 422) {
  return Object.assign(new Error(message), { code, status });
}

function pinnedLookup(record) {
  return (_hostname, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (options?.all) return queueMicrotask(() => callback(null, [record]));
    return queueMicrotask(() => callback(null, record.address, record.family));
  };
}

function detectType(buffer) {
  return TYPES.find((candidate) => candidate.matches(buffer)) || null;
}

function createIconCacheService({ request = axios, lookup, cacheRoot } = {}) {
  // Keep proxy files below a dot-directory so the public /uploads mount cannot
  // bypass item visibility checks. Icons are served only by the guarded route.
  const root = cacheRoot || path.join(getUploadRoot(), '.remote-icons');
  const pending = new Map();

  function candidates(digest) {
    try {
      return fs.readdirSync(root)
        .filter((name) => name.startsWith(`${digest}.`))
        .map((name) => {
          const filePath = path.join(root, name);
          const type = TYPES.find((candidate) => name.endsWith(`.${candidate.extension}`));
          return type ? { path: filePath, ...type, stat: fs.statSync(filePath) } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    } catch {
      return [];
    }
  }

  async function download(source) {
    let current = normalizeRequestedUrl(source);
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      const records = await resolvePublicAddresses(current.hostname, lookup);
      const record = records.find((value) => Number(value.family) === 4) || records[0];
      const options = {
        keepAlive: false,
        lookup: pinnedLookup(record),
        family: Number(record.family),
        autoSelectFamily: false,
      };
      const httpAgent = new http.Agent(options);
      const httpsAgent = new https.Agent(options);
      let response;
      try {
        response = await request.get(current.href, {
          timeout: REQUEST_TIMEOUT_MS,
          maxRedirects: 0,
          maxContentLength: MAX_ICON_BYTES,
          maxBodyLength: MAX_ICON_BYTES,
          responseType: 'arraybuffer',
          validateStatus: () => true,
          proxy: false,
          httpAgent,
          httpsAgent,
          headers: {
            Accept: 'image/png,image/jpeg,image/webp,image/gif,image/x-icon,image/svg+xml,*/*;q=0.1',
            'User-Agent': 'NavPilot-IconCache/1.0',
          },
        });
      } catch (error) {
        throw iconError(
          'ICON_FETCH_FAILED',
          error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
            ? '图标请求超时'
            : '图标暂时无法获取',
          502,
        );
      } finally {
        httpAgent.destroy();
        httpsAgent.destroy();
      }
      if (response.status >= 300 && response.status < 400 && response.headers.location) {
        if (redirect === MAX_REDIRECTS)
          throw iconError('ICON_REDIRECT_LIMIT', '图标重定向次数过多', 502);
        current = normalizeRequestedUrl(new URL(response.headers.location, current).href);
        continue;
      }
      if (response.status < 200 || response.status >= 300)
        throw iconError('ICON_FETCH_FAILED', `图标服务返回 HTTP ${response.status}`, 502);
      const buffer = Buffer.from(response.data);
      if (!buffer.length || buffer.length > MAX_ICON_BYTES)
        throw iconError('ICON_TOO_LARGE', '图标文件过大');
      const detected = detectType(buffer);
      if (!detected)
        throw iconError('ICON_TYPE_UNSUPPORTED', '图标格式不受支持');
      return { buffer, ...detected };
    }
    throw iconError('ICON_REDIRECT_LIMIT', '图标重定向次数过多', 502);
  }

  async function resolve(source) {
    const normalized = normalizeRequestedUrl(source).href;
    const digest = crypto.createHash('sha256').update(normalized).digest('hex');
    const existing = candidates(digest)[0];
    if (existing && Date.now() - existing.stat.mtimeMs < SERVER_CACHE_TTL_MS)
      return existing;
    if (pending.has(digest)) return pending.get(digest);
    const operation = (async () => {
      try {
        const downloaded = await download(normalized);
        fs.mkdirSync(root, { recursive: true, mode: 0o750 });
        const destination = path.join(root, `${digest}.${downloaded.extension}`);
        const temporary = path.join(root, `.${digest}.${crypto.randomUUID()}.tmp`);
        fs.writeFileSync(temporary, downloaded.buffer, { mode: 0o640, flag: 'wx' });
        fs.renameSync(temporary, destination);
        return { path: destination, ...downloaded, stat: fs.statSync(destination) };
      } catch (error) {
        if (existing) return existing;
        throw error;
      } finally {
        pending.delete(digest);
      }
    })();
    pending.set(digest, operation);
    return operation;
  }

  return { resolve };
}

module.exports = {
  createIconCacheService,
  detectType,
  MAX_ICON_BYTES,
  SERVER_CACHE_TTL_MS,
};
