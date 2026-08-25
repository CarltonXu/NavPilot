const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createIconCacheService, detectType } = require('../src/services/iconCacheService');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+G4o2NwAAAABJRU5ErkJggg==', 'base64');

test('remote icons are validated and reused from the persistent cache', async (t) => {
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'navpilot-icon-cache-'));
  t.after(() => fs.rmSync(cacheRoot, { recursive: true, force: true }));
  let requests = 0;
  const service = createIconCacheService({
    cacheRoot,
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    request: {
      get: async (_url, options) => {
        requests += 1;
        assert.equal(options.maxRedirects, 0);
        assert.equal(options.proxy, false);
        return { status: 200, headers: { 'content-type': 'image/png' }, data: PNG };
      },
    },
  });
  const first = await service.resolve('https://example.com/favicon.png');
  const second = await service.resolve('https://example.com/favicon.png');
  assert.equal(first.path, second.path);
  assert.equal(first.type, 'image/png');
  assert.equal(requests, 1);
  assert.equal(fs.readFileSync(first.path).equals(PNG), true);
});

test('icon type detection rejects HTML disguised as an image', () => {
  assert.equal(detectType(Buffer.from('<html>not an icon</html>')), null);
  assert.equal(detectType(PNG).type, 'image/png');
});

test('icon type detection accepts simple SVG and rejects active SVG content', () => {
  assert.equal(
    detectType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1z"/></svg>')).type,
    'image/svg+xml',
  );
  assert.equal(
    detectType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')),
    null,
  );
  assert.equal(
    detectType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')),
    null,
  );
});

test('icon fetching blocks private network targets before making a request', async (t) => {
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'navpilot-icon-private-'));
  t.after(() => fs.rmSync(cacheRoot, { recursive: true, force: true }));
  let requested = false;
  const service = createIconCacheService({
    cacheRoot,
    lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    request: { get: async () => { requested = true; } },
  });
  await assert.rejects(
    () => service.resolve('https://private.example/favicon.ico'),
    (error) => error.code === 'URL_PRIVATE_ADDRESS_FORBIDDEN',
  );
  assert.equal(requested, false);
});
