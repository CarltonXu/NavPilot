const crypto = require('crypto');
const { promisify } = require('util');
const db = require('../db');

const scryptAsync = promisify(crypto.scrypt);
const PARAMS = { N: 16384, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function validateUsername(value) {
  const username = normalizeUsername(value);
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) {
    const error = new Error('用户名需为 3-64 位字母、数字、点、下划线或连字符');
    error.code = 'INVALID_USERNAME'; error.status = 400; throw error;
  }
  return username;
}

function validatePassword(value, minLength = 10) {
  const password = String(value || '');
  if (password.length < minLength || password.length > 256) {
    const error = new Error(`密码长度必须为 ${minLength}-256 位`);
    error.code = 'INVALID_PASSWORD'; error.status = 400; throw error;
  }
  return password;
}

async function hashPassword(password, minLength = 10) {
  const value = validatePassword(password, minLength);
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(value, salt, PARAMS.keylen, PARAMS);
  return { hash: hash.toString('base64'), salt: salt.toString('base64'), params: JSON.stringify(PARAMS) };
}

async function verifyPassword(password, user) {
  const salt = user?.password_salt ? Buffer.from(user.password_salt, 'base64') : crypto.randomBytes(16);
  const expected = user?.password_hash ? Buffer.from(user.password_hash, 'base64') : crypto.randomBytes(PARAMS.keylen);
  const params = user?.password_params ? JSON.parse(user.password_params) : PARAMS;
  const actual = await scryptAsync(String(password || ''), salt, params.keylen || PARAMS.keylen, params);
  return Boolean(user?.password_hash) && expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

async function createUser({ username, displayName, password, role = 'user', mustChangePassword = true, minPasswordLength = 10 }) {
  const normalized = validateUsername(username);
  const display = String(displayName || '').trim();
  if (!display || display.length > 80) { const error = new Error('显示名不能为空且不能超过 80 个字符'); error.code = 'INVALID_DISPLAY_NAME'; error.status = 400; throw error; }
  if (!['user', 'admin'].includes(role)) { const error = new Error('无效角色'); error.code = 'INVALID_ROLE'; error.status = 400; throw error; }
  const material = await hashPassword(password, minPasswordLength);
  const id = crypto.randomUUID();
  try {
    db.prepare(`INSERT INTO users(id,username,display_name,password_hash,password_salt,password_params,role,status,must_change_password)
      VALUES(?,?,?,?,?,?,?,'active',?)`).run(id, normalized, display, material.hash, material.salt, material.params, role, mustChangePassword ? 1 : 0);
  } catch (error) {
    if (String(error.code).includes('CONSTRAINT')) { const conflict = new Error('用户名已存在'); conflict.code = 'USERNAME_CONFLICT'; conflict.status = 409; throw conflict; }
    throw error;
  }
  return sanitizeUser(db.prepare('SELECT * FROM users WHERE id=?').get(id));
}

function sanitizeUser(user) {
  if (!user) return null;
  let preferences={};try{preferences=JSON.parse(user.preferences_json||'{}');}catch{/* keep empty */}
  return { id: user.id, username: user.username, displayName: user.display_name, avatarUrl:user.avatar_url||'', phone:user.phone||'', email:user.email||'', preferences, role: user.role, status: user.status, mustChangePassword: Boolean(user.must_change_password) };
}

async function authenticate(username, password) {
  const normalized = normalizeUsername(username);
  const user = db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE').get(normalized);
  const valid = await verifyPassword(password, user);
  if (!valid || user.status !== 'active') return null;
  db.prepare("UPDATE users SET last_login_at=datetime('now'),updated_at=datetime('now') WHERE id=?").run(user.id);
  return user;
}

async function updatePassword(userId, newPassword, { revokeSessions = true } = {}) {
  const material = await hashPassword(newPassword);
  db.transaction(() => {
    db.prepare("UPDATE users SET password_hash=?,password_salt=?,password_params=?,must_change_password=0,password_changed_at=datetime('now'),updated_at=datetime('now') WHERE id=?").run(material.hash, material.salt, material.params, userId);
    if (revokeSessions) db.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(Date.now(), userId);
  })();
}

async function bootstrapAdmin() {
  const adminCount = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin' AND status='active'").get().count;
  if (adminCount) return null;
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!username || !password) return null;
  return createUser({ username, displayName: process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME || username, password, role: 'admin', mustChangePassword: true });
}

module.exports = { normalizeUsername, validateUsername, validatePassword, hashPassword, verifyPassword, createUser, sanitizeUser, authenticate, updatePassword, bootstrapAdmin };
