const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createUrlMetadataService,
  extractMetadata,
  isPublicAddress,
  normalizeRequestedUrl,
} = require("../src/services/urlMetadataService");

test("URL metadata parser extracts title, description and relative icon", () => {
  const metadata = extractMetadata(
    `<!doctype html><html><head>
      <title>Fallback title</title>
      <meta content="Nav &amp; Pilot" property="og:title">
      <meta name="description" content="A useful &quot;portal&quot;.">
      <link href="/assets/favicon.png" rel="shortcut icon">
    </head></html>`,
    "https://example.com/docs/start",
  );
  assert.deepEqual(metadata, {
    name: "Nav & Pilot",
    description: 'A useful "portal".',
    icon: "https://example.com/assets/favicon.png",
  });
});

test("URL metadata parser ignores non-web icon schemes", () => {
  const metadata = extractMetadata(
    "<title>Example</title><link rel='icon' href='data:,'>",
    "https://example.com/path",
  );
  assert.equal(metadata.icon, "https://example.com/favicon.ico");
});

test("URL metadata validation blocks local and private network targets", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.4",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "fc00::1",
    "::ffff:7f00:1",
  ])
    assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress("93.184.216.34"), true);
  assert.equal(
    normalizeRequestedUrl("example.com/path").href,
    "https://example.com/path",
  );
});

test("URL metadata service pins public DNS results and returns page metadata", async () => {
  let requestedUrl = "";
  const service = createUrlMetadataService({
    lookup: async () => [
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      { address: "93.184.216.34", family: 4 },
    ],
    request: {
      get: async (url, options) => {
        requestedUrl = url;
        assert.equal(options.maxRedirects, 0);
        assert.equal(options.proxy, false);
        assert.equal(options.httpsAgent.options.family, 4);
        assert.equal(options.httpsAgent.options.autoSelectFamily, false);
        await new Promise((resolve, reject) =>
          options.httpsAgent.options.lookup(
            "example.com",
            { all: true },
            (error, records) => {
              if (error) return reject(error);
              assert.deepEqual(records, [
                { address: "93.184.216.34", family: 4 },
              ]);
              resolve();
            },
          ),
        );
        return {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
          data: "<title>Example Site</title><meta name='description' content='Example description'><link rel='icon' href='http://127.0.0.1/private.png'>",
        };
      },
    },
  });
  const result = await service.fetchPage("example.com");
  assert.equal(requestedUrl, "https://example.com/");
  assert.equal(result.name, "Example Site");
  assert.equal(result.description, "Example description");
  assert.equal(result.icon, "https://example.com/favicon.ico");
});

test("URL metadata service rejects a redirect to a private address", async () => {
  const service = createUrlMetadataService({
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    request: {
      get: async () => ({
        status: 302,
        headers: { location: "http://127.0.0.1/admin" },
        data: "",
      }),
    },
  });
  await assert.rejects(
    () => service.fetchPage("https://example.com"),
    (error) => error.code === "URL_PRIVATE_ADDRESS_FORBIDDEN",
  );
});

test("URL metadata service allows private targets only when explicitly authorized", async () => {
  let requested = false;
  const service = createUrlMetadataService({
    request: {
      get: async () => {
        requested = true;
        return {
          status: 200,
          headers: { "content-type": "text/html" },
          data: "<title>Internal Wiki</title>",
        };
      },
    },
  });
  const result = await service.fetchPage("http://192.168.10.20", {
    allowPrivate: true,
  });
  assert.equal(requested, true);
  assert.equal(result.name, "Internal Wiki");
});
