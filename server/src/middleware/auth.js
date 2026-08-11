const { getSession, getTokenFromRequest } = require('../services/sessionService');
const { sanitizeUser } = require('../services/authService');
const { audit } = require('../services/eventService');
const { PERMISSIONS, assertPermission, assertRealmPermission } = require('../services/authorizationService');

function optionalSession(req, res, next) {
  const token = getTokenFromRequest(req);
  const session = getSession(token);
  req.auth = session ? { sessionId: session.id, token, user: sanitizeUser({ id: session.user_id, username: session.username, display_name: session.display_name, avatar_url:session.avatar_url,phone:session.phone,email:session.email,preferences_json:session.preferences_json,role: session.role, status: session.status, must_change_password: session.must_change_password }) } : null;
  next();
}

function requireUser(req, res, next) {
  return authorizePermission(req, res, PERMISSIONS.AUTHENTICATED, {}, next);
}

function requireAdmin(req, res, next) {
  return authorizePermission(req, res, PERMISSIONS.ADMIN_MANAGE, {}, next);
}

function recordAuthorizationDenied(req, permission, context = {}) {
  try {
    audit(req, 'authorization.denied', {
      outcome:'failure',
      targetType:context.scope ? `${context.scope}_space` : 'permission',
      metadata:{ permission, scope:context.scope || null, method:req.method, path:req.originalUrl || req.url },
    });
  } catch { /* an audit failure must not change the authorization decision */ }
}

function rejectAuthorization(req, res, error, permission, context = {}) {
  if (error.status === 403) recordAuthorizationDenied(req, permission, context);
  return res.status(error.status || 403).json({ code:error.code || 'FORBIDDEN', error:error.message });
}

function authorizePermission(req, res, permission, context, next) {
  try {
    assertPermission(req.auth?.user, permission, context || {});
    return next();
  } catch (error) {
    return rejectAuthorization(req, res, error, permission, context);
  }
}

function authorizeRealm(req, res, current, access, next) {
  try {
    assertRealmPermission(req.auth?.user, current, access);
    return next();
  } catch (error) {
    const permission = current?.scope ? `${current.scope}.${access}` : 'realm.invalid';
    return rejectAuthorization(req, res, error, permission, { scope:current?.scope });
  }
}

function requirePasswordChanged(req, res, next) {
  if (req.auth?.user?.mustChangePassword) return res.status(403).json({ code: 'PASSWORD_CHANGE_REQUIRED', error: '请先修改临时密码' });
  return next();
}

module.exports = { optionalSession, requireUser, requireAdmin, requireAdminStrict: requireAdmin, requirePasswordChanged, authorizePermission, authorizeRealm, recordAuthorizationDenied };
