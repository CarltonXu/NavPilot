const test = require("node:test");
const assert = require("node:assert/strict");

process.env.NAVPILOT_DB_PATH = ":memory:";
process.env.NODE_ENV = "test";

const db = require("../src/db");
const { createApp } = require("../src/index");
const { createUser } = require("../src/services/authService");
const { createSession } = require("../src/services/sessionService");
const {
  createNavigationService,
  realm,
} = require("../src/services/navigationService");

test("bulk website identification updates reachable resources and audits failures", async (t) => {
  const admin = await createUser({
      username: "metadataadmin",
      displayName: "Metadata Admin",
      password: "Strong-metadata-admin-password",
      role: "admin",
      mustChangePassword: false,
    }),
    session = createSession(admin.id),
    navigation = createNavigationService(db),
    current = realm("public");

  const server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const reachable = navigation.createItem(current, {
      name: "Old site name",
      url: `${baseUrl}/metadata-source`,
      description: "Keep this description when the page has none",
    }).value,
    unreachable = navigation.createItem(current, {
      name: "Unavailable site",
      url: "http://127.0.0.1:1/unavailable",
    }).value;

  const response = await fetch(`${baseUrl}/api/items/bulk-metadata`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `navpilot_session=${session.rawToken}`,
    },
    body: JSON.stringify({
      scope: "public",
      ids: [reachable.id, unreachable.id],
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.totalCount, 2);
  assert.equal(body.updatedCount, 1);
  assert.equal(body.failedCount, 1);
  assert.equal(body.failures[0].id, unreachable.id);

  const updated = navigation.getItem(current, reachable.id);
  assert.equal(updated.name, "NavPilot");
  assert.equal(
    updated.description,
    "Keep this description when the page has none",
  );
  assert.equal(updated.icon, `${baseUrl}/favicon.ico`);
  assert.equal(navigation.getItem(current, unreachable.id).version, 1);

  const audit = db
    .prepare(
      "SELECT metadata_json FROM security_audit_events WHERE event_type='item.bulk_metadata_updated' ORDER BY occurred_at_ms DESC LIMIT 1",
    )
    .get();
  assert.ok(audit);
  const metadata = JSON.parse(audit.metadata_json);
  assert.equal(metadata.requestedCount, 2);
  assert.equal(metadata.updatedCount, 1);
  assert.equal(metadata.failedCount, 1);
});

test.after(() => db.close());
