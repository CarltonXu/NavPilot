const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAdmin, requirePasswordChanged } = require('../middleware/auth');
const { createUser, updatePassword, sanitizeUser, validateUsername } = require('../services/authService');
const { revokeAllSessions } = require('../services/sessionService');
const { audit } = require('../services/eventService');
const { createAccessControlService } = require('../services/accessControlService');
const adminAccessRouter = require('./adminAccess');

const router = express.Router();
const access = createAccessControlService(db);
router.use(requireAdmin, requirePasswordChanged);
router.use('/', adminAccessRouter);

function auditUser(user) { return user ? { username:user.username, displayName:user.display_name || user.displayName, role:user.role, status:user.status } : null; }

function accessGroupsForUser(userId) {
  return db.prepare(`SELECT g.id,g.name,g.description,g.version
    FROM access_group_members m JOIN access_groups g ON g.id=m.group_id
    WHERE m.user_id=? ORDER BY g.name COLLATE NOCASE`).all(userId);
}

function authorizationForUser(userId) {
  const directResources = db.prepare(`SELECT i.id,i.name,i.url,i.visibility,i.category_id categoryId,c.name categoryName,
    g.expires_at_ms expiresAtMs
    FROM item_access_user_grants g JOIN items i ON i.id=g.item_id
    LEFT JOIN categories c ON c.id=i.category_id WHERE g.user_id=?
    ORDER BY i.name COLLATE NOCASE`).all(userId);
  const groupResources = db.prepare(`SELECT i.id,i.name,i.url,i.visibility,i.category_id categoryId,c.name categoryName,
    g.expires_at_ms expiresAtMs,a.id groupId,a.name groupName
    FROM access_group_members m JOIN access_groups a ON a.id=m.group_id
    JOIN item_access_group_grants g ON g.group_id=a.id JOIN items i ON i.id=g.item_id
    LEFT JOIN categories c ON c.id=i.category_id WHERE m.user_id=?
    ORDER BY i.name COLLATE NOCASE,a.name COLLATE NOCASE`).all(userId);
  const directCategories = db.prepare(`SELECT c.id,c.name,c.parent_id parentId,g.expires_at_ms expiresAtMs
    FROM category_access_user_defaults g JOIN categories c ON c.id=g.category_id
    WHERE g.user_id=? ORDER BY c.name COLLATE NOCASE`).all(userId);
  const groupCategories = db.prepare(`SELECT c.id,c.name,c.parent_id parentId,g.expires_at_ms expiresAtMs,
    a.id groupId,a.name groupName
    FROM access_group_members m JOIN access_groups a ON a.id=m.group_id
    JOIN category_access_group_defaults g ON g.group_id=a.id JOIN categories c ON c.id=g.category_id
    WHERE m.user_id=? ORDER BY c.name COLLATE NOCASE,a.name COLLATE NOCASE`).all(userId);
  const uniqueResourceIds = new Set([...directResources, ...groupResources].map((resource) => resource.id));
  return {
    directResources, groupResources, directCategories, groupCategories,
    summary: {
      directResourceCount: directResources.length,
      groupResourceCount: groupResources.length,
      resourceCount: uniqueResourceIds.size,
      categoryCount: directCategories.length + groupCategories.length,
    },
  };
}

