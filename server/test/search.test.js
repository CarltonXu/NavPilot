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

test("global search returns and searches complete category paths", async (t) => {
  const navigation = createNavigationService(db);
  const publicRoot = navigation.createCategory(realm("public"), {
    name: "SearchPathCompany",
  }).value;
  const publicLeaf = navigation.createCategory(realm("public"), {
    name: "Engineering",
    parentId: publicRoot.id,
  }).value;
  const publicItem = navigation.createItem(realm("public"), {
    name: "Internal Repository",
    url: "https://search-path-public.example",
    description: "Internal source code and delivery platform",
    category_id: publicLeaf.id,
  }).value;

  const user = await createUser({
    username: "search-path-user",
    displayName: "Search Path User",
    password: "Strong-search-path-password",
    mustChangePassword: false,
  });
  const session = createSession(user.id);
  const personalRoot = navigation.createCategory(realm("personal", user.id), {
    name: "SearchPathPrivate",
  }).value;
  const personalLeaf = navigation.createCategory(realm("personal", user.id), {
    name: "Reading",
    parentId: personalRoot.id,
  }).value;
  const personalItem = navigation.createItem(realm("personal", user.id), {
    name: "Private Reference",
    url: "https://search-path-personal.example",
    category_id: personalLeaf.id,
  }).value;
  const foreign = await createUser({
    username: "search-path-foreign",
    displayName: "Search Path Foreign",
    password: "Strong-search-path-foreign-password",
    mustChangePassword: false,
  });
  const foreignItem = navigation.createItem(realm("personal", foreign.id), {
    name: "Foreign Private Reference",
    url: "https://search-path-foreign.example",
  }).value;
  const admin = await createUser({
    username: "search-path-admin",
    displayName: "Search Path Admin",
    password: "Strong-search-path-admin-password",
    role: "admin",
    mustChangePassword: false,
  });
  const adminSession = createSession(admin.id);
  const deletedItem = navigation.createItem(realm("public"), {
    name: "Deleted Search Record",
    url: "https://search-path-deleted.example",
  }).value;
  navigation.deleteItem(realm("public"), deletedItem.id);

  const server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  async function search(query, token = "") {
    const response = await fetch(
      `${baseURL}/api/search?q=${encodeURIComponent(query)}&semantic=0`,
      { headers: token ? { cookie: `navpilot_session=${token}` } : {} },
    );
    assert.equal(response.status, 200);
    return response.json();
  }

  let results = await search("SearchPathCompany");
  let result = results.find((item) => item.id === publicItem.id);
  assert.equal(result.categoryName, "Engineering");
  assert.equal(result.categoryPath, "SearchPathCompany / Engineering");
  assert.equal(result.description, "Internal source code and delivery platform");
  assert.match(result.searchEventId, /^search-[a-f0-9-]{36}$/);

  results = await search("SearchPathPrivate", session.rawToken);
  result = results.find((item) => item.id === personalItem.id);
  assert.equal(result.categoryName, "Reading");
  assert.equal(result.categoryPath, "SearchPathPrivate / Reading");

  results = await search("SearchPathPrivate");
  assert.equal(results.some((item) => item.id === personalItem.id), false);

  // A signed-in user may search public resources and their own personal space,
  // but must never discover another user's personal resources.
  results = await search("Foreign Private Reference", session.rawToken);
  assert.equal(results.some((item) => item.id === foreignItem.id), false);

  // The same realm boundary applies to administrators on the global-search
  // surface; admin management pages remain the place for cross-user inspection.
  results = await search("Foreign Private Reference", adminSession.rawToken);
  assert.equal(results.some((item) => item.id === foreignItem.id), false);

  // Deleting an item removes it from the live items table, so historical
  // snapshots/analytics must not make it searchable again.
  results = await search("Deleted Search Record", session.rawToken);
  assert.equal(results.some((item) => item.id === deletedItem.id), false);
  const tracked = db.prepare("SELECT COUNT(*) count FROM analytics_events WHERE event_name='search.performed'").get().count;
  assert.equal(tracked, 6);
  const searchProperties=db.prepare("SELECT properties_json FROM analytics_events WHERE event_name='search.performed'").all().map(row=>JSON.parse(row.properties_json));
  assert.equal(searchProperties.some(value=>value.publicResultCount===1&&value.personalResultCount===0),true);
  assert.equal(searchProperties.some(value=>value.publicResultCount===0&&value.personalResultCount===1),true);
});

test.after(() => db.close());
