const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAdmin, requirePasswordChanged } = require('../middleware/auth');
const { createUser, updatePassword, sanitizeUser, validateUsername } = require('../services/authService');
const { revokeAllSessions } = require('../services/sessionService');
const { audit } = require('../services/eventService');

const router = express.Router();
router.use(requireAdmin, requirePasswordChanged);

function auditUser(user) { return user ? { username:user.username, displayName:user.display_name || user.displayName, role:user.role, status:user.status } : null; }

router.get('/users', (req, res) => {
  res.json(db.prepare("SELECT id,username,display_name AS displayName,role,status,must_change_password AS mustChangePassword,created_at AS createdAt,last_login_at AS lastLoginAt FROM users WHERE status!='pending_claim' ORDER BY created_at").all());
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
  return res.json({ user, stats });
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
  try { db.prepare("UPDATE users SET username=?,display_name=?,role=?,status=?,updated_at=datetime('now') WHERE id=?").run(username, displayName, role, status, target.id); }
  catch (error) { if (String(error.code).includes('CONSTRAINT')) return res.status(409).json({code:'USERNAME_CONFLICT',error:'用户名已存在'}); throw error; }
  if (status === 'disabled' || role !== target.role) revokeAllSessions(target.id);
  const updated = db.prepare('SELECT * FROM users WHERE id=?').get(target.id);
  audit(req, 'user.updated', { targetType:'user', targetId:target.id, metadata:{ before:auditUser(target), after:auditUser(updated), changedFields:Object.keys(req.body) } });
  res.json({ user: sanitizeUser(updated) });
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
