const test = require("node:test");
const assert = require("node:assert/strict");
process.env.NAVPILOT_DB_PATH = ":memory:";
process.env.NODE_ENV = "test";
const db = require("../src/db");
const { createApp } = require("../src/index");
const { createUser } = require("../src/services/authService");
const { createSession } = require("../src/services/sessionService");

test("profile, sharing, Chrome preview, duplicate detection and acceptance import work end to end", async (t) => {
  const sender = await createUser({
    username: "sender",
    displayName: "Sender",
    password: "strong-password-1",
    mustChangePassword: false,
  });
  const recipient = await createUser({
    username: "recipient",
    displayName: "Recipient",
    password: "strong-password-2",
    mustChangePassword: false,
  });
  const senderToken = createSession(sender.id).rawToken,
    recipientToken = createSession(recipient.id).rawToken;
  const root = Number(
    db
      .prepare(
        "INSERT INTO categories(name,scope,owner_id) VALUES(?,'personal',?)",
      )
      .run("研发", sender.id).lastInsertRowid,
  );
  const child = Number(
    db
      .prepare(
        "INSERT INTO categories(name,scope,owner_id,parent_id) VALUES(?,'personal',?,?)",
      )
      .run("后端", sender.id, root).lastInsertRowid,
  );
  db.prepare(
    "INSERT INTO items(name,url,tags_json,category_id,scope,owner_id) VALUES(?,?,?,?,'personal',?)",
  ).run(
    "API Docs",
    "https://docs.example/api",
    JSON.stringify(["文档", "API"]),
    child,
    sender.id,
  );
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(token, path, options = {}) {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        cookie: `navpilot_session=${token}`,
        ...options.headers,
      },
    });
    const body = await response.json();
    return { response, body };
  }
  let result = await request(senderToken, "/api/auth/profile", {
    method: "PATCH",
    body: JSON.stringify({
      displayName: "Sender Updated",
      avatarUrl: "https://images.example/avatar.png",
      phone: "+86 13800000000",
      email: "sender@example.com",
      preferences: {
        theme: "eyecare",
        locale: "zh-CN",
        viewMode: "compact",
        defaultSpace: "personal",
      },
    }),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.user.username, "sender");
  assert.equal(result.body.user.email, "sender@example.com");
  assert.equal(result.body.user.preferences.defaultSpace, "personal");
  result = await request(senderToken, "/api/shares", {
    method: "POST",
    body: JSON.stringify({
      recipients: ["recipient"],
      selection: { categoryIds: [root] },
    }),
  });
  assert.equal(result.response.status, 201);
  const shareId = result.body.shares[0].id;
  result = await request(recipientToken, "/api/shares");
  assert.equal(result.body.received[0].summary.items, 1);
  assert.equal(result.body.received[0].status, "pending");
  assert.equal(typeof result.body.received[0].createdAt, "number");
  assert.equal(result.body.received[0].snapshot, undefined);
  result = await request(recipientToken, `/api/shares/${shareId}`);
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.snapshot.items[0].tags, ["文档", "API"]);
  assert.equal(result.body.snapshot.items[0].name, "API Docs");
  result = await request(recipientToken, `/api/shares/${shareId}/respond`, {
    method: "POST",
    body: JSON.stringify({ action: "accept", preserveStructure: true }),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.result.imported, 1);
  assert.equal(
    db
      .prepare("SELECT COUNT(*) count FROM items WHERE owner_id=? AND url=?")
      .get(recipient.id, "https://docs.example/api").count,
    1,
  );
  const exported = await request(senderToken, "/api/transfer/export", {
    method: "POST",
    body: JSON.stringify({ selection: { all: true } }),
  });
  result = await request(recipientToken, "/api/transfer/preview", {
    method: "POST",
    body: JSON.stringify({ payload: exported.body, format: "navpilot" }),
  });
  assert.equal(result.body.summary.duplicates, 1);
  assert.equal(result.body.items[0].duplicate, true);
  const chrome = {
    roots: {
      bookmark_bar: {
        title: "Bookmarks bar",
        children: [
          {
            id: "1",
            title: "Tools",
            children: [{ id: "2", title: "GitHub", url: "https://github.com" }],
          },
        ],
      },
    },
  };
  result = await request(recipientToken, "/api/transfer/preview", {
    method: "POST",
    body: JSON.stringify({ payload: chrome, format: "chrome" }),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.summary.items, 1);
  assert.equal(result.body.categories.length, 2);
  assert.equal(result.body.items[0].name, "GitHub");
  assert.deepEqual(
    result.body.categories.map((row) => row.name),
    ["Bookmarks bar", "Tools"],
  );
});

test.after(() => db.close());
