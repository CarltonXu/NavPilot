const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const baseDb = require('../src/db');
const { createAccessControlService } = require('../src/services/accessControlService');
const { createNavigationService, realm } = require('../src/services/navigationService');

function user(db, name, role = 'user') {
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO users(id,username,display_name,role,status,must_change_password) VALUES(?,?,?,?, 'active',0)").run(id, name, name, role);
  return { id, username:name, display_name:name, role, status:'active' };
}

test('resource ACL supports anonymous, authenticated, direct, group and expired access', () => {
  const db = baseDb.createDatabase(':memory:'), navigation = createNavigationService(db), access = createAccessControlService(db);
  const admin = user(db, 'acl-admin', 'admin'), member = user(db, 'acl-member'), outsider = user(db, 'acl-outsider');
  const item = navigation.createItem(realm('public'), { name:'Protected', url:'https://protected.example' }).value;
  assert.equal(access.canViewItem(null, item), true);
  access.replaceItemAccess(item.id, { visibility:'authenticated', grants:[] }, admin);
  assert.equal(access.canViewItem(null, db.prepare('SELECT * FROM items WHERE id=?').get(item.id)), false);
  assert.equal(access.canViewItem(outsider, db.prepare('SELECT * FROM items WHERE id=?').get(item.id)), true);
  const groupId = crypto.randomUUID(), now = Date.now();
  db.prepare('INSERT INTO access_groups(id,name,created_by_user_id,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?)').run(groupId, 'Engineering', admin.id, now, now);
  db.prepare('INSERT INTO access_group_members(group_id,user_id,added_by_user_id,created_at_ms) VALUES(?,?,?,?)').run(groupId, member.id, admin.id, now);
  access.replaceItemAccess(item.id, { visibility:'restricted', grants:[{type:'group',id:groupId,expiresAtMs:null}] }, admin);
  const restricted = db.prepare('SELECT * FROM items WHERE id=?').get(item.id);
  assert.equal(access.canViewItem(member, restricted), true);
  assert.equal(access.canViewItem(outsider, restricted), false);
  assert.equal(access.canViewItem(admin, restricted), true);
  access.replaceItemAccess(item.id, { visibility:'restricted', grants:[{type:'user',id:outsider.id,expiresAtMs:Date.now()+1000}] }, admin);
  assert.equal(access.canViewItem(outsider, db.prepare('SELECT * FROM items WHERE id=?').get(item.id), Date.now()), true);
  assert.equal(access.canViewItem(outsider, db.prepare('SELECT * FROM items WHERE id=?').get(item.id), Date.now()+2000), false);
  db.close();
});

test('category access is inherited, materialized for resources and never becomes public when grants disappear', () => {
  const db = baseDb.createDatabase(':memory:'), navigation = createNavigationService(db), access = createAccessControlService(db);
  const admin = user(db, 'category-admin', 'admin'), member = user(db, 'category-member');
  const parent = navigation.createCategory(realm('public'), { name:'Parent' }).value;
  const child = navigation.createCategory(realm('public'), { name:'Child', parent_id:parent.id }).value;
  access.replaceCategoryAccess(parent.id, { visibility:'restricted', grants:[{type:'user',id:member.id,expiresAtMs:null}] }, admin);
  const inherited = access.inheritedCategoryAccess(child.id);
  assert.equal(inherited.visibility, 'restricted');
  assert.equal(inherited.sourceCategoryId, parent.id);
  const item = navigation.createItem(realm('public'), { name:'Inherited', url:'https://inherited.example', category_id:child.id }).value;
  access.replaceItemAccess(item.id, inherited, admin, { incrementVersion:false });
  assert.equal(access.canViewItem(member, db.prepare('SELECT * FROM items WHERE id=?').get(item.id)), true);
  db.prepare('DELETE FROM item_access_user_grants WHERE item_id=?').run(item.id);
  const orphaned = db.prepare('SELECT * FROM items WHERE id=?').get(item.id);
  assert.equal(orphaned.visibility, 'restricted');
  assert.equal(access.canViewItem(member, orphaned), false);
  assert.equal(access.canViewItem(admin, orphaned), true);
  db.close();
});
