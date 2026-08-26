const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NAVPILOT_DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.NAVPILOT_UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'navpilot-upload-test-'));

const { createApp } = require('../src/index');
const { createUser } = require('../src/services/authService');
const { createSession } = require('../src/services/sessionService');
const { getUploadRoot } = require('../src/services/uploadService');

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+G4o2NwAAAABJRU5ErkJggg==';

test('default upload root is persistent when no database path is configured', () => {
  const uploadDirectory = process.env.NAVPILOT_UPLOAD_DIR;
  const databasePath = process.env.NAVPILOT_DB_PATH;
  delete process.env.NAVPILOT_UPLOAD_DIR;
  delete process.env.NAVPILOT_DB_PATH;
  try {
    assert.equal(getUploadRoot(), path.resolve(__dirname, '..', 'data', 'uploads'));
  } finally {
    process.env.NAVPILOT_UPLOAD_DIR = uploadDirectory;
    process.env.NAVPILOT_DB_PATH = databasePath;
  }
});

test('admins upload branding images and users upload only their own avatar', async (t) => {
  const admin = await createUser({ username:'uploadadmin',displayName:'Upload Admin',password:'strong-password-1',role:'admin',mustChangePassword:false });
  const user = await createUser({ username:'uploaduser',displayName:'Upload User',password:'strong-password-2',mustChangePassword:false });
  const adminToken=createSession(admin.id).rawToken,userToken=createSession(user.id).rawToken;
  const server=createApp().listen(0);await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=(token,url,options={})=>fetch(`${base}${url}`,{...options,headers:{'Content-Type':'application/json',cookie:`navpilot_session=${token}`,...options.headers}});

  let response=await request(userToken,'/api/settings/admin/branding-assets',{method:'POST',body:JSON.stringify({kind:'logo',dataUrl:PNG_DATA_URL})});
  assert.equal(response.status,403);
  response=await request(adminToken,'/api/settings/admin/branding-assets',{method:'POST',body:JSON.stringify({kind:'logo',dataUrl:PNG_DATA_URL})});
  assert.equal(response.status,201);
  let body=await response.json();
  assert.match(body.url,/^\/uploads\/branding\/logo-[a-f0-9]{16}\.png$/);
  response=await fetch(`${base}${body.url}`);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');

  response=await request(userToken,'/api/auth/avatar',{method:'POST',body:JSON.stringify({dataUrl:PNG_DATA_URL})});
  assert.equal(response.status,201);body=await response.json();
  assert.match(body.user.avatarUrl,new RegExp(`^/uploads/avatars/${user.id}-[a-f0-9]{16}\\.png$`));
  response=await request(userToken,'/api/auth/me');body=await response.json();assert.equal(body.user.avatarUrl.startsWith('/uploads/avatars/'),true);

  response=await request(userToken,'/api/auth/avatar',{method:'POST',body:JSON.stringify({dataUrl:'data:image/png;base64,not-an-image'})});
  assert.equal(response.status,400);
});
