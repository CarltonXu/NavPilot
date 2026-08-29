const test = require('node:test');
const assert = require('node:assert/strict');
const { translateSql } = require('../src/db/postgresSql');

test('PostgreSQL compatibility translates placeholders, null equality and case-insensitive ordering', () => {
  const value = translateSql("SELECT owner_id ownerId FROM items WHERE scope=? AND owner_id IS ? ORDER BY name COLLATE NOCASE");
  assert.match(value.sql,/scope=\$1/);
  assert.match(value.sql,/owner_id IS NOT DISTINCT FROM \$2/);
  assert.match(value.sql,/ORDER BY LOWER\(name\)/);
  assert.equal(value.aliasMap.ownerid,'ownerId');
});

test('PostgreSQL compatibility translates SQLite dates, JSON and scalar min/max', () => {
  const value = translateSql("SELECT date(e.occurred_at_ms/1000,'unixepoch') day,json_extract(e.properties_json,'$.term') term FROM analytics_events e");
  assert.match(value.sql,/to_char\(to_timestamp/);
  assert.match(value.sql,/"day"/);
  assert.match(value.sql,/properties_json::jsonb/);
  assert.match(translateSql('UPDATE x SET value=MAX(0,?-started_at_ms)').sql,/GREATEST\(0,\$1-started_at_ms\)/);
});

test('PostgreSQL compatibility preserves insert result and conflict semantics', () => {
  const value = translateSql('INSERT OR IGNORE INTO user_favorites(user_id,item_id) VALUES(?,?)',{returning:true});
  assert.equal(value.sql,'INSERT INTO user_favorites(user_id,item_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING *');
});
