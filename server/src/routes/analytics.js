const express = require("express");
const db = require("../db");
const { requireAdmin, requirePasswordChanged } = require("../middleware/auth");

const router = express.Router();
router.use(requireAdmin, requirePasswordChanged);

function range(req) {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
  const to = Date.now();
  return { days, to, from: to - (days - 1) * 86400000 };
}

function filters(req) {
  const scope = ["all", "public", "personal"].includes(req.query.scope)
    ? req.query.scope
    : "all";
  const ownerId = scope === "personal" && req.query.ownerId
    ? String(req.query.ownerId).slice(0, 100)
    : null;
  return { scope, ownerId };
}

function eventWhere({ from, scope, ownerId }, alias = "e") {
  const clauses = [`${alias}.occurred_at_ms>=?`];
  const params = [from];
  if (scope !== "all") {
    clauses.push(`${alias}.scope=?`);
    params.push(scope);
  }
  if (ownerId) {
    clauses.push(`COALESCE(${alias}.item_owner_id,(SELECT owner_id FROM items WHERE id=${alias}.item_id))=?`);
    params.push(ownerId);
  }
  return { sql: clauses.join(" AND "), params };
}

function resourceWhere({ scope, ownerId }, alias = "i") {
  const clauses = [];
  const params = [];
  if (scope !== "all") {
    clauses.push(`${alias}.scope=?`);
    params.push(scope);
  }
  if (ownerId) {
    clauses.push(`${alias}.owner_id=?`);
    params.push(ownerId);
  }
  return { sql: clauses.length ? clauses.join(" AND ") : "1=1", params };
}

function aiWhere({ from, scope, ownerId }, alias = "a") {
  const clauses = [`${alias}.created_at_ms>=?`];
  const params = [from];
  if (scope !== "all") {
    clauses.push(`${alias}.realm_scope=?`);
    params.push(scope);
  }
  if (ownerId) {
    clauses.push(`${alias}.realm_owner_id=?`);
    params.push(ownerId);
  }
  return { sql: clauses.join(" AND "), params };
}

function dimension(column, current, limit = 10) {
  const allowed = new Set([
    "surface",
    "device_class",
    "scope",
    "browser_family",
    "os_family",
    "country_code",
    "ip_prefix",
  ]);
  if (!allowed.has(column)) throw new Error("Invalid analytics dimension");
  const where = eventWhere(current);
  return db
    .prepare(
      `SELECT COALESCE(${column},'unknown') name,COUNT(*) value
       FROM analytics_events e
       WHERE e.event_name='item.clicked' AND ${where.sql}
       GROUP BY ${column} ORDER BY value DESC LIMIT ?`,
    )
    .all(...where.params, limit);
}

function dailySeries(from, days, rows, fields) {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(from + index * 86400000).toISOString().slice(0, 10);
    const source = byDay.get(day) || {};
    return Object.fromEntries([["day", day], ...fields.map((field) => [field, Number(source[field]) || 0])]);
  });
}

function percentile(values, ratio) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
}

function utcWeekStart(value) {
  const date = new Date(value);
  const day = date.getUTCDay() || 7;
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.getTime();
}

router.get("/users", (req, res) => {
  const rows = db.prepare(`
    SELECT u.id,u.username,u.display_name AS displayName,u.status,
      (SELECT COUNT(*) FROM items i WHERE i.owner_id=u.id AND i.scope='personal') resourceCount,
      (SELECT COUNT(*) FROM categories c WHERE c.owner_id=u.id AND c.scope='personal') categoryCount,
      (SELECT COUNT(*) FROM analytics_events e WHERE e.item_owner_id=u.id AND e.event_name='item.clicked') visitCount
    FROM users u
    WHERE u.status!='pending_claim'
    ORDER BY resourceCount DESC,displayName COLLATE NOCASE
  `).all();
  res.json({ items: rows });
});