function sameIds(left, right) {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort(), sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

router.get('/users', (req, res) => {
  const users = db.prepare("SELECT id,username,display_name AS displayName,role,status,must_change_password AS mustChangePassword,created_at AS createdAt,last_login_at AS lastLoginAt FROM users WHERE status!='pending_claim' ORDER BY created_at").all();
  const memberships = db.prepare(`SELECT m.user_id userId,g.id,g.name,g.description
    FROM access_group_members m JOIN access_groups g ON g.id=m.group_id
    JOIN users u ON u.id=m.user_id WHERE u.status!='pending_claim'
    ORDER BY g.name COLLATE NOCASE`).all();
  const byUser = new Map();
  memberships.forEach((group) => {
    const list = byUser.get(group.userId) || [];
    list.push({ id:group.id, name:group.name, description:group.description });
    byUser.set(group.userId, list);
  });
  res.json(users.map((user) => {
    const accessGroups = byUser.get(user.id) || [];
    return { ...user, accessGroups, accessGroupCount:accessGroups.length };
  }));
});

router.get('/users/:id', (req, res) => {
  const user = db.prepare("SELECT id,username,display_name AS displayName,role,status,must_change_password AS mustChangePassword,created_at AS createdAt,updated_at AS updatedAt,password_changed_at AS passwordChangedAt,last_login_at AS lastLoginAt FROM users WHERE id=? AND status!='pending_claim'").get(req.params.id);
  if (!user) return res.status(404).json({ code:'USER_NOT_FOUND', error:'用户不存在' });
  const stats = {
    personalItems:db.prepare("SELECT COUNT(*) count FROM items WHERE scope='personal' AND owner_id=?").get(user.id).count,
    personalCategories:db.prepare("SELECT COUNT(*) count FROM categories WHERE scope='personal' AND owner_id=?").get(user.id).count,
    activeSessions:db.prepare('SELECT COUNT(*) count FROM sessions WHERE user_id=? AND revoked_at IS NULL AND absolute_expires_at>?').get(user.id,Date.now()).count,
    aiPlans:db.prepare('SELECT COUNT(*) count FROM ai_plans WHERE actor_user_id=?').get(user.id).count,
  };
  const accessGroups = accessGroupsForUser(user.id);
  const availableAccessGroups = db.prepare(`SELECT g.id,g.name,g.description,g.version,
    (SELECT COUNT(*) FROM access_group_members m WHERE m.group_id=g.id) memberCount
    FROM access_groups g ORDER BY g.name COLLATE NOCASE`).all();
  const authorization = authorizationForUser(user.id);
  return res.json({ user, stats, accessGroups, availableAccessGroups, authorization });
});

router.post('/users', async (req, res) => {
  try {
    const temporaryPassword = req.body.temporaryPassword || crypto.randomBytes(12).toString('base64url');
    const user = await createUser({ username: req.body.username, displayName: req.body.displayName, password: temporaryPassword, role: req.body.role || 'user', mustChangePassword: true });
    audit(req, 'user.created', { targetType:'user', targetId:user.id, metadata:{ after:auditUser(user) } });
    return res.status(201).json({ user, temporaryPassword });
  } catch (error) {
    return res.status(error.status || 500).json({ code:error.code || 'USER_CREATE_FAILED', error:error.status ? error.message : '账户创建失败' });
  }
});

router.patch('/users/:id', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!target || target.status === 'pending_claim') return res.status(404).json({ code: 'USER_NOT_FOUND', error: '用户不存在' });
  const role = req.body.role ?? target.role;
  const status = req.body.status ?? target.status;
  if (!['user', 'admin'].includes(role) || !['active', 'disabled'].includes(status)) return res.status(400).json({ code: 'INVALID_USER_UPDATE', error: '无效的用户状态或角色' });
  if (target.role === 'admin' && target.status === 'active' && (role !== 'admin' || status !== 'active')) {
    const admins = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin' AND status='active'").get().count;
    if (admins <= 1) return res.status(409).json({ code: 'LAST_ADMIN_REQUIRED', error: '必须保留至少一个有效管理员' });
  }
  const displayName = String(req.body.displayName ?? target.display_name).trim();
  if (!displayName || displayName.length > 80) return res.status(400).json({ code:'INVALID_DISPLAY_NAME', error:'显示名不能为空且不能超过 80 个字符' });
  if (req.body.username !== undefined && String(req.body.username).toLowerCase() !== String(target.username).toLowerCase()) return res.status(409).json({code:'USERNAME_IMMUTABLE',error:'用户名注册后不允许修改'});
  const username=target.username;
  let accessGroupIds = null, currentAccessGroupIds = null;
  if (req.body.accessGroupIds !== undefined) {
    if (!Array.isArray(req.body.accessGroupIds)) return res.status(400).json({ code:'INVALID_USER_ACCESS_GROUPS', error:'授权组参数格式无效' });
    accessGroupIds = [...new Set(req.body.accessGroupIds.map(String))];
    if (accessGroupIds.length > 500) return res.status(400).json({ code:'TOO_MANY_USER_ACCESS_GROUPS', error:'单个账户最多加入 500 个授权组' });
    const placeholders = accessGroupIds.map(() => '?').join(',');
    const validIds = accessGroupIds.length ? db.prepare(`SELECT id FROM access_groups WHERE id IN (${placeholders})`).all(...accessGroupIds).map((row) => row.id) : [];
    if (validIds.length !== accessGroupIds.length) return res.status(400).json({ code:'ACCESS_GROUP_NOT_FOUND', error:'选择的授权组不存在或已删除' });
    currentAccessGroupIds = accessGroupsForUser(target.id).map((group) => group.id);
    if (Array.isArray(req.body.expectedAccessGroupIds) && !sameIds(currentAccessGroupIds, [...new Set(req.body.expectedAccessGroupIds.map(String))]))
      return res.status(409).json({ code:'VERSION_CONFLICT', error:'账户的授权组关系已被其他管理员修改，请刷新后重试' });
  }
  if (role === 'admin') {
    if (accessGroupIds?.length) return res.status(400).json({ code:'ADMIN_GROUP_MEMBERSHIP_UNNECESSARY', error:'管理员默认拥有全部资源权限，无需加入授权组' });
    if (currentAccessGroupIds === null) currentAccessGroupIds = accessGroupsForUser(target.id).map((group) => group.id);
    accessGroupIds = [];
  }
  try {
    db.transaction(() => {
      db.prepare("UPDATE users SET username=?,display_name=?,role=?,status=?,updated_at=datetime('now') WHERE id=?").run(username, displayName, role, status, target.id);
      if (accessGroupIds && !sameIds(currentAccessGroupIds, accessGroupIds)) {
        const before = new Set(currentAccessGroupIds), after = new Set(accessGroupIds);
        const removed = currentAccessGroupIds.filter((id) => !after.has(id));
        const added = accessGroupIds.filter((id) => !before.has(id));
        const remove = db.prepare('DELETE FROM access_group_members WHERE group_id=? AND user_id=?');
        removed.forEach((groupId) => remove.run(groupId, target.id));
        const insert = db.prepare('INSERT INTO access_group_members(group_id,user_id,added_by_user_id,created_at_ms) VALUES(?,?,?,?)');
        const now = Date.now();
        added.forEach((groupId) => insert.run(groupId, target.id, req.auth.user.id, now));
        const touch = db.prepare('UPDATE access_groups SET version=version+1,updated_at_ms=? WHERE id=?');
        [...removed, ...added].forEach((groupId) => touch.run(now, groupId));
        access.bumpRevision();
      }
      const updated = db.prepare('SELECT * FROM users WHERE id=?').get(target.id);
      audit(req, 'user.updated', { targetType:'user', targetId:target.id, metadata:{ before:auditUser(target), after:auditUser(updated), changedFields:Object.keys(req.body), beforeAccessGroupIds:currentAccessGroupIds, afterAccessGroupIds:accessGroupIds } });
    })();
  }
  catch (error) { if (String(error.code).includes('CONSTRAINT')) return res.status(409).json({code:'USERNAME_CONFLICT',error:'用户名已存在'}); throw error; }
  if (status === 'disabled' || role !== target.role) revokeAllSessions(target.id);
  const updated = db.prepare('SELECT * FROM users WHERE id=?').get(target.id);
  const accessGroups = accessGroupsForUser(target.id);
  res.json({ user: sanitizeUser(updated), accessGroups, accessGroupCount:accessGroups.length });
});

