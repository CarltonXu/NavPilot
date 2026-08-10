const express = require('express');
const db = require('../db');
const { authenticate, sanitizeUser, verifyPassword, updatePassword } = require('../services/authService');
const { createSession, revokeSession, revokeAllSessions, getTokenFromRequest, setSessionCookie, clearSessionCookie } = require('../services/sessionService');
const { requireUser } = require('../middleware/auth');
const { audit, analytics } = require('../services/eventService');
const { createUser } = require('../services/authService');

const router = express.Router();
const authAttempts = new Map();
function rateLimited(req, key, limit, windowMs) {
  const now = Date.now(); const bucketKey = `${key}:${req.ip}`; const bucket = (authAttempts.get(bucketKey) || []).filter((time) => now - time < windowMs); bucket.push(now); authAttempts.set(bucketKey,bucket); return bucket.length > limit;
}

router.get('/me', (req, res) => {
  if (!req.auth?.user) return res.json({ authenticated: false });
  return res.json({ authenticated: true, user: req.auth.user });
});

function profileError(code,message){return Object.assign(new Error(message),{code,status:400});}
function cleanProfile(body){
  const displayName=String(body.displayName||'').trim();if(!displayName||displayName.length>80)throw profileError('INVALID_DISPLAY_NAME','显示名不能为空且不能超过 80 个字符');
  const avatarUrl=String(body.avatarUrl||'').trim();if(avatarUrl&&(!/^https?:\/\//i.test(avatarUrl)&&!/^\/[a-zA-Z0-9/_-]+(?:\.[a-zA-Z0-9]+)?$/.test(avatarUrl)))throw profileError('INVALID_AVATAR_URL','头像地址必须是 HTTP(S) URL 或站内绝对路径');
  const phone=String(body.phone||'').trim();if(phone&&!/^\+?[0-9 ()-]{6,30}$/.test(phone))throw profileError('INVALID_PHONE','手机号格式无效');
  const email=String(body.email||'').trim().toLowerCase();if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw profileError('INVALID_EMAIL','邮箱格式无效');
  const input=body.preferences&&typeof body.preferences==='object'&&!Array.isArray(body.preferences)?body.preferences:{};
  const requestedView=input.viewMode==='dense'?'board':input.viewMode;
  const preferences={theme:['dark','light','midnight','eyecare'].includes(input.theme)?input.theme:'dark',locale:['zh-CN','en'].includes(input.locale)?input.locale:'zh-CN',viewMode:['card','compact','board'].includes(requestedView)?requestedView:'card',defaultSpace:['public','personal'].includes(input.defaultSpace)?input.defaultSpace:'public'};
  return{displayName,avatarUrl,phone,email,preferences};
}
router.get('/profile',requireUser,(req,res)=>res.json({user:sanitizeUser(db.prepare('SELECT * FROM users WHERE id=?').get(req.auth.user.id))}));
router.patch('/profile',requireUser,(req,res)=>{try{const profile=cleanProfile(req.body||{}),before=sanitizeUser(db.prepare('SELECT * FROM users WHERE id=?').get(req.auth.user.id));db.prepare("UPDATE users SET display_name=?,avatar_url=?,phone=?,email=?,preferences_json=?,updated_at=datetime('now') WHERE id=?").run(profile.displayName,profile.avatarUrl||null,profile.phone||null,profile.email||null,JSON.stringify(profile.preferences),req.auth.user.id);const user=sanitizeUser(db.prepare('SELECT * FROM users WHERE id=?').get(req.auth.user.id));audit(req,'user.profile_updated',{targetType:'user',targetId:user.id,metadata:{changedFields:['displayName','avatarUrl','phone','email','preferences'],before:{displayName:before.displayName},after:{displayName:user.displayName}}});return res.json({user});}catch(error){return res.status(error.status||400).json({code:error.code||'INVALID_PROFILE',error:error.message});}});

router.post('/login', async (req, res) => {
  if (rateLimited(req, `login:${String(req.body.username || '').toLowerCase()}`, 8, 15 * 60 * 1000)) { audit(req,'auth.login.rate_limited',{outcome:'denied',metadata:{reason:'rate_limited'}}); return res.status(429).json({ code: 'AUTH_RATE_LIMITED', error: '登录尝试过多，请稍后重试' }); }
  const user = await authenticate(req.body.username, req.body.password);
  if (!user) { audit(req,'auth.login.failed',{outcome:'failure',metadata:{reason:'invalid_credentials'}}); return res.status(401).json({ code: 'INVALID_CREDENTIALS', error: '用户名或密码错误' }); }
  const session = createSession(user.id, { userAgent: req.header('user-agent') || '', ipPrefix: req.ip || '' });
  setSessionCookie(res, session.rawToken, session.maxAge);
  req.auth = { user: sanitizeUser(user) }; audit(req,'auth.login.succeeded',{targetType:'session',targetId:session.id}); analytics(req,'auth.login',{surface:'portal'});
  return res.json({ user: sanitizeUser(user) });
});

router.post('/register', async (req, res) => {
  if (rateLimited(req, 'register', 5, 60 * 60 * 1000)) { audit(req,'auth.register.rate_limited',{outcome:'denied',metadata:{reason:'rate_limited'}}); return res.status(429).json({ code: 'REGISTRATION_RATE_LIMITED', error: '注册尝试过多，请稍后重试' }); }
  try {
    const user = await createUser({ username: req.body.username, displayName: req.body.displayName, password: req.body.password, role: 'user', mustChangePassword: false, minPasswordLength: 8 });
    db.prepare("UPDATE users SET password_changed_at=datetime('now') WHERE id=?").run(user.id);
    const session = createSession(user.id,{userAgent:req.header('user-agent')||'',ipPrefix:req.ip||''}); setSessionCookie(res,session.rawToken,session.maxAge);
    req.auth={user}; audit(req,'auth.register.succeeded',{targetType:'user',targetId:user.id}); analytics(req,'auth.register',{surface:'portal'});
    return res.status(201).json({user});
  } catch (error) { audit(req,'auth.register.failed',{outcome:'failure',metadata:{reason:error.code||'invalid'}}); return res.status(error.status||400).json({code:error.code||'REGISTRATION_FAILED',error:error.message}); }
});

router.post('/logout', (req, res) => {
  audit(req,'auth.logout',{targetType:'session',targetId:req.auth?.sessionId||null});
  revokeSession(getTokenFromRequest(req));
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.post('/change-password', requireUser, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.auth.user.id);
  if (!await verifyPassword(req.body.currentPassword, user)) return res.status(400).json({ code: 'CURRENT_PASSWORD_INVALID', error: '当前密码错误' });
  await updatePassword(user.id, req.body.newPassword, { revokeSessions: true });
  audit(req,'auth.password.changed',{targetType:'user',targetId:user.id});
  const session = createSession(user.id, { userAgent: req.header('user-agent') || '', ipPrefix: req.ip || '' });
  setSessionCookie(res, session.rawToken, session.maxAge);
  res.json({ ok: true, user: sanitizeUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id)) });
});

router.post('/logout-all', requireUser, (req, res) => {
  const count = db.prepare('SELECT COUNT(*) count FROM sessions WHERE user_id=? AND revoked_at IS NULL').get(req.auth.user.id).count;
  revokeAllSessions(req.auth.user.id);
  audit(req,'auth.logout_all',{targetType:'user',targetId:req.auth.user.id,metadata:{revokedSessionCount:count}});
  clearSessionCookie(res);
  res.json({ ok: true });
});

module.exports = router;