router.get("/summary", (req, res) => {
  const { days, from, to } = range(req);
  const selected = filters(req);
  const current = { ...selected, from };
  const event = eventWhere(current);
  const resource = resourceWhere(current);
  const aiFilter = aiWhere(current);

  const trendRows = db.prepare(`
    SELECT date(e.occurred_at_ms/1000,'unixepoch') day,
      COUNT(*) opens,COUNT(DISTINCT e.user_id) activeUsers,
      COUNT(DISTINCT e.item_id) openedResources
    FROM analytics_events e
    WHERE e.event_name='item.clicked' AND ${event.sql}
    GROUP BY day ORDER BY day
  `).all(...event.params);
  const trend = dailySeries(from, days, trendRows, ["opens", "activeUsers", "openedResources"]);

  const topResources = db
    .prepare(
      `SELECT e.item_id id,
      COALESCE(MAX(i.name),MAX(e.item_name),'历史资源') name,
      COALESCE(MAX(i.url),MAX(e.item_url),'') url,
      COALESCE(MAX(i.description),MAX(e.item_description),'') description,
      COALESCE(MAX(i.icon),MAX(e.item_icon),'icon:link') icon,
      MAX(e.scope) scope,COUNT(*) value,
      CASE WHEN MAX(i.id) IS NULL THEN 1 ELSE 0 END deleted,
      COALESCE(MAX(i.owner_id),MAX(e.item_owner_id)) ownerId,
      MAX(u.display_name) ownerName,MAX(c.name) categoryName,
      COUNT(DISTINCT e.user_id) uniqueVisitors,MAX(e.occurred_at_ms) lastOpenedAt
    FROM analytics_events e
    LEFT JOIN items i ON i.id=e.item_id
    LEFT JOIN users u ON u.id=COALESCE(i.owner_id,e.item_owner_id)
    LEFT JOIN categories c ON c.id=i.category_id
    WHERE e.event_name='item.clicked' AND ${event.sql}
    GROUP BY e.item_id ORDER BY value DESC LIMIT 20`,
    )
    .all(...event.params);

  const accessSummary = db.prepare(`
    SELECT COUNT(*) opens,COUNT(DISTINCT e.user_id) activeUsers,
      COUNT(DISTINCT e.item_id) openedResources
    FROM analytics_events e
    WHERE e.event_name='item.clicked' AND ${event.sql}
  `).get(...event.params);
  const users = db
    .prepare("SELECT COUNT(*) count FROM users WHERE status='active'")
    .get().count;
  const resources = db.prepare(`SELECT COUNT(*) count FROM items i WHERE ${resource.sql}`).get(...resource.params).count;
  const onlineUsers = db
    .prepare(
      "SELECT COUNT(DISTINCT user_id) count FROM sessions WHERE revoked_at IS NULL AND idle_expires_at>? AND absolute_expires_at>?",
    )
    .get(to, to).count;
  const newUsers = selected.scope === "all"
    ? db.prepare("SELECT COUNT(*) count FROM users WHERE strftime('%s',created_at)*1000>=?").get(from).count
    : 0;
  const newResources = db.prepare(`SELECT COUNT(*) count FROM items i WHERE ${resource.sql} AND strftime('%s',i.created_at)*1000>=?`).get(...resource.params, from).count;

  const statuses = db
    .prepare(
      `SELECT COALESCE(i.status,'unknown') name,COUNT(*) value FROM items i WHERE ${resource.sql} GROUP BY i.status ORDER BY value DESC`,
    )
    .all(...resource.params);
  const categories = db
    .prepare(
      `SELECT COALESCE(c.name,'未分类') name,COUNT(i.id) value,c.id
       FROM items i LEFT JOIN categories c ON c.id=i.category_id
       WHERE ${resource.sql} GROUP BY i.category_id ORDER BY value DESC LIMIT 12`,
    )
    .all(...resource.params);
  const ownership = db
    .prepare(
      `SELECT
    SUM(CASE WHEN scope='public' THEN 1 ELSE 0 END) publicResources,
    SUM(CASE WHEN scope='personal' THEN 1 ELSE 0 END) personalResources,
    COUNT(DISTINCT CASE WHEN scope='personal' THEN owner_id END) usersWithResources
    FROM items i WHERE ${resource.sql}`,
    )
    .get(...resource.params);
  const heatmap = db
    .prepare(
      `SELECT CAST(strftime('%w',e.occurred_at_ms/1000,'unixepoch') AS INTEGER) weekday,
       CAST(strftime('%H',e.occurred_at_ms/1000,'unixepoch') AS INTEGER) hour,COUNT(*) value
       FROM analytics_events e WHERE e.event_name='item.clicked' AND ${event.sql} GROUP BY weekday,hour`,
    )
    .all(...event.params);
  const regionCoverageRaw = db.prepare(`
    SELECT COUNT(*) total,
      SUM(CASE WHEN e.country_code IS NOT NULL AND e.country_code!='' THEN 1 ELSE 0 END) known,
      SUM(CASE WHEN e.country_source='proxy_header' THEN 1 ELSE 0 END) proxyHeader,
      SUM(CASE WHEN e.country_source='geoip_database' THEN 1 ELSE 0 END) geoIpDatabase,
      SUM(CASE WHEN e.country_source='legacy' OR (e.country_code IS NOT NULL AND e.country_code!='' AND e.country_source IS NULL) THEN 1 ELSE 0 END) legacy
    FROM analytics_events e
    WHERE e.event_name='item.clicked' AND ${event.sql}
  `).get(...event.params);
  const regionCoverage = {
    total:Number(regionCoverageRaw.total)||0,
    known:Number(regionCoverageRaw.known)||0,
    unknown:(Number(regionCoverageRaw.total)||0)-(Number(regionCoverageRaw.known)||0),
    rate:regionCoverageRaw.total ? Number(((Number(regionCoverageRaw.known||0)/regionCoverageRaw.total)*100).toFixed(1)) : 0,
    source:Number(regionCoverageRaw.geoIpDatabase)>0?(Number(regionCoverageRaw.proxyHeader)>0?'mixed':'geoip_database'):(Number(regionCoverageRaw.proxyHeader)>0?'proxy_country_header':(Number(regionCoverageRaw.legacy)>0?'legacy':'unavailable')),
    sources:{proxyHeader:Number(regionCoverageRaw.proxyHeader)||0,geoIpDatabase:Number(regionCoverageRaw.geoIpDatabase)||0,legacy:Number(regionCoverageRaw.legacy)||0},
  };

  const visitorRows = db.prepare(`
    SELECT e.user_id id,COALESCE(u.display_name,u.username,'匿名用户') name,u.username,
      COUNT(*) value,COUNT(DISTINCT e.item_id) resources,MAX(e.occurred_at_ms) lastActiveAt
    FROM analytics_events e LEFT JOIN users u ON u.id=e.user_id
    WHERE e.event_name='item.clicked' AND ${event.sql}
    GROUP BY e.user_id ORDER BY value DESC LIMIT 20
  `).all(...event.params);

  const activityWindows = Object.fromEntries([1, 7, 30].map((windowDays) => {
    const where = eventWhere({ ...selected, from: to - windowDays * 86400000 });
    const count = db.prepare(`SELECT COUNT(DISTINCT e.user_id) count FROM analytics_events e WHERE e.event_name='item.clicked' AND e.user_id IS NOT NULL AND ${where.sql}`).get(...where.params).count;
    return [windowDays, Number(count) || 0];
  }));
  const allTimeEvent = eventWhere({ ...selected, from: 0 });
  const activeLifecycle = db.prepare(`
    SELECT COUNT(*) activeUsers,
      SUM(CASE WHEN firstAt<? THEN 1 ELSE 0 END) returningUsers,
      SUM(CASE WHEN firstAt>=? THEN 1 ELSE 0 END) newlyActiveUsers
    FROM (
      SELECT e.user_id,MIN(e.occurred_at_ms) firstAt,MAX(e.occurred_at_ms) lastAt
      FROM analytics_events e
      WHERE e.event_name='item.clicked' AND e.user_id IS NOT NULL AND ${allTimeEvent.sql}
      GROUP BY e.user_id HAVING lastAt>=?
    )
  `).get(from, from, ...allTimeEvent.params, from);
  const cohortEnd = utcWeekStart(to) + 7 * 86400000;
  const cohortStart = cohortEnd - 8 * 7 * 86400000;
  const firstActivityRows = db.prepare(`
    SELECT e.user_id userId,MIN(e.occurred_at_ms) firstAt
    FROM analytics_events e
    WHERE e.event_name='item.clicked' AND e.user_id IS NOT NULL AND ${allTimeEvent.sql}
    GROUP BY e.user_id HAVING firstAt>=? AND firstAt<?
  `).all(...allTimeEvent.params, cohortStart, cohortEnd);
  const cohortActivityWhere = eventWhere({ ...selected, from: cohortStart });
  const cohortActivityRows = db.prepare(`
    SELECT DISTINCT e.user_id userId,date(e.occurred_at_ms/1000,'unixepoch') day
    FROM analytics_events e
    WHERE e.event_name='item.clicked' AND e.user_id IS NOT NULL AND ${cohortActivityWhere.sql}
  `).all(...cohortActivityWhere.params);
  const activityWeeks = new Map();
  cohortActivityRows.forEach((row) => {
    if (!activityWeeks.has(row.userId)) activityWeeks.set(row.userId, new Set());
    activityWeeks.get(row.userId).add(utcWeekStart(`${row.day}T00:00:00Z`));
  });
  const cohorts = Array.from({ length: 8 }, (_, index) => {
    const weekAt = cohortStart + index * 7 * 86400000;
    const members = firstActivityRows.filter((row) => utcWeekStart(row.firstAt) === weekAt);
    const retention = [0, 1, 2, 3].map((offset) => members.length ? Number((members.filter((row) => activityWeeks.get(row.userId)?.has(weekAt + offset * 7 * 86400000)).length / members.length * 100).toFixed(1)) : null);
    return { week:new Date(weekAt).toISOString().slice(0,10), users:members.length, retention };
  }).filter((row) => row.users || new Date(`${row.week}T00:00:00Z`).getTime() >= cohortEnd - 4 * 7 * 86400000);
  const accountGrowthRows = selected.scope === 'all' ? db.prepare(`SELECT date(strftime('%s',created_at),'unixepoch') day,COUNT(*) registrations FROM users WHERE status!='pending_claim' AND strftime('%s',created_at)*1000>=? GROUP BY day ORDER BY day`).all(from) : [];

  const resourceRows = db.prepare(`
    SELECT i.id,i.name,i.status,i.latency_ms latencyMs,i.last_checked_at lastCheckedAt,
      i.check_enabled checkEnabled,i.tags_json tagsJson,i.category_id categoryId,i.created_at createdAt,
      COALESCE(v.visits,0) visits,COALESCE(v.uniqueVisitors,0) uniqueVisitors,
      (SELECT MAX(e2.occurred_at_ms) FROM analytics_events e2 WHERE e2.event_name='item.clicked' AND e2.item_id=i.id) lastVisitedAt
    FROM items i
    LEFT JOIN (
      SELECT e.item_id,COUNT(*) visits,COUNT(DISTINCT e.user_id) uniqueVisitors
      FROM analytics_events e WHERE e.event_name='item.clicked' AND ${event.sql} GROUP BY e.item_id
    ) v ON v.item_id=i.id
    WHERE ${resource.sql}
  `).all(...event.params, ...resource.params);
  const positiveVisits = resourceRows.map((row) => Number(row.visits) || 0).filter(Boolean).sort((a,b)=>a-b);
  const highUseThreshold = Math.max(2, percentile(positiveVisits, .5) || 2);
  const matrix = [
    { name:'high-online', value:resourceRows.filter((row)=>row.visits>=highUseThreshold&&row.status==='online').length },
    { name:'high-risk', value:resourceRows.filter((row)=>row.visits>=highUseThreshold&&row.status!=='online').length },
    { name:'low-online', value:resourceRows.filter((row)=>row.visits<highUseThreshold&&row.status==='online').length },
    { name:'low-risk', value:resourceRows.filter((row)=>row.visits<highUseThreshold&&row.status!=='online').length },
  ];
  const latencyValues = resourceRows.map((row)=>row.latencyMs).filter((value)=>value!=null);
  const staleBefore = to - 90 * 86400000;
  const health = {
    total:resourceRows.length,
    checked:resourceRows.filter((row)=>row.lastCheckedAt).length,
    checkCoverage:resourceRows.length ? Number((resourceRows.filter((row)=>row.lastCheckedAt).length/resourceRows.length*100).toFixed(1)) : 0,
    neverVisited:resourceRows.filter((row)=>!row.lastVisitedAt).length,
    stale90Days:resourceRows.filter((row)=>!row.lastVisitedAt||row.lastVisitedAt<staleBefore).length,
    highUseOffline:resourceRows.filter((row)=>row.visits>=highUseThreshold&&row.status==='offline').length,
    checksDisabled:resourceRows.filter((row)=>!row.checkEnabled).length,
    latency:{p50:percentile(latencyValues,.5),p95:percentile(latencyValues,.95),p99:percentile(latencyValues,.99)},
    highUseThreshold,
  };
  const healthClauses=['h.checked_at_ms>=?'],healthParams=[from];
  if(selected.scope!=='all'){healthClauses.push('h.scope=?');healthParams.push(selected.scope);}
  if(selected.ownerId){healthClauses.push('h.owner_id=?');healthParams.push(selected.ownerId);}
  const healthTrendRows=db.prepare(`SELECT date(h.checked_at_ms/1000,'unixepoch') day,COUNT(*) checks,SUM(CASE WHEN h.status='online' THEN 1 ELSE 0 END) online,SUM(CASE WHEN h.status='offline' THEN 1 ELSE 0 END) offline,ROUND(AVG(CASE WHEN h.status='online' THEN h.latency_ms END)) averageLatencyMs FROM resource_health_events h WHERE ${healthClauses.join(' AND ')} GROUP BY day ORDER BY day`).all(...healthParams);
  const healthTrend=dailySeries(from,days,healthTrendRows,['checks','online','offline','averageLatencyMs']).map((row)=>({...row,availability:row.checks?Number((row.online/row.checks*100).toFixed(1)):null}));
  const firstHealthEvent=db.prepare('SELECT MIN(checked_at_ms) startedAt FROM resource_health_events').get().startedAt;
  const slowResources = resourceRows.filter((row)=>row.latencyMs!=null).sort((a,b)=>b.latencyMs-a.latencyMs).slice(0,10).map(({id,name,latencyMs,status,visits})=>({id,name,latencyMs,status,visits}));
  const tagCounts = new Map();
  resourceRows.forEach((row)=>{try{JSON.parse(row.tagsJson||'[]').forEach((tag)=>tagCounts.set(String(tag),1+(tagCounts.get(String(tag))||0)));}catch{/* legacy tags */}});
  const categoryHealth = {
    uncategorized:resourceRows.filter((row)=>!row.categoryId).length,
    withoutTags:resourceRows.filter((row)=>{try{return !JSON.parse(row.tagsJson||'[]').length;}catch{return true;}}).length,
    tags:[...tagCounts].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value).slice(0,15),
  };

  const searchWhere = `e.occurred_at_ms>=?`;
  const searchRows = selected.scope === 'all' ? db.prepare(`SELECT e.id,e.user_id userId,e.occurred_at_ms occurredAt,json_extract(e.properties_json,'$.term') term,CAST(json_extract(e.properties_json,'$.resultCount') AS INTEGER) resultCount,CAST(json_extract(e.properties_json,'$.latencyMs') AS INTEGER) latencyMs FROM analytics_events e WHERE e.event_name='search.performed' AND ${searchWhere}`).all(from) : [];
  const searchClicks = selected.scope === 'all' ? db.prepare(`SELECT json_extract(e.properties_json,'$.searchEventId') searchEventId,json_extract(e.properties_json,'$.term') term,CAST(json_extract(e.properties_json,'$.position') AS INTEGER) position,e.occurred_at_ms occurredAt FROM analytics_events e WHERE e.event_name='search.result_clicked' AND ${searchWhere}`).all(from) : [];
  const clickedSearches = new Set(searchClicks.map((row)=>row.searchEventId).filter(Boolean));
  const searchLatencies = searchRows.map((row)=>row.latencyMs).filter((value)=>value!=null);
  const searchTermMap = new Map();
  searchRows.filter((row)=>row.term&&row.term!=='[sensitive]').forEach((row)=>{const currentTerm=searchTermMap.get(row.term)||{name:row.term,value:0,noResult:0,clicks:0};currentTerm.value+=1;currentTerm.noResult+=row.resultCount===0?1:0;currentTerm.clicks+=clickedSearches.has(row.id)?1:0;searchTermMap.set(row.term,currentTerm);});
  const searchTrendRows = new Map();
  searchRows.forEach((row)=>{const day=new Date(row.occurredAt).toISOString().slice(0,10),currentDay=searchTrendRows.get(day)||{day,searches:0,noResults:0,clicks:0};currentDay.searches+=1;currentDay.noResults+=row.resultCount===0?1:0;currentDay.clicks+=clickedSearches.has(row.id)?1:0;searchTrendRows.set(day,currentDay);});
  const searchFirstEvent = db.prepare("SELECT MIN(occurred_at_ms) startedAt FROM analytics_events WHERE event_name='search.performed'").get().startedAt;
  const searchAnalytics = {
    available:selected.scope==='all',startedAt:searchFirstEvent||null,
    summary:{searches:searchRows.length,users:new Set(searchRows.map((row)=>row.userId).filter(Boolean)).size,clicks:clickedSearches.size,clickThroughRate:searchRows.length?Number((clickedSearches.size/searchRows.length*100).toFixed(1)):0,noResultRate:searchRows.length?Number((searchRows.filter((row)=>row.resultCount===0).length/searchRows.length*100).toFixed(1)):0,averageLatencyMs:searchRows.length?Math.round(searchLatencies.reduce((sum,value)=>sum+value,0)/(searchLatencies.length||1)):null,p95LatencyMs:percentile(searchLatencies,.95),averageClickPosition:searchClicks.length?Number((searchClicks.reduce((sum,row)=>sum+(row.position||0),0)/searchClicks.length).toFixed(1)):null},
    trend:dailySeries(from,days,[...searchTrendRows.values()],['searches','noResults','clicks']),
    terms:[...searchTermMap.values()].sort((a,b)=>b.value-a.value).slice(0,15),
    zeroResultTerms:[...searchTermMap.values()].filter((row)=>row.noResult).sort((a,b)=>b.noResult-a.noResult).slice(0,12),
  };
  const shareRows = selected.scope === 'personal' ? db.prepare(`SELECT s.status,s.created_at_ms createdAt,s.responded_at_ms respondedAt,json_array_length(s.snapshot_json,'$.items') itemCount,json_extract(s.snapshot_json,'$.sourceScope') sourceScope FROM resource_shares s WHERE s.created_at_ms>=? ${selected.ownerId?'AND s.sender_user_id=?':''}`).all(from,...(selected.ownerId?[selected.ownerId]:[])) : [];
  const collaboration = {
    available:selected.scope==='personal',
    summary:{shares:shareRows.length,items:shareRows.reduce((sum,row)=>sum+(Number(row.itemCount)||0),0),accepted:shareRows.filter((row)=>row.status==='accepted').length,pending:shareRows.filter((row)=>row.status==='pending').length,rejected:shareRows.filter((row)=>row.status==='rejected').length,acceptanceRate:shareRows.filter((row)=>row.status!=='pending').length?Number((shareRows.filter((row)=>row.status==='accepted').length/shareRows.filter((row)=>row.status!=='pending').length*100).toFixed(1)):0,averageResponseHours:(()=>{const values=shareRows.filter((row)=>row.respondedAt).map((row)=>(row.respondedAt-row.createdAt)/3600000);return values.length?Number((values.reduce((sum,value)=>sum+value,0)/values.length).toFixed(1)):null;})()},
    statuses:['accepted','pending','rejected'].map((name)=>({name,value:shareRows.filter((row)=>row.status===name).length})),
  };

  const aiSummaryRaw = db.prepare(`
    SELECT COUNT(*) requests,COUNT(DISTINCT a.actor_user_id) users,
      COALESCE(SUM(a.input_tokens),0) inputTokens,COALESCE(SUM(a.output_tokens),0) outputTokens,
      COALESCE(SUM(COALESCE(a.input_tokens,0)+COALESCE(a.output_tokens,0)),0) totalTokens,
      COALESCE(ROUND(AVG(a.latency_ms)),0) averageLatencyMs,
      ROUND(AVG(a.first_token_ms)) averageFirstTokenMs,
      COALESCE(SUM(a.success),0) successes,
      COUNT(a.first_token_ms) streamedRequests
    FROM ai_usage_events a WHERE ${aiFilter.sql}
  `).get(...aiFilter.params);
  const minuteRows = db.prepare(`
    SELECT strftime('%Y-%m-%d %H:%M',a.created_at_ms/1000,'unixepoch') minute,
      COUNT(*) requests,SUM(COALESCE(a.input_tokens,0)+COALESCE(a.output_tokens,0)) tokens
    FROM ai_usage_events a WHERE ${aiFilter.sql} GROUP BY minute
  `).all(...aiFilter.params);
  const aiTrendRows = db.prepare(`
    SELECT date(a.created_at_ms/1000,'unixepoch') day,COUNT(*) requests,
      SUM(COALESCE(a.input_tokens,0)) inputTokens,SUM(COALESCE(a.output_tokens,0)) outputTokens,
      SUM(COALESCE(a.input_tokens,0)+COALESCE(a.output_tokens,0)) totalTokens,
      ROUND(AVG(a.latency_ms)) averageLatencyMs,ROUND(AVG(a.first_token_ms)) averageFirstTokenMs,
      ROUND(AVG(a.success)*100,1) successRate
    FROM ai_usage_events a WHERE ${aiFilter.sql} GROUP BY day ORDER BY day
  `).all(...aiFilter.params);
  const aiUsers = db.prepare(`
    SELECT a.actor_user_id id,COALESCE(u.display_name,u.username,'系统任务') name,u.username,
      COUNT(*) requests,SUM(COALESCE(a.input_tokens,0)+COALESCE(a.output_tokens,0)) totalTokens,
      ROUND(AVG(a.latency_ms)) averageLatencyMs,ROUND(AVG(a.first_token_ms)) averageFirstTokenMs,
      ROUND(AVG(a.success)*100,1) successRate
    FROM ai_usage_events a LEFT JOIN users u ON u.id=a.actor_user_id
    WHERE ${aiFilter.sql} GROUP BY a.actor_user_id ORDER BY totalTokens DESC,requests DESC LIMIT 20
  `).all(...aiFilter.params);
  const aiDimension = (column) => db.prepare(`
    SELECT COALESCE(a.${column},'unknown') name,COUNT(*) requests,
      SUM(COALESCE(a.input_tokens,0)+COALESCE(a.output_tokens,0)) totalTokens
    FROM ai_usage_events a WHERE ${aiFilter.sql} GROUP BY a.${column} ORDER BY requests DESC LIMIT 10
  `).all(...aiFilter.params);
  const activeMinutes = minuteRows.length || 1;
  const aiSummary = {
    ...aiSummaryRaw,
    successRate: aiSummaryRaw.requests ? Number(((aiSummaryRaw.successes / aiSummaryRaw.requests) * 100).toFixed(1)) : 0,
    peakRpm: Math.max(0, ...minuteRows.map((row) => row.requests)),
    peakTpm: Math.max(0, ...minuteRows.map((row) => row.tokens)),
    averageRpm: Number((aiSummaryRaw.requests / activeMinutes).toFixed(1)),
    averageTpm: Number((aiSummaryRaw.totalTokens / activeMinutes).toFixed(1)),
    p95LatencyMs: percentile(db.prepare(`SELECT a.latency_ms value FROM ai_usage_events a WHERE ${aiFilter.sql}`).all(...aiFilter.params).map((row)=>row.value),.95),
    p95FirstTokenMs: percentile(db.prepare(`SELECT a.first_token_ms value FROM ai_usage_events a WHERE a.first_token_ms IS NOT NULL AND ${aiFilter.sql}`).all(...aiFilter.params).map((row)=>row.value),.95),
  };
  const aiUses = aiSummary.requests;
  const summary = {
    opens: accessSummary.opens,
    activeUsers: accessSummary.activeUsers,
    openedResources: accessSummary.openedResources,
    averageOpensPerUser: accessSummary.activeUsers ? Number((accessSummary.opens / accessSummary.activeUsers).toFixed(1)) : 0,
    onlineUsers,users,resources,newUsers,newResources,aiUses,
  };

  res.json({
    days,
    filters: { ...selected, from, to },
    summary,
    trend,
    topResources,
    sources: dimension("surface", current),
    devices: dimension("device_class", current),
    spaces: dimension("scope", current),
    browsers: dimension("browser_family", current),
    systems: dimension("os_family", current),
    regions: dimension("country_code", current),
    networks: dimension("ip_prefix", current),
    statuses,
    categories,
    ownership: {
      ...ownership,
      averagePersonalResources: ownership.usersWithResources
        ? Number(
            (
              ownership.personalResources / ownership.usersWithResources
            ).toFixed(1),
          )
        : 0,
    },
    heatmap,
    regionCoverage,
    visitors: visitorRows,
    access: {
      trend,topResources,heatmap,visitors:visitorRows,
      sources:dimension("surface",current),devices:dimension("device_class",current),
      browsers:dimension("browser_family",current),systems:dimension("os_family",current),
      regions:dimension("country_code",current),networks:dimension("ip_prefix",current),regionCoverage,
    },
    resources: { statuses,categories,ownership },
    adoption: { summary:{dau:activityWindows[1],wau:activityWindows[7],mau:activityWindows[30],activeUsers:Number(activeLifecycle.activeUsers)||0,returningUsers:Number(activeLifecycle.returningUsers)||0,newlyActiveUsers:Number(activeLifecycle.newlyActiveUsers)||0},cohorts,growth:selected.scope==='all'?dailySeries(from,days,accountGrowthRows,['registrations']):[],definition:'item_activity' },
    resourceQuality: { health,matrix,slowResources,categoryHealth,healthTrend,historyStartedAt:firstHealthEvent||null },
    search: searchAnalytics,
    collaboration,
    ai: {
      summary:aiSummary,
      trend:dailySeries(from,days,aiTrendRows,["requests","inputTokens","outputTokens","totalTokens","averageLatencyMs","averageFirstTokenMs","successRate"]),
      users:aiUsers,
      models:aiDimension("provider_model"),
      features:aiDimension("feature"),
      errors:db.prepare(`SELECT COALESCE(a.error_code,'unknown') name,COUNT(*) value FROM ai_usage_events a WHERE a.success=0 AND ${aiFilter.sql} GROUP BY a.error_code ORDER BY value DESC LIMIT 10`).all(...aiFilter.params),
      notes:{ttft:"streaming_only",throughput:"active_minutes"},
    },
  });
});

router.get("/audit", (req, res) => {
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const total = db
    .prepare("SELECT COUNT(*) count FROM security_audit_events")
    .get().count;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(totalPages, Math.max(1, Number(req.query.page) || 1));
  const rows = db
    .prepare(
      `SELECT id,occurred_at_ms AS occurredAt,event_type AS eventType,outcome,actor_user_id AS actorUserId,actor_username AS actorUsername,actor_role AS actorRole,target_type AS targetType,target_id AS targetId,ip_prefix AS ipPrefix,browser_family AS browserFamily,os_family AS osFamily,device_class AS deviceClass,metadata_json AS metadata FROM security_audit_events ORDER BY occurred_at_ms DESC,id DESC LIMIT ? OFFSET ?`,
    )
    .all(pageSize, (page - 1) * pageSize)
    .map((row) => {
      let metadata = {};
      try {
        metadata = JSON.parse(row.metadata || "{}");
      } catch {
        /* ignore malformed legacy metadata */
      }
      return { ...row, metadata };
    });
  res.json({ items: rows, pagination: { page, pageSize, total, totalPages } });
});

module.exports = router;
