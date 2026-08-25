const DAY_MS = 86400000;
const DEGRADED_LATENCY_MS = Math.max(250, Number(process.env.AVAILABILITY_DEGRADED_MS) || 1500);

function clampDays(value) {
  return [7, 15, 30, 90].includes(Number(value)) ? Number(value) : 30;
}

function utcDay(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function storedTimestamp(value) {
  if (!value) return null;
  if (Number.isFinite(Number(value))) return Number(value);
  const parsed = Date.parse(String(value).includes('T') ? String(value) : `${String(value).replace(' ', 'T')}Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function period(days, now = Date.now()) {
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  const start = end.getTime() - (days - 1) * DAY_MS;
  return {
    from: start,
    days: Array.from({ length:days }, (_, index) => utcDay(start + index * DAY_MS)),
  };
}

function loadEvents(db, itemIds, from) {
  const rows = [];
  for (let offset = 0; offset < itemIds.length; offset += 400) {
    const ids = itemIds.slice(offset, offset + 400);
    if (!ids.length) continue;
    const placeholders = ids.map(() => '?').join(',');
    rows.push(...db.prepare(`SELECT item_id itemId,status,latency_ms latencyMs,checked_at_ms checkedAtMs
      FROM resource_health_events WHERE checked_at_ms>=? AND item_id IN (${placeholders})
      ORDER BY checked_at_ms`).all(from, ...ids));
  }
  return rows;
}

function incidents(events, now) {
  const result = [];
  let current = null;
  for (const event of events) {
    if (event.status === 'offline' && !current) {
      current = { startedAtMs:event.checkedAtMs, endedAtMs:null, recovered:false };
    } else if (event.status === 'online' && current) {
      current.endedAtMs = event.checkedAtMs;
      current.recovered = true;
      current.durationMs = Math.max(0, current.endedAtMs - current.startedAtMs);
      result.push(current);
      current = null;
    }
  }
  if (current) {
    current.durationMs = Math.max(0, now - current.startedAtMs);
    result.push(current);
  }
  return result.reverse().slice(0, 20);
}

function summarize(item, events, dayKeys, now, includeDetails) {
  const byDay = new Map();
  for (const event of events) {
    const key = utcDay(event.checkedAtMs);
    const bucket = byDay.get(key) || { checks:0, online:0, offline:0, unknown:0, latencyTotal:0, latencySamples:0 };
    bucket.checks += 1;
    bucket[event.status] = (bucket[event.status] || 0) + 1;
    if (event.latencyMs != null) {
      bucket.latencyTotal += Number(event.latencyMs);
      bucket.latencySamples += 1;
    }
    byDay.set(key, bucket);
  }
  const daily = dayKeys.map((date) => {
    const bucket = byDay.get(date);
    if (!bucket) return { date, status:'unknown', checks:0, availability:null, averageLatencyMs:null };
    const known = bucket.online + bucket.offline;
    const averageLatencyMs = bucket.latencySamples ? Math.round(bucket.latencyTotal / bucket.latencySamples) : null;
    let status = 'online';
    if (!known) status = 'unknown';
    else if (!bucket.online && bucket.offline) status = 'offline';
    else if (bucket.offline || (averageLatencyMs != null && averageLatencyMs >= DEGRADED_LATENCY_MS)) status = 'degraded';
    return {
      date, status, checks:bucket.checks, online:bucket.online, offline:bucket.offline,
      availability:known ? Number((bucket.online / known * 100).toFixed(2)) : null,
      averageLatencyMs,
    };
  });
  const online = events.filter((event) => event.status === 'online').length;
  const offline = events.filter((event) => event.status === 'offline').length;
  const latency = events.filter((event) => event.latencyMs != null).map((event) => Number(event.latencyMs));
  const last = events[events.length - 1];
  const currentStatus = item.status || last?.status || 'unknown';
  const currentLatency = item.latency_ms ?? item.latencyMs ?? null;
  const value = {
    itemId:item.id,
    name:item.name,
    url:item.url,
    scope:item.scope,
    ownerId:item.owner_id ?? item.ownerId ?? null,
    ownerName:item.ownerName || null,
    categoryName:item.categoryName || item.category_name || null,
    checkEnabled:Boolean(item.check_enabled ?? item.checkEnabled),
    status:currentStatus,
    state:currentStatus === 'online' && currentLatency != null && currentLatency >= DEGRADED_LATENCY_MS ? 'degraded' : currentStatus,
    latencyMs:currentLatency,
    lastCheckedAtMs:last?.checkedAtMs || storedTimestamp(item.last_checked_at ?? item.lastCheckedAt),
    availability:online + offline ? Number((online / (online + offline) * 100).toFixed(2)) : null,
    averageLatencyMs:latency.length ? Math.round(latency.reduce((sum, value) => sum + value, 0) / latency.length) : null,
    checks:events.length,
    daily,
  };
  if (includeDetails) {
    value.events = events.slice(-60).reverse();
    value.incidents = incidents(events, now);
  }
  return value;
}

function availabilityForItems(db, items, options = {}) {
  const days = clampDays(options.days);
  const now = options.now || Date.now();
  const selectedPeriod = period(days, now);
  const events = loadEvents(db, items.map((item) => item.id), selectedPeriod.from);
  const byItem = new Map();
  events.forEach((event) => {
    const list = byItem.get(event.itemId) || [];
    list.push(event);
    byItem.set(event.itemId, list);
  });
  return items.map((item) => summarize(item, byItem.get(item.id) || [], selectedPeriod.days, now, Boolean(options.includeDetails)));
}

function availabilityDayForItem(db, item, date) {
  const from = Date.parse(`${date}T00:00:00Z`);
  const to = from + DAY_MS;
  const events = db.prepare(`SELECT item_id itemId,status,latency_ms latencyMs,checked_at_ms checkedAtMs
    FROM resource_health_events WHERE item_id=? AND checked_at_ms>=? AND checked_at_ms<?
    ORDER BY checked_at_ms`).all(item.id, from, to);
  const summary = summarize(item, events, [date], Math.min(Date.now(), to), true);
  const bucket = summary.daily[0];
  return {
    ...summary,
    date,
    status:bucket.status,
    state:bucket.status,
    availability:bucket.availability,
    averageLatencyMs:bucket.averageLatencyMs,
    checks:bucket.checks,
    events:[...events].reverse(),
    incidents:incidents(events, Math.min(Date.now(), to)),
  };
}

module.exports = { availabilityForItems, availabilityDayForItem, clampDays, DEGRADED_LATENCY_MS };
