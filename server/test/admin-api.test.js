const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.NAVPILOT_DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const db = require('../src/db');
const { createApp } = require('../src/index');
const { createUser } = require('../src/services/authService');
const { createSession } = require('../src/services/sessionService');

test('admin account operations protect administrators and audit responses paginate by 20', async (t) => {
  const admin = await createUser({ username: 'rootadmin', displayName: 'Root Admin', password: 'Strong-admin-password', role: 'admin', mustChangePassword: false });
  const member = await createUser({ username: 'member', displayName: 'Member', password: 'Strong-member-password', mustChangePassword: false });
  const adminSession = createSession(admin.id);
  createSession(member.id);
  const engineeringGroupId = crypto.randomUUID(), operationsGroupId = crypto.randomUUID(), groupNow = Date.now();
  db.prepare('INSERT INTO access_groups(id,name,description,created_by_user_id,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?,?)')
    .run(engineeringGroupId, 'Engineering', 'Product engineering', admin.id, groupNow, groupNow);
  db.prepare('INSERT INTO access_groups(id,name,description,created_by_user_id,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?,?)')
    .run(operationsGroupId, 'Operations', 'Platform operations', admin.id, groupNow, groupNow);
  db.prepare('INSERT INTO access_group_members(group_id,user_id,added_by_user_id,created_at_ms) VALUES(?,?,?,?)')
    .run(engineeringGroupId, member.id, admin.id, groupNow);

  const categoryId = Number(db.prepare("INSERT INTO categories(name,scope,owner_id) VALUES(?,'personal',?)").run('Private', member.id).lastInsertRowid);
  const personalItemId = Number(db.prepare("INSERT INTO items(name,url,category_id,scope,owner_id) VALUES(?,?,?,'personal',?)").run('Private link', 'https://private.example', categoryId, member.id).lastInsertRowid);
  const publicItemId = db.prepare("SELECT id FROM items WHERE scope='public' ORDER BY id LIMIT 1").get().id;
  const publicCategoryId = db.prepare("SELECT category_id categoryId FROM items WHERE id=?").get(publicItemId).categoryId;
  const now = Date.now();
  db.prepare('INSERT INTO item_access_user_grants(item_id,user_id,expires_at_ms,granted_by_user_id,created_at_ms) VALUES(?,?,NULL,?,?)')
    .run(publicItemId, member.id, admin.id, now);
  db.prepare('INSERT INTO item_access_group_grants(item_id,group_id,expires_at_ms,granted_by_user_id,created_at_ms) VALUES(?,?,NULL,?,?)')
    .run(publicItemId, engineeringGroupId, admin.id, now);
  if (publicCategoryId != null) {
    db.prepare('INSERT INTO category_access_user_defaults(category_id,user_id,expires_at_ms) VALUES(?,?,NULL)').run(publicCategoryId, member.id);
    db.prepare('INSERT INTO category_access_group_defaults(category_id,group_id,expires_at_ms) VALUES(?,?,NULL)').run(publicCategoryId, engineeringGroupId);
  }
  db.prepare("INSERT INTO resource_health_events(item_id,item_name,scope,owner_id,status,latency_ms,checked_at_ms) VALUES(?,?,'public',NULL,'offline',NULL,?)")
    .run(publicItemId, 'Public link', now - 10 * 60_000);
  db.prepare("INSERT INTO resource_health_events(item_id,item_name,scope,owner_id,status,latency_ms,checked_at_ms) VALUES(?,?,'public',NULL,'online',180,?)")
    .run(publicItemId, 'Public link', now - 5 * 60_000);
  db.prepare("INSERT INTO analytics_events(id,occurred_at_ms,event_name,user_id,item_id,category_id,scope,item_name,item_url,item_owner_id,properties_json) VALUES(?,?, 'item.clicked',?,?,?,?,?,?,?,'{}')")
    .run(crypto.randomUUID(), now, member.id, personalItemId, categoryId, 'personal', 'Private link', 'https://private.example', member.id);
  db.prepare("INSERT INTO analytics_events(id,occurred_at_ms,event_name,user_id,item_id,scope,country_code,city_name,city_source,item_name,item_url,properties_json) VALUES(?,?, 'item.clicked',?,?,?,?,?,?,?,?,'{}')")
    .run(crypto.randomUUID(), now, admin.id, publicItemId, 'public', 'CN', 'Jinan', 'city_database', 'Public link', 'https://public.example');
  db.prepare("INSERT INTO ai_usage_events(id,actor_user_id,feature,provider_model,success,latency_ms,input_tokens,output_tokens,first_token_ms,realm_scope,realm_owner_id,created_at_ms) VALUES(?,?,'discussion','test-model',1,320,100,40,85,'personal',?,?)")
    .run(crypto.randomUUID(), member.id, member.id, now);
  db.prepare("INSERT INTO ai_plans(id,actor_user_id,realm_scope,realm_owner_id,status,locale,input_hash,operations_json,warnings_json,expected_versions_json,created_at_ms,expires_at_ms) VALUES(?,?,'personal',?,'draft','zh-CN','hash','[]','[]','{}',?,?)")
    .run(crypto.randomUUID(), member.id, member.id, Date.now(), Date.now() + 60_000);
  for (let index = 0; index < 25; index += 1) {
    db.prepare("INSERT INTO security_audit_events(id,occurred_at_ms,event_type,outcome,actor_user_id,actor_username,actor_role,metadata_json) VALUES(?,?,'test.event','success',?,?,'user','{}')")
      .run(crypto.randomUUID(), Date.now() + index, member.id, member.username);
  }

  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  async function request(path, options = {}) {
    const response = await fetch(`${baseURL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', cookie: `navpilot_session=${adminSession.rawToken}`, ...(options.headers || {}) },
    });
    let body = null;
    try { body = await response.json(); } catch { /* empty response */ }
    return { response, body };
  }

  let availabilityResult = await request('/api/admin/availability?days=30&scope=public');
  assert.equal(availabilityResult.response.status, 200);
  const availabilityItem = availabilityResult.body.items.find((item) => item.itemId === publicItemId);
  assert.equal(availabilityItem.availability, 50);
  assert.equal(availabilityItem.daily.length, 30);
  assert.equal(availabilityItem.daily.at(-1).status, 'degraded');

  availabilityResult = await request(`/api/items/${publicItemId}/availability?days=7`);
  assert.equal(availabilityResult.response.status, 200);
  assert.equal(availabilityResult.body.daily.length, 7);
  assert.equal(availabilityResult.body.incidents.length, 1);
  assert.equal(availabilityResult.body.incidents[0].recovered, true);

  availabilityResult = await request('/api/items/availability-summaries', { method:'POST', body:JSON.stringify({ ids:[publicItemId], days:7 }) });
  assert.equal(availabilityResult.response.status, 200);
  assert.equal(availabilityResult.body.items[0].checks, 2);

  let result = await request(`/api/admin/users/${member.id}`);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.user.username, 'member');
  assert.deepEqual(result.body.stats, { personalItems: 1, personalCategories: 1, activeSessions: 1, aiPlans: 1 });
  assert.deepEqual(result.body.accessGroups.map((group) => group.id), [engineeringGroupId]);
  assert.deepEqual(result.body.availableAccessGroups.map((group) => group.name), ['Engineering', 'Operations']);
  assert.equal(result.body.authorization.directResources.length, 1);
  assert.equal(result.body.authorization.groupResources.length, 1);
  assert.equal(result.body.authorization.groupResources[0].groupName, 'Engineering');
  assert.equal(result.body.authorization.summary.resourceCount, 1);
  assert.equal(result.body.authorization.directCategories.length, publicCategoryId == null ? 0 : 1);
  assert.equal(result.body.authorization.groupCategories.length, publicCategoryId == null ? 0 : 1);

  result = await request('/api/admin/users');
  assert.equal(result.response.status, 200);
  assert.equal(result.body.find((user) => user.id === member.id).accessGroupCount, 1);

  result = await request(`/api/admin/users/${member.id}`, { method:'PATCH', body:JSON.stringify({
    displayName:'Member', role:'user', status:'active',
    accessGroupIds:[operationsGroupId], expectedAccessGroupIds:[engineeringGroupId],
  }) });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.accessGroups.map((group) => group.id), [operationsGroupId]);
  assert.deepEqual(db.prepare('SELECT group_id groupId FROM access_group_members WHERE user_id=?').all(member.id), [{ groupId:operationsGroupId }]);

  result = await request(`/api/admin/access-groups/${operationsGroupId}`);
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.members.map((groupMember) => groupMember.id), [member.id]);

  result = await request(`/api/admin/access-groups/${engineeringGroupId}`);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.authorization.resources.length, 1);
  assert.equal(result.body.authorization.categories.length, publicCategoryId == null ? 0 : 1);

  result = await request(`/api/admin/access-groups/${engineeringGroupId}/members`, { method:'PUT', body:JSON.stringify({
    userIds:[member.id, admin.id], expectedVersion:result.body.version,
  }) });
  assert.equal(result.response.status, 400);
  assert.equal(result.body.code, 'ADMIN_GROUP_MEMBERSHIP_UNNECESSARY');

  result = await request('/api/admin/access-principals');
  assert.equal(result.response.status, 200);
  assert.ok(result.body.users.some((candidate) => candidate.id === member.id));
  assert.ok(!result.body.users.some((candidate) => candidate.id === admin.id));

  result = await request(`/api/admin/users/${member.id}`, { method:'PATCH', body:JSON.stringify({
    displayName:'Member', accessGroupIds:[engineeringGroupId], expectedAccessGroupIds:[engineeringGroupId],
  }) });
  assert.equal(result.response.status, 409);
  assert.equal(result.body.code, 'VERSION_CONFLICT');

  result = await request('/api/admin/users', { method: 'POST', body: JSON.stringify({ username: '!', displayName: 'Invalid' }) });
  assert.equal(result.response.status, 400);
  assert.equal(result.body.code, 'INVALID_USERNAME');

  result = await request(`/api/admin/users/${admin.id}`, { method: 'PATCH', body: JSON.stringify({ role: 'user' }) });
  assert.equal(result.response.status, 409);
  assert.equal(result.body.code, 'LAST_ADMIN_REQUIRED');

  result = await request(`/api/admin/users/${admin.id}`, { method: 'DELETE' });
  assert.equal(result.response.status, 409);
  assert.equal(result.body.code, 'CANNOT_DELETE_SELF');

  result = await request(`/api/admin/users/${member.id}/reset-password`, { method: 'POST', body: '{}' });
  assert.equal(result.response.status, 200);
  assert.ok(result.body.temporaryPassword.length >= 10);
  assert.equal(db.prepare('SELECT must_change_password FROM users WHERE id=?').get(member.id).must_change_password, 1);
  assert.ok(db.prepare('SELECT revoked_at FROM sessions WHERE user_id=?').get(member.id).revoked_at);

  result = await request(`/api/admin/users/${member.id}/reset-password`, { method: 'POST', body: JSON.stringify({ temporaryPassword: 'short' }) });
  assert.equal(result.response.status, 400);
  assert.equal(result.body.code, 'INVALID_PASSWORD');

  result = await request('/api/admin/analytics/audit');
  assert.equal(result.response.status, 200);
  assert.equal(result.body.items.length, 20);
  assert.equal(result.body.pagination.page, 1);
  assert.equal(result.body.pagination.pageSize, 20);
  assert.ok(result.body.pagination.total >= 26);
  assert.ok(result.body.pagination.totalPages >= 2);

  result = await request('/api/admin/analytics/audit?page=2');
  assert.equal(result.response.status, 200);
  assert.equal(result.body.pagination.page, 2);
  assert.ok(result.body.items.length > 0 && result.body.items.length <= 20);

  result = await request('/api/admin/analytics/summary?days=30');
  assert.equal(result.response.status, 200);
  assert.equal(result.body.trend.length, 30);
  assert.ok(Array.isArray(result.body.topResources));
  assert.ok(Array.isArray(result.body.heatmap));
  assert.ok(Array.isArray(result.body.regions));
  assert.equal(typeof result.body.summary.onlineUsers, 'number');
  assert.equal(typeof result.body.summary.aiUses, 'number');
  assert.equal(typeof result.body.ownership.averagePersonalResources, 'number');
  assert.equal(result.body.summary.opens, 2);
  assert.equal(result.body.ai.summary.totalTokens, 140);
  assert.equal(result.body.ai.summary.averageFirstTokenMs, 85);
  assert.equal(result.body.ai.summary.peakRpm, 1);
  assert.equal(result.body.ai.summary.p95LatencyMs, 320);
  assert.equal(result.body.ai.summary.p95FirstTokenMs, 85);
  assert.equal(result.body.adoption.summary.dau, 2);
  assert.ok(Array.isArray(result.body.adoption.cohorts));
  assert.equal(result.body.resourceQuality.health.total, 4);
  assert.ok(Array.isArray(result.body.resourceQuality.matrix));
  assert.ok(Array.isArray(result.body.resourceQuality.healthTrend));
  assert.equal(result.body.search.available, true);
  assert.equal(result.body.collaboration.available, false);
  assert.deepEqual(result.body.access.regionCoverage, { total:2, known:1, unknown:1, rate:50, source:'legacy', sources:{proxyHeader:0,geoIpDatabase:0,legacy:1} });
  assert.deepEqual(result.body.access.cityCoverage, { total:2, known:1, unknown:1, rate:50 });
  assert.deepEqual(result.body.access.chinaCityCoverage, { total:1, known:1, unknown:0, rate:100 });
  assert.deepEqual(result.body.access.cities, [{ name:'Jinan', countryCode:'CN', value:1, uniqueVisitors:1 }]);

  result = await request(`/api/admin/analytics/summary?days=30&scope=personal&ownerId=${member.id}`);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.filters.scope, 'personal');
  assert.equal(result.body.filters.ownerId, member.id);
  assert.equal(result.body.summary.opens, 1);
  assert.equal(result.body.summary.resources, 1);
  assert.equal(result.body.ai.summary.totalTokens, 140);
  assert.equal(result.body.collaboration.available, true);

  result = await request('/api/admin/analytics/summary?days=30&scope=public');
  assert.equal(result.response.status, 200);
  assert.equal(result.body.summary.opens, 1);
  assert.equal(result.body.ai.summary.requests, 0);
  assert.equal(result.body.access.regionCoverage.rate, 100);

  result = await request('/api/admin/analytics/users');
  assert.equal(result.response.status, 200);
  assert.ok(result.body.items.some((row) => row.id === member.id && row.resourceCount === 1));

  result = await request(`/api/admin/users/${member.id}`, { method: 'PATCH', body: JSON.stringify({ username: 'member-renamed', displayName: 'Renamed Member', status: 'disabled' }) });
  assert.equal(result.response.status, 409);
  assert.equal(result.body.code, 'USERNAME_IMMUTABLE');

  result = await request(`/api/admin/users/${member.id}`, { method: 'PATCH', body: JSON.stringify({ displayName: 'Renamed Member', status: 'disabled' }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.user.username, 'member');
  assert.equal(result.body.user.status, 'disabled');

  result = await request(`/api/admin/users/${member.id}`, { method: 'DELETE' });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body, { ok: true });
  assert.equal(db.prepare('SELECT COUNT(*) count FROM users WHERE id=?').get(member.id).count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM items WHERE owner_id=?").get(member.id).count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM categories WHERE owner_id=?").get(member.id).count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM ai_plans WHERE actor_user_id=? OR realm_owner_id=?').get(member.id, member.id).count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM security_audit_events WHERE actor_user_id=?').get(member.id).count, 0);
});

test.after(() => db.close());
