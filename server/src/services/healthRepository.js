const crypto = require('crypto');
const defaultDb = require('../db');

const DAY_MS = 86400000;
const BACKFILL_SETTING = 'health_data_backfill_v1';

function utcDay(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function retentionDays(value = process.env.HEALTH_RAW_RETENTION_DAYS) {
  const parsed = Number(value || 30);
  return Number.isInteger(parsed) ? Math.min(365, Math.max(7, parsed)) : 30;
}

function createHealthRepository(db = defaultDb) {
  const insertRaw = db.prepare(`INSERT INTO resource_health_events
    (item_id,item_name,scope,owner_id,status,latency_ms,check_interval_minutes,trigger_type,checked_at_ms) VALUES(?,?,?,?,?,?,?,?,?)`);
  const upsertDaily = db.prepare(`INSERT INTO resource_health_daily
    (item_id,day,item_name,item_url,scope,owner_id,checks,online_count,offline_count,unknown_count,latency_sum,latency_samples,min_latency_ms,max_latency_ms,created_at_ms,updated_at_ms)
    VALUES(?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(item_id,day) DO UPDATE SET
      item_name=excluded.item_name,item_url=excluded.item_url,scope=excluded.scope,owner_id=excluded.owner_id,
      checks=resource_health_daily.checks+1,
      online_count=resource_health_daily.online_count+excluded.online_count,
      offline_count=resource_health_daily.offline_count+excluded.offline_count,
      unknown_count=resource_health_daily.unknown_count+excluded.unknown_count,
      latency_sum=resource_health_daily.latency_sum+excluded.latency_sum,
      latency_samples=resource_health_daily.latency_samples+excluded.latency_samples,
      min_latency_ms=CASE WHEN excluded.min_latency_ms IS NULL THEN resource_health_daily.min_latency_ms WHEN resource_health_daily.min_latency_ms IS NULL THEN excluded.min_latency_ms ELSE MIN(resource_health_daily.min_latency_ms,excluded.min_latency_ms) END,
      max_latency_ms=CASE WHEN excluded.max_latency_ms IS NULL THEN resource_health_daily.max_latency_ms WHEN resource_health_daily.max_latency_ms IS NULL THEN excluded.max_latency_ms ELSE MAX(resource_health_daily.max_latency_ms,excluded.max_latency_ms) END,
      updated_at_ms=excluded.updated_at_ms`);
  const openIncident = db.prepare('SELECT * FROM resource_health_incidents WHERE item_id=? AND ended_at_ms IS NULL');
  const insertIncident = db.prepare(`INSERT INTO resource_health_incidents
    (id,item_id,item_name,item_url,scope,owner_id,started_at_ms,failure_count,status,last_error,created_at_ms,updated_at_ms)
    VALUES(?,?,?,?,?,?,?,1,'open',?,?,?)`);
  const continueIncident = db.prepare(`UPDATE resource_health_incidents SET failure_count=failure_count+1,
    item_name=?,item_url=?,last_error=COALESCE(?,last_error),updated_at_ms=? WHERE id=?`);
  const resolveIncident = db.prepare(`UPDATE resource_health_incidents SET ended_at_ms=?,duration_ms=MAX(0,?-started_at_ms),
    status='resolved',updated_at_ms=? WHERE id=?`);

  function record(item, result, checkedAtMs = Date.now(), metadata = {}) {
    const latency = result.latencyMs == null ? null : Number(result.latencyMs);
    const counts = {
      online:result.status === 'online' ? 1 : 0,
      offline:result.status === 'offline' ? 1 : 0,
      unknown:result.status === 'unknown' ? 1 : 0,
    };
    insertRaw.run(item.id,item.name,item.scope,item.owner_id || null,result.status,latency,
      Number(metadata.checkIntervalMinutes || item.check_interval_minutes) || 5,
      ['scheduled','manual','configuration'].includes(metadata.triggerType) ? metadata.triggerType : 'scheduled',checkedAtMs);
    upsertDaily.run(
      item.id,utcDay(checkedAtMs),item.name,item.url,item.scope,item.owner_id || null,
      counts.online,counts.offline,counts.unknown,latency == null ? 0 : latency,latency == null ? 0 : 1,
      latency,latency,checkedAtMs,checkedAtMs,
    );
    const active = openIncident.get(item.id);
    if (result.status === 'offline') {
      const error = result.error ? String(result.error).slice(0,500) : null;
      if (active) continueIncident.run(item.name,item.url,error,checkedAtMs,active.id);
      else insertIncident.run(crypto.randomUUID(),item.id,item.name,item.url,item.scope,item.owner_id || null,checkedAtMs,error,checkedAtMs,checkedAtMs);
    } else if (result.status === 'online' && active) {
      resolveIncident.run(checkedAtMs,checkedAtMs,checkedAtMs,active.id);
    }
  }

  function loadDaily(itemIds, fromDay, toDay) {
    const rows = [];
    for (let offset = 0; offset < itemIds.length; offset += 400) {
      const ids = itemIds.slice(offset, offset + 400);
      if (!ids.length) continue;
      const placeholders = ids.map(() => '?').join(',');
      const batch = db.prepare(`SELECT item_id itemId,day,checks,online_count online,offline_count offline,
        unknown_count unknown,latency_sum latencyTotal,latency_samples latencySamples,
        min_latency_ms minLatencyMs,max_latency_ms maxLatencyMs
        FROM resource_health_daily WHERE day>=? AND day<=? AND item_id IN (${placeholders}) ORDER BY day`).all(fromDay,toDay,...ids);
      for (const row of batch) rows.push(row);
    }
    return rows;
  }

  function loadRaw(itemId, from, to) {
    return db.prepare(`SELECT item_id itemId,status,latency_ms latencyMs,checked_at_ms checkedAtMs,
      check_interval_minutes checkIntervalMinutes,trigger_type triggerType
      FROM resource_health_events WHERE item_id=? AND checked_at_ms>=? AND checked_at_ms<? ORDER BY checked_at_ms`).all(itemId,from,to);
  }

  function loadIncidents(itemId, from, to, limit = 20) {
    return db.prepare(`SELECT id,started_at_ms startedAtMs,ended_at_ms endedAtMs,duration_ms durationMs,
      failure_count failureCount,status,last_error lastError
      FROM resource_health_incidents WHERE item_id=? AND started_at_ms<? AND (ended_at_ms IS NULL OR ended_at_ms>=?)
      ORDER BY started_at_ms DESC LIMIT ?`).all(itemId,to,from,Math.min(200,Math.max(1,Number(limit) || 20)))
      .map((row) => ({ ...row, recovered:row.status === 'resolved' }));
  }

  function rebuild() {
    const startedAt = Date.now();
    let eventCount = 0, incidentCount = 0;
    db.transaction(() => {
      db.prepare('DELETE FROM resource_health_daily').run();
      db.prepare('DELETE FROM resource_health_incidents').run();
      db.exec(`INSERT INTO resource_health_daily
        (item_id,day,item_name,item_url,scope,owner_id,checks,online_count,offline_count,unknown_count,latency_sum,latency_samples,min_latency_ms,max_latency_ms,created_at_ms,updated_at_ms)
        SELECT e.item_id,date(e.checked_at_ms/1000,'unixepoch'),MAX(e.item_name),MAX(i.url),e.scope,e.owner_id,
          COUNT(*),SUM(CASE WHEN e.status='online' THEN 1 ELSE 0 END),SUM(CASE WHEN e.status='offline' THEN 1 ELSE 0 END),SUM(CASE WHEN e.status='unknown' THEN 1 ELSE 0 END),
          COALESCE(SUM(CASE WHEN e.latency_ms IS NOT NULL THEN e.latency_ms ELSE 0 END),0),COUNT(e.latency_ms),MIN(e.latency_ms),MAX(e.latency_ms),
          MIN(e.checked_at_ms),MAX(e.checked_at_ms)
        FROM resource_health_events e LEFT JOIN items i ON i.id=e.item_id
        GROUP BY e.item_id,date(e.checked_at_ms/1000,'unixepoch'),e.scope,e.owner_id`);
      const insert = db.prepare(`INSERT INTO resource_health_incidents
        (id,item_id,item_name,item_url,scope,owner_id,started_at_ms,ended_at_ms,duration_ms,failure_count,status,last_error,created_at_ms,updated_at_ms)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      let currentItemId = null, active = null;
      const rebuiltIncidents = [];
      const flush = () => {
        if (!active) return;
        rebuiltIncidents.push(active);
        active = null;
      };
      const events = db.prepare(`SELECT e.item_id itemId,e.item_name itemName,i.url itemUrl,e.scope,e.owner_id ownerId,
        e.status,e.checked_at_ms checkedAtMs FROM resource_health_events e LEFT JOIN items i ON i.id=e.item_id
        ORDER BY e.item_id,e.checked_at_ms,e.id`).iterate();
      for (const event of events) {
        eventCount += 1;
        if (currentItemId !== event.itemId) { flush(); currentItemId = event.itemId; }
        if (event.status === 'offline') {
          if (!active) active = { id:crypto.randomUUID(), ...event, startedAtMs:event.checkedAtMs, endedAtMs:null, durationMs:null, failureCount:1, status:'open', updatedAtMs:event.checkedAtMs };
          else { active.failureCount += 1; active.updatedAtMs = event.checkedAtMs; active.itemName = event.itemName; active.itemUrl = event.itemUrl; }
        } else if (event.status === 'online' && active) {
          active.endedAtMs = event.checkedAtMs;
          active.durationMs = Math.max(0,event.checkedAtMs-active.startedAtMs);
          active.status = 'resolved';
          active.updatedAtMs = event.checkedAtMs;
          flush();
        }
      }
      flush();
      for (const incident of rebuiltIncidents) {
        insert.run(incident.id,incident.itemId,incident.itemName,incident.itemUrl,incident.scope,incident.ownerId,incident.startedAtMs,
          incident.endedAtMs,incident.durationMs,incident.failureCount,incident.status,null,incident.startedAtMs,incident.updatedAtMs);
      }
      incidentCount = rebuiltIncidents.length;
      db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
        .run(BACKFILL_SETTING,JSON.stringify({ completedAtMs:Date.now(),eventCount,incidentCount }));
    })();
    return { eventCount, incidentCount, dailyCount:db.prepare('SELECT COUNT(*) count FROM resource_health_daily').get().count, durationMs:Date.now()-startedAt };
  }

  function initialize() {
    const marker = db.prepare('SELECT value FROM settings WHERE key=?').get(BACKFILL_SETTING);
    return marker ? { skipped:true, marker:marker.value } : rebuild();
  }

  function cleanup({ days = retentionDays(), batchSize = 5000, now = Date.now() } = {}) {
    const cutoff = now - days * DAY_MS;
    const size = Math.min(10000,Math.max(100,Number(batchSize) || 5000));
    let deleted = 0;
    while (true) {
      const changes = db.prepare(`DELETE FROM resource_health_events WHERE id IN
        (SELECT id FROM resource_health_events WHERE checked_at_ms<? ORDER BY checked_at_ms LIMIT ?)`).run(cutoff,size).changes;
      deleted += changes;
      if (changes < size) break;
    }
    return { deleted, retentionDays:days, cutoff };
  }

  function optimize() {
    db.pragma('optimize');
  }

  return { record, loadDaily, loadRaw, loadIncidents, rebuild, initialize, cleanup, optimize, retentionDays };
}

module.exports = { createHealthRepository, retentionDays, DAY_MS, BACKFILL_SETTING };
