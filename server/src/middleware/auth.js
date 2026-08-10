const { getSession, getTokenFromRequest } = require('../services/sessionService');
const { sanitizeUser } = require('../services/authService');

function optionalSession(req, res, next) {
  const token = getTokenFromRequest(req);
  const session = getSession(token);
  req.auth = session ? { sessionId: session.id, token, user: sanitizeUser({ id: session.user_id, username: session.username, display_name: session.display_name, avatar_url:session.avatar_url,phone:session.phone,email:session.email,preferences_json:session.preferences_json,role: session.role, status: session.status, must_change_password: session.must_change_password }) } : null;
  next();
}

function requireUser(req, res, next) {
  if (!req.auth?.user) return res.status(401).json({ code: 'AUTH_REQUIRED', error: '请先登录' });
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.auth?.user) return res.status(401).json({ code: 'AUTH_REQUIRED', error: '请先登录' });
  if (req.auth.user.role !== 'admin') return res.status(403).json({ code: 'FORBIDDEN', error: '没有管理员权限' });
  return next();
}

function requirePasswordChanged(req, res, next) {
  if (req.auth?.user?.mustChangePassword) return res.status(403).json({ code: 'PASSWORD_CHANGE_REQUIRED', error: '请先修改临时密码' });
  return next();
}

module.exports = { optionalSession, requireUser, requireAdmin, requireAdminStrict: requireAdmin, requirePasswordChanged };
