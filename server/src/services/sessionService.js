const crypto = require('crypto');
const db = require('../db');

const COOKIE_NAME = 'navpilot_session';
const IDLE_MS = 24 * 60 * 60 * 1000;
const ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function parseCookies(header = '') { return Object.fromEntries(header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => { const index = part.indexOf('='); return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))]; })); }
function cookieOptions(maxAge = ABSOLUTE_MS) { return { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge }; }

function createSession(userId, { userAgent = '', ipPrefix = '', now = Date.now() } = {}) {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO sessions(id,user_id,token_hash,created_at,last_seen_at,idle_expires_at,absolute_expires_at,user_agent,ip_prefix)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(id, userId, hashToken(rawToken), now, now, now + IDLE_MS, now + ABSOLUTE_MS, String(userAgent).slice(0, 300), String(ipPrefix).slice(0, 80));
  return { id, rawToken, maxAge: ABSOLUTE_MS };
}

function getSession(rawToken, now = Date.now()) {
  if (!rawToken) return null;
  const row = db.prepare(`SELECT sessions.*,users.username,users.display_name,users.avatar_url,users.phone,users.email,users.preferences_json,users.role,users.status,users.must_change_password
    FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=?`).get(hashToken(rawToken));
  if (!row || row.revoked_at || row.status !== 'active' || row.idle_expires_at <= now || row.absolute_expires_at <= now) return null;
  if (now - row.last_seen_at > 5 * 60 * 1000) db.prepare('UPDATE sessions SET last_seen_at=?,idle_expires_at=? WHERE id=?').run(now, Math.min(now + IDLE_MS, row.absolute_expires_at), row.id);
  return row;
}

function revokeSession(rawToken, now = Date.now()) { if (rawToken) db.prepare('UPDATE sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL').run(now, hashToken(rawToken)); }
function revokeAllSessions(userId, now = Date.now()) { db.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(now, userId); }
function cleanupSessions(now = Date.now()) { return db.prepare('DELETE FROM sessions WHERE revoked_at IS NOT NULL OR idle_expires_at<=? OR absolute_expires_at<=?').run(now, now).changes; }
function getTokenFromRequest(req) { return parseCookies(req.headers.cookie || '')[COOKIE_NAME] || ''; }
function setSessionCookie(res, token, maxAge) { res.cookie(COOKIE_NAME, token, cookieOptions(maxAge)); }
function clearSessionCookie(res) { res.clearCookie(COOKIE_NAME, cookieOptions(0)); }

module.exports = { COOKIE_NAME, IDLE_MS, ABSOLUTE_MS, createSession, getSession, revokeSession, revokeAllSessions, cleanupSessions, getTokenFromRequest, setSessionCookie, clearSessionCookie, hashToken };