router.delete('/users/:id', (req, res) => {
  const target = db.prepare("SELECT * FROM users WHERE id=? AND status!='pending_claim'").get(req.params.id);
  if (!target) return res.status(404).json({code:'USER_NOT_FOUND',error:'用户不存在'});
  if (target.id === req.auth.user.id) return res.status(409).json({code:'CANNOT_DELETE_SELF',error:'不能删除当前登录账户'});
  if (target.role === 'admin' && target.status === 'active') {
    const admins=db.prepare("SELECT COUNT(*) count FROM users WHERE role='admin' AND status='active'").get().count;
    if (admins<=1) return res.status(409).json({code:'LAST_ADMIN_REQUIRED',error:'必须保留至少一个有效管理员'});
  }
  db.transaction(() => {
    audit(req,'user.deleted',{targetType:'user',targetId:target.id,metadata:{before:auditUser(target)}});
    db.prepare('UPDATE legacy_spaces SET assigned_to_user_id=NULL WHERE assigned_to_user_id=?').run(target.id);
    db.prepare('UPDATE legacy_spaces SET assigned_by_user_id=NULL WHERE assigned_by_user_id=?').run(target.id);
    db.prepare('UPDATE audit_log SET actor_user_id=NULL WHERE actor_user_id=?').run(target.id);
    db.prepare('UPDATE security_audit_events SET actor_user_id=NULL WHERE actor_user_id=?').run(target.id);
    db.prepare('DELETE FROM command_executions WHERE actor_user_id=?').run(target.id);
    db.prepare('DELETE FROM ai_plans WHERE actor_user_id=? OR realm_owner_id=?').run(target.id,target.id);
    db.prepare('DELETE FROM users WHERE id=?').run(target.id);
  })();
  return res.json({ok:true});
});

