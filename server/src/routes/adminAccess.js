const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { auditWith } = require('../services/eventService');
const { createAccessControlService } = require('../services/accessControlService');
const { checkAndPersist, checkItems } = require('../services/healthCheck');
const { availabilityForItems, clampDays } = require('../services/availabilityService');

const router = express.Router();
const access = createAccessControlService(db);

router.get('/availability', (req, res) => {
  const startedAt = Date.now();
  try {
    const scope = ['all', 'public', 'personal'].includes(req.query.scope) ? req.query.scope : 'all';
    const params = [], clauses = [];
    if (scope !== 'all') { clauses.push('i.scope=?'); params.push(scope); }
    const items = db.prepare(`SELECT i.*,c.name categoryName,u.display_name ownerName
      FROM items i LEFT JOIN categories c ON c.id=i.category_id LEFT JOIN users u ON u.id=i.owner_id
      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY i.name COLLATE NOCASE`).all(...params);
    let stats = null;
    const values = availabilityForItems(db, items, { days:req.query.days, onStats:(value) => { stats = value; } });
    const summary = { total:values.length, monitored:values.filter((item) => item.checkEnabled).length, online:0, degraded:0, offline:0, unknown:0 };
    values.forEach((item) => { summary[item.checkEnabled ? item.state : 'unknown'] += 1; });
    const durationMs = Date.now() - startedAt;
    if (durationMs >= 250) console.log(`[availability] admin resources=${stats?.resourceCount || items.length} aggregateRows=${stats?.aggregateRows || 0} days=${stats?.days || clampDays(req.query.days)} durationMs=${durationMs}`);
    return res.json({ days:clampDays(req.query.days), summary, items:values });
  } catch (error) { return fail(res, error, 'AVAILABILITY_LOAD_FAILED'); }
});

router.post('/availability/check-all', async (req, res) => {
  try {
    const scope = ['all', 'public', 'personal'].includes(req.body?.scope) ? req.body.scope : 'all';
    const result = scope === 'all'
      ? await checkItems()
      : await checkItems({ scope, ownerId:scope === 'public' ? null : undefined });
    return res.json(result);
  } catch (error) { return fail(res, error, 'AVAILABILITY_CHECK_FAILED'); }
});

router.post('/availability/:id/check', async (req, res) => {
  try {
    const item = db.prepare('SELECT * FROM items WHERE id=?').get(req.params.id);
    if (!item) return res.status(404).json({ code:'ITEM_NOT_FOUND', error:'条目不存在' });
    return res.json(await checkAndPersist(item, { force:true }));
  } catch (error) { return fail(res, error, 'AVAILABILITY_CHECK_FAILED'); }
});

function fail(res, error, fallback = 'ACCESS_GROUP_FAILED') {
  if (!error.status) console.error(`[admin-access] ${fallback}`,error);
  return res.status(error.status || 500).json({ code: error.code || fallback, error: error.status ? error.message : '授权组操作失败' });
}

function groupAuthorization(groupId) {
  const resources = db.prepare(`SELECT i.id,i.name,i.url,i.visibility,i.category_id categoryId,c.name categoryName,
    g.expires_at_ms expiresAtMs
    FROM item_access_group_grants g JOIN items i ON i.id=g.item_id
    LEFT JOIN categories c ON c.id=i.category_id WHERE g.group_id=?
    ORDER BY i.name COLLATE NOCASE`).all(groupId);
  const categories = db.prepare(`SELECT c.id,c.name,c.parent_id parentId,g.expires_at_ms expiresAtMs
    FROM category_access_group_defaults g JOIN categories c ON c.id=g.category_id
    WHERE g.group_id=? ORDER BY c.name COLLATE NOCASE`).all(groupId);
  return {
    resources,
    categories,
    summary: {
      resourceCount: resources.length,
      categoryCount: categories.length,
      activeCount: [...resources, ...categories].filter((grant) => grant.expiresAtMs == null || grant.expiresAtMs > Date.now()).length,
    },
  };
}

function groupView(row, detail = false) {
  const value = {
    id: row.id, name: row.name, description: row.description, version: row.version,
    memberCount: row.member_count || 0, resourceCount: row.resource_count || 0,
    activeResourceCount: row.active_resource_count || 0,
    createdAtMs: row.created_at_ms, updatedAtMs: row.updated_at_ms,
  };
  if (detail) {
    value.members = db.prepare(`SELECT u.id,u.username,u.display_name displayName,u.role,u.status
      FROM access_group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=? ORDER BY u.display_name,u.username`).all(row.id);
    value.authorization = groupAuthorization(row.id);
  }
  return value;
}

