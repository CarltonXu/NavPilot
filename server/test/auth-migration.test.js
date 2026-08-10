const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

function tempPath(name) { return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'navpilot-')), name); }
function clearModules() { const sourcePath = `${path.sep}server${path.sep}src${path.sep}`; for (const key of Object.keys(require.cache)) if (key.includes(sourcePath)) delete require.cache[key]; }

test('migrates legacy categories into independent realms', () => {
  const filename = tempPath('legacy.db');
  const legacy = new Database(filename);
  legacy.exec(`CREATE TABLE categories(id INTEGER PRIMARY KEY,name TEXT UNIQUE,icon TEXT,sort_order INTEGER,created_at TEXT);
    CREATE TABLE items(id INTEGER PRIMARY KEY,name TEXT,url TEXT,icon TEXT,description TEXT,category_id INTEGER,sort_order INTEGER,click_count INTEGER,status TEXT,latency_ms INTEGER,last_checked_at TEXT,check_enabled INTEGER,check_method TEXT,check_target TEXT,scope TEXT,owner_id TEXT,owner_name TEXT,created_at TEXT);
    CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);`);
  legacy.prepare('INSERT INTO categories VALUES(1,?,?,?,?)').run('Shared','📁',0,'2026-01-01');
  legacy.prepare("INSERT INTO items VALUES(1,'Public','https://public.example','🔗','',1,0,0,'unknown',NULL,NULL,0,'http',NULL,'public',NULL,NULL,'2026-01-01')").run();
  legacy.prepare("INSERT INTO items VALUES(2,'Private','https://private.example','🔗','',1,0,0,'unknown',NULL,NULL,1,'http',NULL,'personal','legacy-owner','Alice','2026-01-01')").run();
  legacy.close();
  process.env.NAVPILOT_DB_PATH = filename; clearModules();
  const db = require('../src/db');
  const categories = db.prepare("SELECT name,scope,owner_id FROM categories ORDER BY scope").all();
  assert.equal(categories.length, 2); assert.deepEqual(categories.map((c) => c.scope).sort(), ['personal','public']);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM users WHERE status='pending_claim'").get().count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM legacy_spaces').get().count, 1);
  assert.equal(db.pragma('foreign_key_check').length, 0);
  db.close(); delete process.env.NAVPILOT_DB_PATH; clearModules();
});

test('hashes passwords and revokes opaque sessions', async () => {
  const filename = tempPath('auth.db'); process.env.NAVPILOT_DB_PATH = filename; clearModules();
  const db = require('../src/db'); const auth = require('../src/services/authService'); const sessions = require('../src/services/sessionService');
  const eight = await auth.createUser({ username: 'eightchar', displayName: 'Eight', password: '12345678', mustChangePassword: false, minPasswordLength: 8 });
  assert.equal(eight.role, 'user');
  await assert.rejects(() => auth.createUser({ username: 'tooshort', displayName: 'Short', password: '1234567', mustChangePassword: false, minPasswordLength: 8 }), { code: 'INVALID_PASSWORD' });
  const user = await auth.createUser({ username: 'tester', displayName: 'Tester', password: 'StrongPassword-2026!', mustChangePassword: false });
  const raw = db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
  assert.notEqual(raw.password_hash, 'StrongPassword-2026!'); assert.equal(await auth.verifyPassword('StrongPassword-2026!', raw), true); assert.equal(await auth.verifyPassword('wrong-password', raw), false);
  const session = sessions.createSession(user.id, { now: 1000 }); assert.ok(session.rawToken.length > 30); assert.equal(db.prepare('SELECT token_hash FROM sessions').get().token_hash, crypto.createHash('sha256').update(session.rawToken).digest('hex'));
  assert.ok(sessions.getSession(session.rawToken, 2000)); sessions.revokeSession(session.rawToken, 3000); assert.equal(sessions.getSession(session.rawToken, 4000), null);
  db.close(); delete process.env.NAVPILOT_DB_PATH; clearModules();
});
