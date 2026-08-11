const test = require("node:test");
const assert = require("node:assert/strict");

process.env.NAVPILOT_DB_PATH = ":memory:";
process.env.NODE_ENV = "test";

const db = require("../src/db");
const { createApp } = require("../src/index");
const { createUser } = require("../src/services/authService");
const { createSession } = require("../src/services/sessionService");
const { createNavigationService, realm } = require("../src/services/navigationService");
const { createPlan } = require("../src/services/ai/planService");
const { executePlan, undoPlan } = require("../src/services/ai/commandExecutor");
const { PERMISSIONS, hasPermission } = require("../src/services/authorizationService");

test("permission policy separates public use from public management", () => {
  const member = { id:"member-policy", role:"user", status:"active" };
  const admin = { id:"admin-policy", role:"admin", status:"active" };
  assert.equal(hasPermission(null, PERMISSIONS.PUBLIC_READ), true);
  assert.equal(hasPermission(member, PERMISSIONS.PUBLIC_ANALYZE), true);
  assert.equal(hasPermission(member, PERMISSIONS.PUBLIC_MANAGE), false);
  assert.equal(hasPermission(admin, PERMISSIONS.PUBLIC_MANAGE), true);
  assert.equal(hasPermission(member, PERMISSIONS.PERSONAL_MANAGE, { ownerId:member.id }), true);
  assert.equal(hasPermission(member, PERMISSIONS.PERSONAL_MANAGE, { ownerId:"another-user" }), false);
});

test("ordinary users can use public resources but cannot manage public or foreign personal data", async (t) => {
  const member = await createUser({ username:"permission-member", displayName:"Permission Member", password:"Strong-member-password", mustChangePassword:false });
  const foreign = await createUser({ username:"permission-foreign", displayName:"Permission Foreign", password:"Strong-foreign-password", mustChangePassword:false });
  const session = createSession(member.id), navigation = createNavigationService(db);
  const publicItem = navigation.createItem(realm("public"), { name:"Permission public item", url:"https://permission-public.example" }).value;
  const foreignCategory = navigation.createCategory(realm("personal", foreign.id), { name:"Foreign private category" }).value;

  const server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, options = {}) {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers:{ "Content-Type":"application/json", cookie:`navpilot_session=${session.rawToken}`, ...(options.headers || {}) },
    });
    let body = null;
    try { body = await response.json(); } catch { /* empty body */ }
    return { response, body };
  }

  let result = await request("/api/items?scope=public");
  assert.equal(result.response.status, 200);
  assert.ok(result.body.some((item) => item.id === publicItem.id));

  result = await request(`/api/items/${publicItem.id}/favorite`, { method:"PUT", body:JSON.stringify({ favorite:true }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.favorite, true);

  result = await request(`/api/items/${publicItem.id}/click`, { method:"POST", body:JSON.stringify({ eventId:"permission-click-event" }) });
  assert.equal(result.response.status, 200);
  for (let index = 0; index < 11; index += 1) {
    result = await request(`/api/items/${publicItem.id}/click`, { method:"POST", body:JSON.stringify({ eventId:`permission-click-${index}` }) });
    assert.equal(result.response.status, 200);
  }
  result = await request(`/api/items/${publicItem.id}/click`, { method:"POST", body:JSON.stringify({ eventId:"permission-click-rate-limited" }) });
  assert.equal(result.response.status, 429);
  assert.equal(result.body.code, "CLICK_RATE_LIMITED");

  const forbiddenRequests = [
    ["/api/categories", { method:"POST", body:JSON.stringify({ scope:"public", name:"Forbidden category" }) }],
    ["/api/items", { method:"POST", body:JSON.stringify({ scope:"public", name:"Forbidden item", url:"https://forbidden.example" }) }],
    ["/api/items/check-all", { method:"POST", body:JSON.stringify({ scope:"public" }) }],
    ["/api/transfer/export", { method:"POST", body:JSON.stringify({ scope:"public", selection:{ all:true } }) }],
    ["/api/shares", { method:"POST", body:JSON.stringify({ scope:"public", recipient:foreign.username, selection:{ all:true } }) }],
    ["/api/settings/admin", { method:"GET" }],
  ];
  for (const [path, options] of forbiddenRequests) {
    result = await request(path, options);
    assert.equal(result.response.status, 403, path);
    assert.equal(result.body.code, "FORBIDDEN", path);
  }

  result = await request(`/api/categories/${foreignCategory.id}`, { method:"PATCH", body:JSON.stringify({ name:"Stolen category" }) });
  assert.equal(result.response.status, 404);

  result = await request("/api/categories", { method:"POST", body:JSON.stringify({ scope:"personal", name:"My permitted category" }) });
  assert.equal(result.response.status, 201);
  assert.equal(result.body.name, "My permitted category");

  assert.ok(db.prepare("SELECT COUNT(*) count FROM security_audit_events WHERE actor_user_id=? AND event_type='authorization.denied'").get(member.id).count >= 3);
});

test("public AI plans recheck administrator permission for execution and undo", async () => {
  const admin = await createUser({ username:"plan-permission-admin", displayName:"Plan Permission Admin", password:"Strong-admin-password", role:"admin", mustChangePassword:false });
  const actor = { ...admin, role:"admin", status:"active" };
  const current = realm("public"), req = { auth:{ user:actor }, header:() => "", ip:"127.0.0.1", method:"POST", originalUrl:"/api/ai/plans/test" };

  const blockedPlan = createPlan({
    actor, current, locale:"zh-CN", text:"create blocked category", model:"test-model",
    commands:[{ op:"category.create", category:"Must not execute after downgrade" }],
  });
  actor.role = "user";
  assert.throws(() => executePlan({ id:blockedPlan.id, actor, req, idempotencyKey:"downgraded-execute", confirmed:true }), (error) => error.code === "FORBIDDEN");
  assert.equal(db.prepare("SELECT COUNT(*) count FROM categories WHERE scope='public' AND name=?").get("Must not execute after downgrade").count, 0);

  actor.role = "admin";
  const executedPlan = createPlan({
    actor, current, locale:"zh-CN", text:"create category before downgrade", model:"test-model",
    commands:[{ op:"category.create", category:"Created before downgrade" }],
  });
  executePlan({ id:executedPlan.id, actor, req, idempotencyKey:"admin-execute-plan", confirmed:true });
  actor.role = "user";
  assert.throws(() => undoPlan({ id:executedPlan.id, actor, req, idempotencyKey:"downgraded-undo" }), (error) => error.code === "FORBIDDEN");
  assert.equal(db.prepare("SELECT COUNT(*) count FROM categories WHERE scope='public' AND name=?").get("Created before downgrade").count, 1);
});

test.after(() => db.close());
