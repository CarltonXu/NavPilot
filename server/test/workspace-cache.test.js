const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NAVPILOT_DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const db = require('../src/db');
const { createApp } = require('../src/index');
const { createNavigationService, realm } = require('../src/services/navigationService');

test('workspace endpoint combines data and returns only a version when unchanged', async (t) => {
  const navigation = createNavigationService(db);
  const current = realm('public');
  const category = navigation.createCategory(current, { name: 'Docs', icon: 'icon:docs' }).value;
  const item = navigation.createItem(current, {
    name: 'Example',
    url: 'https://example.com',
    icon: 'https://example.com/favicon.ico',
    category_id: category.id,
  }).value;
  const duplicateIconItem = navigation.createItem(current, {
    name: 'Example Docs',
    url: 'https://example.com/docs',
    icon: 'https://example.com/favicon.ico',
    category_id: category.id,
  }).value;
  const privateIconItem = navigation.createItem(current, {
    name: 'Internal Dashboard',
    url: 'http://192.168.10.201',
    icon: 'http://192.168.10.201/favicon.ico',
    category_id: category.id,
  }).value;
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  let response = await fetch(`${base}/api/workspace?scope=public`);
  assert.equal(response.status, 200);
  let body = await response.json();
  assert.equal(body.changed, true);
  assert.equal(body.categories.some((value) => value.id === category.id), true);
  const returnedItem = body.items.find((value) => value.id === item.id);
  assert.match(returnedItem.icon_cache_url, /^\/api\/items\/icon-cache\/[a-f0-9]{16}$/);
  assert.equal(
    body.items.find((value) => value.id === duplicateIconItem.id).icon_cache_url,
    returnedItem.icon_cache_url,
  );
  assert.equal(body.items.find((value) => value.id === privateIconItem.id).icon_cache_url, undefined);

  response = await fetch(`${base}/api/workspace?scope=public&version=${body.version}`);
  const unchanged = await response.json();
  assert.deepEqual(unchanged, { version: body.version, changed: false });

  navigation.updateItem(current, item.id, { name: 'Updated', expectedVersion: item.version });
  response = await fetch(`${base}/api/workspace?scope=public&version=${body.version}`);
  body = await response.json();
  assert.equal(body.changed, true);
  assert.equal(body.items.find((value) => value.id === item.id).name, 'Updated');
  assert.notEqual(body.version, unchanged.version);
});