const groupSelect = `SELECT g.*,
  (SELECT COUNT(*) FROM access_group_members m WHERE m.group_id=g.id) member_count,
  (SELECT COUNT(*) FROM item_access_group_grants ig WHERE ig.group_id=g.id) resource_count,
  (SELECT COUNT(*) FROM item_access_group_grants ig WHERE ig.group_id=g.id AND (ig.expires_at_ms IS NULL OR ig.expires_at_ms>CAST(strftime('%s','now') AS INTEGER)*1000)) active_resource_count
  FROM access_groups g`;

router.get('/access-groups', (req, res) => {
  const groups = db.prepare(`${groupSelect} ORDER BY g.name COLLATE NOCASE`).all().map((row) => groupView(row));
  const stats = db.prepare(`SELECT
    (SELECT COUNT(*) FROM access_groups) groupCount,
    (SELECT COUNT(*) FROM access_group_members) membershipCount,
    (SELECT COUNT(DISTINCT item_id) FROM item_access_group_grants) resourceCount`).get();
  res.json({ groups, stats });
});

router.post('/access-groups', (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim().slice(0, 500);
    if (!name || name.length > 80) throw Object.assign(new Error('组名不能为空且不能超过 80 个字符'), { code: 'INVALID_ACCESS_GROUP_NAME', status: 400 });
    const id = crypto.randomUUID(), now = Date.now();
    db.transaction(() => {
      db.prepare('INSERT INTO access_groups(id,name,description,created_by_user_id,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?,?)').run(id, name, description, req.auth.user.id, now, now);
      access.bumpRevision();
      auditWith(db, req, 'access_group.created', { targetType: 'access_group', targetId: id, metadata: { name } });
    })();
    const row = db.prepare(`${groupSelect} WHERE g.id=?`).get(id);
    return res.status(201).json(groupView(row, true));
  } catch (error) {
    if (String(error.code).includes('CONSTRAINT')) return res.status(409).json({ code: 'ACCESS_GROUP_NAME_CONFLICT', error: '授权组名称已存在' });
    return fail(res, error);
  }
});

