const VALID_INTERVALS = new Set([5,10,15,30,60,120,300,480,720,1440]);

function timestamp(value, fallback = null) {
  if (Number.isFinite(Number(value))) return Number(value);
  if (!value) return fallback;
  const parsed = Date.parse(String(value).includes('T') ? String(value) : `${String(value).replace(' ', 'T')}Z`);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function configFromItem(item) {
  const method = item.check_method ?? item.checkMethod ?? 'none';
  const enabled = Boolean(item.check_enabled ?? item.checkEnabled) && method !== 'none';
  const interval = Number(item.check_interval_minutes ?? item.checkIntervalMinutes) || 5;
  return {
    checkEnabled:enabled,
    checkMethod:enabled ? method : 'none',
    checkTarget:(item.check_target ?? item.checkTarget) || item.url || null,
    checkIntervalMinutes:VALID_INTERVALS.has(interval) ? interval : 5,
    scheduleAnchorAtMs:enabled ? timestamp(item.next_check_at_ms ?? item.nextCheckAtMs) : null,
  };
}

function configFromRow(row) {
  return {
    id:row.id,
    itemId:Number(row.itemId ?? row.item_id),
    checkEnabled:Boolean(row.checkEnabled ?? row.check_enabled),
    checkMethod:row.checkMethod ?? row.check_method,
    checkTarget:row.checkTarget ?? row.check_target ?? null,
    checkIntervalMinutes:Number(row.checkIntervalMinutes ?? row.check_interval_minutes) || 5,
    scheduleAnchorAtMs:timestamp(row.scheduleAnchorAtMs ?? row.schedule_anchor_at_ms),
    effectiveAtMs:timestamp(row.effectiveAtMs ?? row.effective_at_ms),
    source:row.source || 'configuration',
  };
}

function sameConfig(left, right) {
  return Boolean(left?.checkEnabled) === Boolean(right?.checkEnabled)
    && String(left?.checkMethod || 'none') === String(right?.checkMethod || 'none')
    && String(left?.checkTarget || '') === String(right?.checkTarget || '')
    && Number(left?.checkIntervalMinutes || 5) === Number(right?.checkIntervalMinutes || 5);
}

function recordMonitoringConfig(db, item, options = {}) {
  const config = configFromItem(item);
  const effectiveAtMs = timestamp(options.effectiveAtMs,Date.now());
  const scheduleAnchorAtMs = options.scheduleAnchorAtMs === undefined
    ? config.scheduleAnchorAtMs
    : timestamp(options.scheduleAnchorAtMs);
  return db.prepare(`INSERT INTO resource_check_config_history
    (item_id,check_enabled,check_method,check_target,check_interval_minutes,schedule_anchor_at_ms,effective_at_ms,source)
    VALUES(?,?,?,?,?,?,?,?)`).run(
    Number(item.id),
    config.checkEnabled ? 1 : 0,
    config.checkMethod,
    config.checkTarget,
    config.checkIntervalMinutes,
    scheduleAnchorAtMs,
    effectiveAtMs,
    String(options.source || 'configuration'),
  );
}

function backfillMonitoringConfigHistory(db) {
  const items = db.prepare(`SELECT id,url,check_enabled,check_method,check_target,check_interval_minutes,
    next_check_at_ms,created_at,updated_at FROM items ORDER BY id`).all();
  if (!items.length) return 0;
  const transitions = db.prepare(`SELECT item_id,check_interval_minutes,checked_at_ms FROM (
      SELECT item_id,check_interval_minutes,checked_at_ms,id,
        LAG(check_interval_minutes) OVER (PARTITION BY item_id ORDER BY checked_at_ms,id) previous_interval
      FROM resource_health_events WHERE trigger_type<>'manual'
    ) history WHERE previous_interval IS NULL OR previous_interval<>check_interval_minutes
    ORDER BY item_id,checked_at_ms`).all();
  const byItem = new Map();
  for (const row of transitions) {
    const list = byItem.get(Number(row.item_id)) || [];
    list.push(row);
    byItem.set(Number(row.item_id),list);
  }
  let inserted = 0;
  const existing = db.prepare('SELECT 1 FROM resource_check_config_history WHERE item_id=? LIMIT 1');
  for (const item of items) {
    if (existing.get(item.id)) continue;
    const inferred = byItem.get(Number(item.id)) || [];
    const current = configFromItem(item);
    let last = null;
    if (inferred.length) {
      inferred.forEach((row,index) => {
        const eventAt = timestamp(row.checked_at_ms,Date.now());
        const historical = {
          ...item,
          check_enabled:1,
          check_method:item.check_method === 'none' ? 'http' : item.check_method,
          check_interval_minutes:Number(row.check_interval_minutes) || 5,
          next_check_at_ms:eventAt,
        };
        recordMonitoringConfig(db,historical,{
          effectiveAtMs:index === 0 ? Math.min(timestamp(item.created_at,eventAt),eventAt) : eventAt,
          scheduleAnchorAtMs:eventAt,
          source:'migration',
        });
        inserted += 1;
        last = configFromItem(historical);
      });
    }
    if (!last || !sameConfig(last,current)) {
      const fallbackAt = inferred.length ? timestamp(inferred.at(-1).checked_at_ms,Date.now()) + 1 : Date.now();
      recordMonitoringConfig(db,item,{
        effectiveAtMs:Math.max(timestamp(item.created_at,0),timestamp(item.updated_at,fallbackAt)),
        source:'migration',
      });
      inserted += 1;
    }
  }
  return inserted;
}

function loadMonitoringSegments(db, item, fromAtMs, toAtMs) {
  const before = db.prepare(`SELECT id,item_id itemId,check_enabled checkEnabled,check_method checkMethod,
    check_target checkTarget,check_interval_minutes checkIntervalMinutes,schedule_anchor_at_ms scheduleAnchorAtMs,
    effective_at_ms effectiveAtMs,source FROM resource_check_config_history
    WHERE item_id=? AND effective_at_ms<=? ORDER BY effective_at_ms DESC,id DESC LIMIT 1`).get(item.id,fromAtMs);
  const within = db.prepare(`SELECT id,item_id itemId,check_enabled checkEnabled,check_method checkMethod,
    check_target checkTarget,check_interval_minutes checkIntervalMinutes,schedule_anchor_at_ms scheduleAnchorAtMs,
    effective_at_ms effectiveAtMs,source FROM resource_check_config_history
    WHERE item_id=? AND effective_at_ms>? AND effective_at_ms<? ORDER BY effective_at_ms,id`).all(item.id,fromAtMs,toAtMs);
  const changes = [...(before ? [configFromRow(before)] : []),...within.map(configFromRow)];
  const createdAtMs = timestamp(item.created_at ?? item.createdAt);
  const updatedAtMs = timestamp(item.updated_at ?? item.updatedAt);
  const current = { ...configFromItem(item),effectiveAtMs:updatedAtMs || createdAtMs || fromAtMs,source:'current' };
  if (!changes.length && createdAtMs != null && createdAtMs < toAtMs) {
    changes.push({ ...current,effectiveAtMs:Math.max(fromAtMs,createdAtMs) });
  } else if (changes.length && !sameConfig(changes.at(-1),current) && current.effectiveAtMs < toAtMs) {
    changes.push({ ...current,effectiveAtMs:Math.max(fromAtMs,current.effectiveAtMs) });
    changes.sort((a,b) => a.effectiveAtMs - b.effectiveAtMs);
  }
  return changes.map((config,index) => ({
    startAtMs:Math.max(fromAtMs,config.effectiveAtMs),
    endAtMs:Math.min(toAtMs,changes[index + 1]?.effectiveAtMs || toAtMs),
    effectiveAtMs:config.effectiveAtMs,
    checkEnabled:config.checkEnabled,
    checkMethod:config.checkMethod,
    checkTarget:config.checkTarget,
    checkIntervalMinutes:config.checkIntervalMinutes,
    scheduleAnchorAtMs:config.scheduleAnchorAtMs,
    source:config.source,
  })).filter((segment) => segment.endAtMs > segment.startAtMs);
}

module.exports = {
  backfillMonitoringConfigHistory,
  configFromItem,
  loadMonitoringSegments,
  recordMonitoringConfig,
  sameConfig,
};
