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

test("personal resource bulk delete is atomic and audited", async (t) => {
  const owner = await createUser({
      username: "bulkowner",
      displayName: "Bulk Owner",
      password: "Strong-bulk-owner-password",
      mustChangePassword: false,
    }),
    other = await createUser({
      username: "bulkother",
      displayName: "Bulk Other",
      password: "Strong-bulk-other-password",
      mustChangePassword: false,
    }),
    session = createSession(owner.id),
    navigation = createNavigationService(db),
    current = realm("personal", owner.id);
  const one = navigation.createItem(current, {
      name: "Bulk one",
      url: "https://bulk-one.example",
    }).value,
    two = navigation.createItem(current, {
      name: "Bulk two",
      url: "https://bulk-two.example",
    }).value,
    foreign = navigation.createItem(realm("personal", other.id), {
      name: "Foreign",
      url: "https://bulk-foreign.example",
    }).value;

  const server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  async function remove(ids) {
    const response = await fetch(`${baseUrl}/api/items/bulk-delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `navpilot_session=${session.rawToken}`,
      },
      body: JSON.stringify({ scope: "personal", ids }),
    });
    return { response, body: await response.json() };
  }

  let result = await remove([one.id, foreign.id]);
  assert.equal(result.response.status, 404);
  assert.ok(db.prepare("SELECT 1 FROM items WHERE id=?").get(one.id));

  result = await remove([one.id, two.id]);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.deletedCount, 2);
  assert.deepEqual(result.body.deletedIds, [one.id, two.id]);
  assert.equal(
    db
      .prepare("SELECT COUNT(*) count FROM items WHERE id IN (?,?)")
      .get(one.id, two.id).count,
    0,
  );
  const audit = db
    .prepare(
      "SELECT metadata_json FROM security_audit_events WHERE event_type='item.bulk_deleted' ORDER BY occurred_at_ms DESC LIMIT 1",
    )
    .get();
  assert.ok(audit);
  assert.equal(JSON.parse(audit.metadata_json).affectedCount, 2);
});

test.after(() => db.close());
