const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NAVPILOT_DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const db = require('../src/db');
const { createHealthRepository, DAY_MS } = require('../src/services/healthRepository');
const { availabilityForItems, availabilityDayForItem } = require('../src/services/availabilityService');

function createItem(name = 'Health data resource') {
  const info = db.prepare("INSERT INTO items(name,url,scope,check_enabled,check_method) VALUES(?,?,'public',1,'http')")
    .run(name,`https://${name.toLowerCase().replace(/\s+/g,'-')}.example`);
  return db.prepare('SELECT * FROM items WHERE id=?').get(Number(info.lastInsertRowid));
}

test('health writes atomically maintain raw events, daily summaries and incidents', () => {
  const item = createItem('Layered health');
  const repository = createHealthRepository(db);
  const now = Date.now();
  db.transaction(() => {
    repository.record(item,{ status:'offline',latencyMs:null,error:'timeout' },now-10_000);
    repository.record(item,{ status:'offline',latencyMs:null,error:'timeout' },now-5_000);
    repository.record(item,{ status:'online',latencyMs:120 },now);
  })();
  const day = new Date(now).toISOString().slice(0,10);
  const daily = db.prepare('SELECT * FROM resource_health_daily WHERE item_id=? AND day=?').get(item.id,day);
  assert.deepEqual({ checks:daily.checks,online:daily.online_count,offline:daily.offline_count,latencySamples:daily.latency_samples },{ checks:3,online:1,offline:2,latencySamples:1 });
  const incident = db.prepare('SELECT * FROM resource_health_incidents WHERE item_id=?').get(item.id);
  assert.equal(incident.status,'resolved');
  assert.equal(incident.failure_count,2);
  assert.equal(incident.duration_ms,10_000);
  const [summary] = availabilityForItems(db,[{ ...item,status:'online',latency_ms:120 }],{ days:7,now });
  assert.equal(summary.checks,3);
  assert.equal(summary.availability,33.33);
  assert.equal(summary.daily.at(-1).status,'degraded');
});

test('large raw history is backfilled once and summaries never expand raw event arrays', () => {
  const item = createItem('Large health history');
  const now = Date.now();
  const start = now - 39 * DAY_MS;
  const existingEvents = db.prepare('SELECT COUNT(*) count FROM resource_health_events').get().count;
  db.prepare(`WITH RECURSIVE sequence(value) AS (
      VALUES(0) UNION ALL SELECT value+1 FROM sequence WHERE value<139999
    ) INSERT INTO resource_health_events(item_id,item_name,scope,owner_id,status,latency_ms,checked_at_ms)
      SELECT ?,?,'public',NULL,CASE WHEN value%101=0 THEN 'offline' ELSE 'online' END,100+(value%500),?+(value%40)*? FROM sequence`)
    .run(item.id,item.name,start,DAY_MS);
  const repository = createHealthRepository(db);
  const rebuilt = repository.rebuild();
  assert.equal(rebuilt.eventCount,existingEvents+140000);
  assert.equal(rebuilt.dailyCount >= 40,true);
  const [summary] = availabilityForItems(db,[item],{ days:30,now });
  assert.equal(summary.daily.length,30);
  assert.equal(summary.checks > 100000,true);
  assert.equal(Number.isFinite(summary.averageLatencyMs),true);
  const oldDate = new Date(start).toISOString().slice(0,10);
  const oldDay = availabilityDayForItem(db,item,oldDate,{ retentionDays:30 });
  assert.equal(oldDay.detailAvailable,false);
  assert.equal(oldDay.events.length,0);
  assert.equal(oldDay.checks > 0,true);
  const before = db.prepare('SELECT COUNT(*) count FROM resource_health_events').get().count;
  const cleanup = repository.cleanup({ days:30,batchSize:5000,now });
  assert.equal(cleanup.deleted > 0,true);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM resource_health_events').get().count,before-cleanup.deleted);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM resource_health_daily WHERE item_id=?').get(item.id).count >= 40,true);
});
