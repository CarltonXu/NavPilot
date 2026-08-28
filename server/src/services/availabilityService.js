const { createHealthRepository, retentionDays, DAY_MS } = require('./healthRepository');

const DEGRADED_LATENCY_MS = Math.max(250, Number(process.env.AVAILABILITY_DEGRADED_MS) || 1500);
const repositories = new WeakMap();

function repositoryFor(db) {
  if (!repositories.has(db)) repositories.set(db,createHealthRepository(db));
  return repositories.get(db);
}

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
    from:start,
    to:end.getTime() + DAY_MS,
    days:Array.from({ length:days }, (_, index) => utcDay(start + index * DAY_MS)),
  };
}

function dailyState(row) {
  if (!row || !row.checks) return 'unknown';
  const known = Number(row.online) + Number(row.offline);
  const average = row.latencySamples ? Math.round(Number(row.latencyTotal) / Number(row.latencySamples)) : null;
  if (!known) return 'unknown';
  if (!Number(row.online) && Number(row.offline)) return 'offline';
  if (Number(row.offline) || (average != null && average >= DEGRADED_LATENCY_MS)) return 'degraded';
  return 'online';
}

function dailyValue(date, row) {
  if (!row) return { date, status:'unknown', checks:0, availability:null, averageLatencyMs:null };
  const online = Number(row.online) || 0;
  const offline = Number(row.offline) || 0;
  const known = online + offline;
  return {
    date,
    status:dailyState(row),
    checks:Number(row.checks) || 0,
    online,
    offline,
    unknown:Number(row.unknown) || 0,
    availability:known ? Number((online / known * 100).toFixed(2)) : null,
    averageLatencyMs:row.latencySamples ? Math.round(Number(row.latencyTotal) / Number(row.latencySamples)) : null,
    minLatencyMs:row.minLatencyMs ?? null,
    maxLatencyMs:row.maxLatencyMs ?? null,
  };
}

function summarize(item, rows, dayKeys, includeDetails, incidents = []) {
  const byDay = new Map(rows.map((row) => [row.day,row]));
  const daily = dayKeys.map((date) => dailyValue(date,byDay.get(date)));
  const online = rows.reduce((sum,row) => sum + (Number(row.online) || 0),0);
  const offline = rows.reduce((sum,row) => sum + (Number(row.offline) || 0),0);
  const checks = rows.reduce((sum,row) => sum + (Number(row.checks) || 0),0);
  const latencyTotal = rows.reduce((sum,row) => sum + (Number(row.latencyTotal) || 0),0);
  const latencySamples = rows.reduce((sum,row) => sum + (Number(row.latencySamples) || 0),0);
  const currentStatus = item.status || 'unknown';
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
    lastCheckedAtMs:storedTimestamp(item.last_checked_at ?? item.lastCheckedAt),
    availability:online + offline ? Number((online / (online + offline) * 100).toFixed(2)) : null,
    averageLatencyMs:latencySamples ? Math.round(latencyTotal / latencySamples) : null,
    checks,
    daily,
  };
  if (includeDetails) value.incidents = incidents;
  return value;
}

function availabilityForItems(db, items, options = {}) {
  const days = clampDays(options.days);
  const now = options.now || Date.now();
  const selected = period(days,now);
  const repository = repositoryFor(db);
  const rows = repository.loadDaily(items.map((item) => item.id),selected.days[0],selected.days.at(-1));
  const byItem = new Map();
  for (const row of rows) {
    const list = byItem.get(row.itemId) || [];
    list.push(row);
    byItem.set(row.itemId,list);
  }
  options.onStats?.({ resourceCount:items.length, aggregateRows:rows.length, days });
  return items.map((item) => summarize(
    item,
    byItem.get(item.id) || [],
    selected.days,
    Boolean(options.includeDetails),
    options.includeDetails ? repository.loadIncidents(item.id,selected.from,selected.to) : [],
  ));
}

function availabilityDayForItem(db, item, date, options = {}) {
  const from = Date.parse(`${date}T00:00:00Z`);
  const to = from + DAY_MS;
  const repository = repositoryFor(db);
  const [row] = repository.loadDaily([item.id],date,date);
  const rawRetentionDays = retentionDays(options.retentionDays);
  const detailAvailable = from >= Date.now() - rawRetentionDays * DAY_MS;
  const events = detailAvailable ? repository.loadRaw(item.id,from,to) : [];
  const incidents = repository.loadIncidents(item.id,from,to);
  const summary = summarize(item,row ? [row] : [],[date],true,incidents);
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
    incidents,
    detailAvailable,
    detailRetentionDays:rawRetentionDays,
  };
}

module.exports = { availabilityForItems, availabilityDayForItem, clampDays, DEGRADED_LATENCY_MS };
