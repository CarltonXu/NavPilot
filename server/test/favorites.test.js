const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NAVPILOT_DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const db = require('../src/db');
const { createApp } = require('../src/index');
const { createUser } = require('../src/services/authService');
const { createSession } = require('../src/services/sessionService');

test('favorites are private to each account and respect resource visibility', async (t) => {
  const member = await createUser({ username:'favorite-user', displayName:'Favorite User', password:'Strong-favorite-password', mustChangePassword:false });
  const other = await createUser({ username:'favorite-other', displayName:'Other User', password:'Strong-other-password', mustChangePassword:false });
  const memberSession = createSession(member.id);
  const otherSession = createSession(other.id);
  const publicItem = db.prepare("SELECT id FROM items WHERE scope='public' ORDER BY id LIMIT 1").get();
  const personalItemId = Number(db.prepare("INSERT INTO items(name,url,scope,owner_id) VALUES(?,?,'personal',?)").run('Private favorite','https://private-favorite.example',member.id).lastInsertRowid);

  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  async function request(path, token, options={}) {
    const response = await fetch(`${baseURL}${path}`, { ...options, headers:{ 'Content-Type':'application/json', ...(token?{cookie:`navpilot_session=${token}`}:{}) } });
    return { response, body:await response.json() };
  }

  let result = await request('/api/items?scope=public');
  assert.equal(result.response.status,200);
  assert.equal(result.body.find(item=>item.id===publicItem.id).is_favorite,false);

  result = await request(`/api/items/${publicItem.id}/favorite`,memberSession.rawToken,{method:'PUT',body:JSON.stringify({favorite:true})});
  assert.deepEqual({favorite:result.body.favorite,itemId:result.body.itemId},{favorite:true,itemId:publicItem.id});
  result = await request('/api/items?scope=public',memberSession.rawToken);
  assert.equal(result.body.find(item=>item.id===publicItem.id).is_favorite,true);
  assert.ok(result.body.find(item=>item.id===publicItem.id).favorite_at_ms>0);

  result = await request(`/api/items/${personalItemId}/favorite`,memberSession.rawToken,{method:'PUT',body:JSON.stringify({favorite:true})});
  assert.equal(result.response.status,200);
  result = await request(`/api/items/${personalItemId}/favorite`,otherSession.rawToken,{method:'PUT',body:JSON.stringify({favorite:true})});
  assert.equal(result.response.status,404);

  result = await request(`/api/items/${publicItem.id}/favorite`,memberSession.rawToken,{method:'PUT',body:JSON.stringify({favorite:false})});
  assert.equal(result.body.favorite,false);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM user_favorites WHERE user_id=? AND item_id=?').get(member.id,publicItem.id).count,0);
});

test.after(() => db.close());