router.get('/access-groups/:id', (req, res) => {
  const row = db.prepare(`${groupSelect} WHERE g.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ code: 'ACCESS_GROUP_NOT_FOUND', error: '授权组不存在' });
  return res.json(groupView(row, true));
});

router.patch('/access-groups/:id', (req, res) => {
  try {
    const current = db.prepare('SELECT * FROM access_groups WHERE id=?').get(req.params.id);
    if (!current) return res.status(404).json({ code: 'ACCESS_GROUP_NOT_FOUND', error: '授权组不存在' });
    if (req.body?.expectedVersion != null && Number(req.body.expectedVersion) !== current.version)
      return res.status(409).json({ code: 'VERSION_CONFLICT', error: '授权组已被其他人修改，请刷新后重试' });
    const name = String(req.body?.name ?? current.name).trim(), description = String(req.body?.description ?? current.description).trim().slice(0, 500);
    if (!name || name.length > 80) return res.status(400).json({ code: 'INVALID_ACCESS_GROUP_NAME', error: '组名不能为空且不能超过 80 个字符' });
    db.transaction(() => {
      db.prepare('UPDATE access_groups SET name=?,description=?,version=version+1,updated_at_ms=? WHERE id=?').run(name, description, Date.now(), current.id);
      access.bumpRevision();
      auditWith(db, req, 'access_group.updated', { targetType: 'access_group', targetId: current.id, metadata: { before: { name: current.name, description: current.description }, after: { name, description } } });
    })();
    return res.json(groupView(db.prepare(`${groupSelect} WHERE g.id=?`).get(current.id), true));
  } catch (error) {
    if (String(error.code).includes('CONSTRAINT')) return res.status(409).json({ code: 'ACCESS_GROUP_NAME_CONFLICT', error: '授权组名称已存在' });
    return fail(res, error);
  }
});

router.put('/access-groups/:id/members', (req, res) => {
  try {
    const current = db.prepare('SELECT * FROM access_groups WHERE id=?').get(req.params.id);
    if (!current) return res.status(404).json({ code: 'ACCESS_GROUP_NOT_FOUND', error: '授权组不存在' });
    if (Number(req.body?.expectedVersion) !== current.version) return res.status(409).json({ code: 'VERSION_CONFLICT', error: '授权组已被其他人修改，请刷新后重试' });
    const ids = [...new Set((Array.isArray(req.body?.userIds) ? req.body.userIds : []).map(String))];
    if (ids.length > 1000) return res.status(400).json({ code: 'TOO_MANY_GROUP_MEMBERS', error: '单个授权组最多包含 1000 名用户' });
    const placeholders = ids.map(() => '?').join(',');
    const valid = ids.length ? db.prepare(`SELECT id FROM users WHERE status!='pending_claim' AND role='user' AND id IN (${placeholders})`).all(...ids).map((row) => row.id) : [];
    if (valid.length !== ids.length) return res.status(400).json({ code: 'ADMIN_GROUP_MEMBERSHIP_UNNECESSARY', error: '授权组只能添加普通用户；管理员默认拥有全部资源权限' });
    const before = db.prepare('SELECT user_id FROM access_group_members WHERE group_id=?').all(current.id).map((row) => row.user_id);
    db.transaction(() => {
      db.prepare('DELETE FROM access_group_members WHERE group_id=?').run(current.id);
      const insert = db.prepare('INSERT INTO access_group_members(group_id,user_id,added_by_user_id,created_at_ms) VALUES(?,?,?,?)');
      const now = Date.now(); valid.forEach((id) => insert.run(current.id, id, req.auth.user.id, now));
      db.prepare('UPDATE access_groups SET version=version+1,updated_at_ms=? WHERE id=?').run(now, current.id);
      access.bumpRevision();
      auditWith(db, req, 'access_group.members_updated', { targetType: 'access_group', targetId: current.id, metadata: { beforeUserIds: before, afterUserIds: valid } });
    })();
    return res.json(groupView(db.prepare(`${groupSelect} WHERE g.id=?`).get(current.id), true));
  } catch (error) { return fail(res, error); }
});

router.delete('/access-groups/:id', (req, res) => {
  const current = db.prepare('SELECT * FROM access_groups WHERE id=?').get(req.params.id);
  if (!current) return res.status(404).json({ code: 'ACCESS_GROUP_NOT_FOUND', error: '授权组不存在' });
  const affected = db.prepare(`SELECT COUNT(DISTINCT ig.item_id) resourceCount,
    COUNT(DISTINCT CASE WHEN i.visibility='restricted' AND NOT EXISTS(SELECT 1 FROM item_access_user_grants u WHERE u.item_id=i.id AND (u.expires_at_ms IS NULL OR u.expires_at_ms>?)) AND NOT EXISTS(SELECT 1 FROM item_access_group_grants other WHERE other.item_id=i.id AND other.group_id<>? AND (other.expires_at_ms IS NULL OR other.expires_at_ms>?)) THEN i.id END) adminOnlyCount
    FROM item_access_group_grants ig JOIN items i ON i.id=ig.item_id WHERE ig.group_id=?`).get(Date.now(), current.id, Date.now(), current.id);
  if (!req.body?.confirm) return res.status(409).json({ code: 'ACCESS_GROUP_DELETE_CONFIRM_REQUIRED', error: '请确认删除授权组', impact: affected });
  db.transaction(() => {
    auditWith(db, req, 'access_group.deleted', { targetType: 'access_group', targetId: current.id, metadata: { name: current.name, ...affected } });
    db.prepare('DELETE FROM access_groups WHERE id=?').run(current.id);
    access.bumpRevision();
  })();
  return res.json({ ok: true, impact: affected });
});

router.get('/access-principals', (req, res) => {
  const q = `%${String(req.query.q || '').trim().slice(0, 80)}%`;
  const users = db.prepare("SELECT id,username,display_name displayName,'user' type FROM users WHERE status='active' AND role='user' AND (username LIKE ? OR display_name LIKE ?) ORDER BY display_name LIMIT 50").all(q, q);
  const groups = db.prepare("SELECT id,name displayName,'group' type FROM access_groups WHERE name LIKE ? ORDER BY name LIMIT 50").all(q);
  res.json({ users, groups, principals: [...groups, ...users] });
});

module.exports = router;
