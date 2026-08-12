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
  assert.match(result.searchEventId, /^search-[a-f0-9-]{36}$/);

  results = await search("SearchPathPrivate", session.rawToken);
  result = results.find((item) => item.id === personalItem.id);
  assert.equal(result.categoryName, "Reading");
  assert.equal(result.categoryPath, "SearchPathPrivate / Reading");

  results = await search("SearchPathPrivate");
  assert.equal(results.some((item) => item.id === personalItem.id), false);
  const tracked = db.prepare("SELECT COUNT(*) count FROM analytics_events WHERE event_name='search.performed'").get().count;
  assert.equal(tracked, 3);
  const searchProperties=db.prepare("SELECT properties_json FROM analytics_events WHERE event_name='search.performed'").all().map(row=>JSON.parse(row.properties_json));
  assert.equal(searchProperties.some(value=>value.publicResultCount===1&&value.personalResultCount===0),true);
  assert.equal(searchProperties.some(value=>value.publicResultCount===0&&value.personalResultCount===1),true);
});

test.after(() => db.close());