router.post('/users/:id/reset-password', async (req, res) => {
  const target = db.prepare("SELECT * FROM users WHERE id=? AND status!='pending_claim'").get(req.params.id);
  if (!target) return res.status(404).json({ code: 'USER_NOT_FOUND', error: '用户不存在' });
  try {
    const temporaryPassword = req.body.temporaryPassword || crypto.randomBytes(12).toString('base64url');
    await updatePassword(target.id, temporaryPassword, { revokeSessions: true });
    db.prepare('UPDATE users SET must_change_password=1 WHERE id=?').run(target.id);
    audit(req, 'user.password_reset', { targetType:'user', targetId:target.id });
    return res.json({ temporaryPassword });
  } catch (error) {
    return res.status(error.status || 500).json({ code:error.code || 'PASSWORD_RESET_FAILED', error:error.status ? error.message : '密码重置失败' });
  }
});

router.get('/legacy-spaces', (req, res) => {
  res.json(db.prepare(`SELECT legacy_spaces.id,legacy_owner_key AS legacyOwnerKey,observed_label AS observedLabel,item_count AS itemCount,
    assigned_to_user_id AS assignedToUserId,assigned_at AS assignedAt FROM legacy_spaces ORDER BY assigned_at IS NOT NULL,observed_label`).all());
});

router.post('/legacy-spaces/:id/assign', (req, res) => {
  const legacy = db.prepare('SELECT * FROM legacy_spaces WHERE id=?').get(req.params.id);
  const target = db.prepare("SELECT * FROM users WHERE id=? AND status='active'").get(req.body.userId);
  if (!legacy || legacy.assigned_to_user_id) return res.status(409).json({ code: 'LEGACY_SPACE_UNAVAILABLE', error: '遗留空间不存在或已分配' });
  if (!target) return res.status(404).json({ code: 'USER_NOT_FOUND', error: '目标用户不存在' });
  const result = db.transaction(() => {
    const sourceCategories = db.prepare("SELECT * FROM categories WHERE scope='personal' AND owner_id=? ORDER BY sort_order,id").all(legacy.pending_user_id);
    const mapping = new Map();
    for (const category of sourceCategories) {
      let destination = db.prepare("SELECT id FROM categories WHERE scope='personal' AND owner_id=? AND name=? COLLATE NOCASE").get(target.id, category.name);
      if (!destination) destination = { id: Number(db.prepare("INSERT INTO categories(name,icon,scope,owner_id,sort_order) VALUES(?,?,'personal',?,?)").run(category.name, category.icon, target.id, category.sort_order).lastInsertRowid) };
      mapping.set(category.id, destination.id);
    }
    for (const [source, destination] of mapping) db.prepare('UPDATE items SET category_id=? WHERE category_id=? AND owner_id=?').run(destination, source, legacy.pending_user_id);
    const movedItems = db.prepare("UPDATE items SET owner_id=? WHERE scope='personal' AND owner_id=?").run(target.id, legacy.pending_user_id).changes;
    db.prepare("DELETE FROM categories WHERE scope='personal' AND owner_id=?").run(legacy.pending_user_id);
    db.prepare("UPDATE legacy_spaces SET assigned_to_user_id=?,assigned_at=datetime('now'),assigned_by_user_id=? WHERE id=?").run(target.id, req.auth.user.id, legacy.id);
    db.prepare("UPDATE users SET status='disabled' WHERE id=?").run(legacy.pending_user_id);
    audit(req, 'legacy_space.assigned', { targetType:'legacy_space', targetId:legacy.id, metadata:{ targetUserId:target.id, movedItems } });
    return movedItems;
  })();
  res.json({ ok: true, movedItems: result });
});

module.exports = router;
