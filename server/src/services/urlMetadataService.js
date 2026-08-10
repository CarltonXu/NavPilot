const axios = require("axios");
const dns = require("dns");
const http = require("http");
const https = require("https");
const net = require("net");

const MAX_HTML_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 6000;

function metadataError(code, message, status = 422) {
  return Object.assign(new Error(message), { code, status });
}

function normalizeRequestedUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) throw metadataError("URL_REQUIRED", "请输入需要识别的网站链接", 400);
  let parsed;
  try {
    parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw metadataError("INVALID_ITEM_URL", "链接格式无效", 400);
  }
  if (!["http:", "https:"].includes(parsed.protocol))
    throw metadataError("INVALID_ITEM_URL", "只支持 HTTP(S) 链接", 400);
  if (parsed.username || parsed.password)
    throw metadataError("URL_CREDENTIALS_FORBIDDEN", "链接中不能包含账号密码", 400);
  return parsed;
}

function isPublicAddress(address) {
  const normalized = String(address || "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .split("%")[0];
  const version = net.isIP(normalized);
  if (version === 4) {
    const parts = normalized.split(".").map(Number);
    const [a, b] = parts;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (version === 6) {
    if (normalized.startsWith("::ffff:")) {
      const mapped = normalized.slice(7);
      if (net.isIP(mapped) === 4) return isPublicAddress(mapped);
      const groups = mapped.split(":");
      if (groups.length === 2) {
        const high = Number.parseInt(groups[0], 16),
          low = Number.parseInt(groups[1], 16);
        if (Number.isFinite(high) && Number.isFinite(low))
          return isPublicAddress(
            `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`,
          );
      }
      return false;
    }
    return !(
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized)
    );
  }
  return false;
}

async function resolvePublicAddresses(
  hostname,
  lookup = dns.promises.lookup,
  allowPrivate = false,
) {
  const target = String(hostname).replace(/^\[|\]$/g, "");
  const literalVersion = net.isIP(target);
  let records;
  try {
    records = literalVersion
      ? [{ address: target, family: literalVersion }]
      : await lookup(target, { all: true, verbatim: true });
  } catch {
    throw metadataError(
      "URL_METADATA_UNAVAILABLE",
      "无法解析该网站地址，请检查链接是否正确",
    );
  }
  if (
    !records.length ||
    !allowPrivate && records.some((record) => !isPublicAddress(record.address))
  )
    throw metadataError(
      "URL_PRIVATE_ADDRESS_FORBIDDEN",
      "出于安全限制，不能识别本机或内网地址",
      400,
    );
  return records;
}

function pinnedLookup(records) {
  // Node 20+ may enable autoSelectFamily and ask custom lookups for every
  // address.  Returning a mixed IPv4/IPv6 set caused losing connection
  // attempts to emit a late, unhandled TLSSocket error after Axios had
  // already rejected the request. Pin one verified address instead, with
  // IPv4 preferred because many private deployments do not route IPv6.
  const record = records.find((value) => Number(value.family) === 4) || records[0];
  return (_hostname, options, callback) => {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    if (options?.all) return callback(null, [record]);
    return callback(null, record.address, record.family);
  };
}

function decodeEntities(value) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return String(value || "").replace(
    /&(#x[\da-f]+|#\d+|[a-z]+);/gi,
    (match, entity) => {
      if (entity[0] === "#") {
        const hex = entity[1]?.toLowerCase() === "x";
        const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return named[entity.toLowerCase()] ?? match;
    },
  );
}

function cleanText(value, max) {
  return decodeEntities(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function attributes(tag) {
  const result = {};
  const expression = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = expression.exec(tag)))
    result[match[1].toLowerCase()] = decodeEntities(
      match[2] ?? match[3] ?? match[4] ?? "",
    );
  return result;
}

function extractMetadata(html, pageUrl) {
  const source = String(html || "");
  const meta = [...source.matchAll(/<meta\b[^>]*>/gi)].map((match) =>
    attributes(match[0]),
  );
  const links = [...source.matchAll(/<link\b[^>]*>/gi)].map((match) =>
    attributes(match[0]),
  );
  const metaContent = (...keys) => {
    const wanted = new Set(keys.map((key) => key.toLowerCase()));
    return meta.find((row) =>
      wanted.has(String(row.name || row.property || "").toLowerCase()),
    )?.content;
  };
  const titleTag = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = cleanText(
    metaContent("og:title", "twitter:title", "application-name") || titleTag,
    120,
  );
  const description = cleanText(
    metaContent("description", "og:description", "twitter:description"),
    500,
  );
  const iconHref = links.find((row) =>
    String(row.rel || "")
      .toLowerCase()
      .split(/\s+/)
      .some((value) => value === "icon" || value === "apple-touch-icon"),
  )?.href;
  let icon = "";
  try {
    const resolvedIcon = new URL(iconHref || "/favicon.ico", pageUrl);
    icon = ["http:", "https:"].includes(resolvedIcon.protocol)
      ? resolvedIcon.href.slice(0, 500)
      : new URL("/favicon.ico", pageUrl).href.slice(0, 500);
  } catch {
    /* use default resource icon */
  }
  const parsed = new URL(pageUrl);
  return {
    name: title || parsed.hostname.replace(/^www\./i, ""),
    description,
    icon,
  };
}

function createUrlMetadataService({
  request = axios,
  lookup = dns.promises.lookup,
} = {}) {
  async function fetchPage(value, { allowPrivate = false } = {}) {
    const requested = normalizeRequestedUrl(value);
    let current = requested;
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      const records = await resolvePublicAddresses(
        current.hostname,
        lookup,
        allowPrivate,
      );
      const pinnedRecord =
        records.find((value) => Number(value.family) === 4) || records[0];
      const agentOptions = {
        keepAlive: false,
        lookup: pinnedLookup([pinnedRecord]),
        family: Number(pinnedRecord.family),
        autoSelectFamily: false,
      };
      let response;
      try {
        response = await request.get(current.href, {
          timeout: REQUEST_TIMEOUT_MS,
          maxRedirects: 0,
          maxContentLength: MAX_HTML_BYTES,
          maxBodyLength: MAX_HTML_BYTES,
          responseType: "text",
          validateStatus: () => true,
          proxy: false,
          httpAgent: new http.Agent(agentOptions),
          httpsAgent: new https.Agent(agentOptions),
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "User-Agent": "NavPilot-Metadata/1.0",
          },
        });
      } catch (error) {
        throw metadataError(
          "URL_METADATA_UNAVAILABLE",
          error.code === "ECONNABORTED"
            ? "网站响应超时，暂时无法自动识别"
            : "网站无法访问或拒绝了信息识别",
        );
      }
      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.headers.location
      ) {
        if (redirect === MAX_REDIRECTS)
          throw metadataError("URL_METADATA_REDIRECT_LIMIT", "网站重定向次数过多");
        current = normalizeRequestedUrl(
          new URL(response.headers.location, current).href,
        );
        continue;
      }
      if (response.status < 200 || response.status >= 400)
        throw metadataError(
          "URL_METADATA_UNAVAILABLE",
          `网站返回了 HTTP ${response.status}，无法自动识别`,
        );
      const contentType = String(response.headers["content-type"] || "");
      if (contentType && !/html|xhtml/i.test(contentType))
        throw metadataError("URL_METADATA_NOT_HTML", "该链接不是网页，无法提取站点信息");
      const metadata = extractMetadata(response.data, current.href);
      try {
        const iconUrl = new URL(metadata.icon);
        if (iconUrl.hostname !== current.hostname)
          await resolvePublicAddresses(iconUrl.hostname, lookup, allowPrivate);
      } catch {
        metadata.icon = new URL("/favicon.ico", current).href.slice(0, 500);
      }
      return {
        url: requested.href,
        finalUrl: current.href,
        ...metadata,
      };
    }
    throw metadataError("URL_METADATA_REDIRECT_LIMIT", "网站重定向次数过多");
  }
  return { fetchPage };
}

module.exports = {
  createUrlMetadataService,
  decodeEntities,
  extractMetadata,
  isPublicAddress,
  normalizeRequestedUrl,
  resolvePublicAddresses,
};
