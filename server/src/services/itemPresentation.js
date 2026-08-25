const crypto = require('crypto');
const net = require('net');
const { isPublicAddress } = require('./urlMetadataService');

function iconCacheUrl(item) {
  const source = String(item?.icon || '');
  if (!/^https?:\/\//i.test(source) || !item?.id) return null;
  try {
    const hostname = new URL(source).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) return null;
    if (net.isIP(hostname) && !isPublicAddress(hostname)) return null;
  } catch {
    return null;
  }
  const version = crypto.createHash('sha256').update(source).digest('hex').slice(0, 16);
  return `/api/items/icon-cache/${version}`;
}

function presentItem(item) {
  const cached = iconCacheUrl(item);
  return cached ? { ...item, icon_cache_url: cached } : item;
}

module.exports = { iconCacheUrl, presentItem };
