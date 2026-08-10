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

function dimension(column, from, event = "item.clicked", limit = 10) {
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
  return db
    .prepare(
      `SELECT COALESCE(${column},'unknown') name,COUNT(*) value FROM analytics_events WHERE event_name=? AND occurred_at_ms>=? GROUP BY ${column} ORDER BY value DESC LIMIT ?`,
    )
    .all(event, from, limit);
}

router.get("/summary", (req, res) => {
  const { days, from, to } = range(req);
  const trend = db
    .prepare(
      `WITH RECURSIVE dates(day) AS (
    SELECT date(?/1000,'unixepoch') UNION ALL SELECT date(day,'+1 day') FROM dates WHERE day<date(?/1000,'unixepoch')
  ) SELECT day,
    (SELECT COUNT(*) FROM analytics_events e WHERE e.event_name='item.clicked' AND date(e.occurred_at_ms/1000,'unixepoch')=day) opens,
    (SELECT COUNT(DISTINCT user_id) FROM analytics_events e WHERE e.user_id IS NOT NULL AND date(e.occurred_at_ms/1000,'unixepoch')=day) activeUsers,
    (SELECT COUNT(*) FROM users u WHERE date(u.created_at)=day) newUsers,
    (SELECT COUNT(*) FROM security_audit_events a WHERE a.event_type='item.created' AND date(a.occurred_at_ms/1000,'unixepoch')=day) newResources,
    (SELECT COUNT(*) FROM security_audit_events a WHERE a.event_type IN ('ai.plan.created','ai.plan.executed') AND date(a.occurred_at_ms/1000,'unixepoch')=day) aiUses
    FROM dates`,
    )
    .all(from, to);

  const topResources = db
    .prepare(
      `SELECT e.item_id id,
      COALESCE(MAX(i.name),MAX(e.item_name),'历史资源') name,
      COALESCE(MAX(i.url),MAX(e.item_url),'') url,
      COALESCE(MAX(i.description),MAX(e.item_description),'') description,
      COALESCE(MAX(i.icon),MAX(e.item_icon),'icon:link') icon,
      MAX(e.scope) scope,COUNT(*) value,
      CASE WHEN MAX(i.id) IS NULL THEN 1 ELSE 0 END deleted
    FROM analytics_events e LEFT JOIN items i ON i.id=e.item_id
    WHERE e.event_name='item.clicked' AND e.occurred_at_ms>=?
    GROUP BY e.item_id ORDER BY value DESC LIMIT 12`,
    )
    .all(from);

  const total = db
    .prepare(
      "SELECT COUNT(*) count FROM analytics_events WHERE event_name='item.clicked' AND occurred_at_ms>=?",
    )
    .get(from).count;
  const activeUsers = db
    .prepare(
      "SELECT COUNT(DISTINCT user_id) count FROM analytics_events WHERE user_id IS NOT NULL AND occurred_at_ms>=?",
    )
    .get(from).count;
  const users = db
    .prepare("SELECT COUNT(*) count FROM users WHERE status='active'")
    .get().count;
  const resources = db.prepare("SELECT COUNT(*) count FROM items").get().count;
  const onlineUsers = db
    .prepare(
      "SELECT COUNT(DISTINCT user_id) count FROM sessions WHERE revoked_at IS NULL AND idle_expires_at>? AND absolute_expires_at>?",
    )
    .get(to, to).count;
  const newUsers = trend.reduce((sum, row) => sum + row.newUsers, 0);
  const newResources = trend.reduce((sum, row) => sum + row.newResources, 0);
  const aiUses = trend.reduce((sum, row) => sum + row.aiUses, 0);

  const statuses = db
    .prepare(
      "SELECT COALESCE(status,'unknown') name,COUNT(*) value FROM items GROUP BY status ORDER BY value DESC",
    )
    .all();
  const categories = db
    .prepare(
      "SELECT COALESCE(categories.name,'未分类') name,COUNT(items.id) value FROM items LEFT JOIN categories ON categories.id=items.category_id GROUP BY items.category_id ORDER BY value DESC LIMIT 12",
    )
    .all();
  const ownership = db
    .prepare(
      `SELECT
    SUM(CASE WHEN scope='public' THEN 1 ELSE 0 END) publicResources,
    SUM(CASE WHEN scope='personal' THEN 1 ELSE 0 END) personalResources,
    COUNT(DISTINCT CASE WHEN scope='personal' THEN owner_id END) usersWithResources
    FROM items`,
    )
    .get();
  const heatmap = db
    .prepare(
      "SELECT CAST(strftime('%w',occurred_at_ms/1000,'unixepoch') AS INTEGER) weekday,CAST(strftime('%H',occurred_at_ms/1000,'unixepoch') AS INTEGER) hour,COUNT(*) value FROM analytics_events WHERE event_name='item.clicked' AND occurred_at_ms>=? GROUP BY weekday,hour",
    )
    .all(from);

  res.json({
    days,
    summary: {
      opens: total,
      activeUsers,
      onlineUsers,
      users,
      resources,
      newUsers,
      newResources,
      aiUses,
    },
    trend,
    topResources,
    sources: dimension("surface", from),
    devices: dimension("device_class", from),
    spaces: dimension("scope", from),
    browsers: dimension("browser_family", from),
    systems: dimension("os_family", from),
    regions: dimension("country_code", from),
    networks: dimension("ip_prefix", from),
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
