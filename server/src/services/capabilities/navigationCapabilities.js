const { CommandBus, capabilityError } = require("./commandBus");
const { createNavigationService, realm } = require("../navigationService");
const { PERMISSIONS } = require("../authorizationService");

const SPACES = new Set(["current", "all_visible", "public", "personal"]);
const DIMENSIONS = new Set(["space", "category", "status", "tag", "domain", "monitoring"]);

function hostname(value) {
  try { return new URL(value).hostname.replace(/^www\./i, "").toLocaleLowerCase(); }
  catch { return "unknown"; }
}

function normalizeSpaces(value, currentScope) {
  const requested = String(value || "current");
  if (!SPACES.has(requested)) throw capabilityError("CAPABILITY_INPUT_INVALID", "空间范围无效");
  if (requested === "all_visible") return ["public", "personal"];
  if (requested === "current") return [currentScope === "public" ? "public" : "personal"];
  return [requested];
}

function categoryPathMap(categories) {
  return new Map(categories.map((category) => [category.id, category.path_label || category.name]));
}

function visibleResources(db, args, context) {
  const navigation = createNavigationService(db), currentScope = context.currentScope === "public" ? "public" : "personal";
  const rows = [];
  for (const space of normalizeSpaces(args.spaces, currentScope)) {
    const current = space === "public" ? realm("public") : realm("personal", context.actor.id);
    const categories = navigation.listCategories(current), paths = categoryPathMap(categories);
    for (const item of navigation.listItems(current)) rows.push({
      id:item.id,
      resourceKey:`${space}:${item.id}`,
      space,
      name:item.name,
      url:item.url,
      description:item.description || "",
      category:paths.get(item.category_id) || "未分类",
      categoryId:item.category_id ?? null,
      status:["online", "offline"].includes(item.status) ? item.status : "unknown",
      monitoring:Boolean(item.check_enabled),
      latency:Number.isFinite(Number(item.latency_ms)) ? Number(item.latency_ms) : null,
      tags:Array.isArray(item.tags) ? item.tags : [],
      domain:hostname(item.url),
      clicks:Number(item.click_count) || 0,
    });
  }
  const filters = args.filters && typeof args.filters === "object" ? args.filters : {};
  return rows.filter((item) => {
    if (filters.status && ![].concat(filters.status).includes(item.status)) return false;
    if (typeof filters.monitoring === "boolean" && item.monitoring !== filters.monitoring) return false;
    if (filters.category && !item.category.toLocaleLowerCase().includes(String(filters.category).toLocaleLowerCase())) return false;
    if (filters.tag && !item.tags.some((tag) => tag.toLocaleLowerCase() === String(filters.tag).toLocaleLowerCase())) return false;
    if (filters.domain && !item.domain.includes(String(filters.domain).toLocaleLowerCase())) return false;
    if (filters.text) {
      const text = `${item.name} ${item.url} ${item.description} ${item.category} ${item.tags.join(" ")}`.toLocaleLowerCase();
      if (!text.includes(String(filters.text).toLocaleLowerCase())) return false;
    }
    return true;
  });
}

function dimensionValues(item, dimension) {
  if (dimension === "tag") return item.tags.length ? item.tags : ["无标签"];
  if (dimension === "monitoring") return [item.monitoring ? "enabled" : "disabled"];
  return [String(item[dimension] ?? "unknown")];
}

function aggregate(rows, dimensions) {
  const groups = new Map();
  function add(row, index, values) {
    if (index >= dimensions.length) {
      const key = JSON.stringify(values), entry = groups.get(key) || { dimensions:{}, resources:0, online:0, offline:0, unknown:0, monitoring:0, latencyTotal:0, latencyCount:0, clicks:0 };
      dimensions.forEach((dimension, offset) => { entry.dimensions[dimension] = values[offset]; });
      entry.resources += 1; entry[row.status] += 1; if (row.monitoring) entry.monitoring += 1;
      if (row.latency != null) { entry.latencyTotal += row.latency; entry.latencyCount += 1; }
      entry.clicks += row.clicks; groups.set(key, entry); return;
    }
    for (const value of dimensionValues(row, dimensions[index])) add(row, index + 1, [...values, value]);
  }
  rows.forEach((row) => add(row, 0, []));
  return [...groups.values()].map((entry) => ({
    ...entry.dimensions,
    resourceCount:entry.resources,
    onlineCount:entry.online,
    offlineCount:entry.offline,
    unknownCount:entry.unknown,
    monitoringCount:entry.monitoring,
    monitoringRate:entry.resources ? Number((entry.monitoring / entry.resources * 100).toFixed(1)) : 0,
    averageLatency:entry.latencyCount ? Math.round(entry.latencyTotal / entry.latencyCount) : null,
    clickCount:entry.clicks,
  }));
}

function createCapabilityBus(db) {
  const bus = new CommandBus();
  bus.register({
    name:"resources.query", description:"查询当前用户可见的导航资源，支持公共空间、本人个人空间和受控筛选。", readOnly:true, permission:PERMISSIONS.PUBLIC_ANALYZE,
    inputSchema:{type:"object",properties:{spaces:{enum:[...SPACES]},filters:{type:"object"},limit:{type:"integer",maximum:1000}}},
    outputSchema:{type:"object",properties:{total:{type:"integer"},rows:{type:"array"}}},
  }, (args, context) => {
    const rows = visibleResources(db, args, context), limit = Math.min(1000, Math.max(1, Number(args.limit) || 500));
    return { total:rows.length, rows:rows.slice(0, limit), truncated:rows.length > limit };
  });
  bus.register({
    name:"resources.aggregate", description:"按空间、分类、状态、标签、域名或探测状态聚合真实资源指标。", readOnly:true, permission:PERMISSIONS.PUBLIC_ANALYZE,
    inputSchema:{type:"object",properties:{spaces:{enum:[...SPACES]},dimensions:{type:"array",items:{enum:[...DIMENSIONS]},maxItems:3},filters:{type:"object"}}},
    outputSchema:{type:"object",properties:{resourceCount:{type:"integer"},rows:{type:"array"}}},
  }, (args, context) => {
    const dimensions = [...new Set([].concat(args.dimensions || []).map(String))].slice(0, 3);
    if (dimensions.some((item) => !DIMENSIONS.has(item))) throw capabilityError("CAPABILITY_INPUT_INVALID", "聚合维度无效");
    const rows = visibleResources(db, args, context);
    return { resourceCount:rows.length, dimensions, rows:aggregate(rows, dimensions) };
  });
  bus.register({
    name:"categories.tree", description:"返回当前用户可见空间的完整分类树。", readOnly:true, permission:PERMISSIONS.PUBLIC_ANALYZE,
    inputSchema:{type:"object",properties:{spaces:{enum:[...SPACES]}}}, outputSchema:{type:"object"},
  }, (args, context) => {
    const navigation = createNavigationService(db), result = [];
    for (const space of normalizeSpaces(args.spaces, context.currentScope)) {
      const current = space === "public" ? realm("public") : realm("personal", context.actor.id);
      result.push({space,categories:navigation.listCategories(current).map((category) => ({id:category.id,name:category.name,path:category.path_label || category.name,parentId:category.parent_id ?? null,depth:category.depth}))});
    }
    return { spaces:result };
  });
  bus.register({
    name:"platform.overview", description:"返回当前用户可见空间的资源、分类、状态和探测覆盖概览。", readOnly:true, permission:PERMISSIONS.PUBLIC_ANALYZE,
    inputSchema:{type:"object",properties:{spaces:{enum:[...SPACES]}}}, outputSchema:{type:"object"},
  }, (args, context) => {
    const rows = visibleResources(db, args, context), categories = new Set(rows.map((item) => `${item.space}:${item.category}`));
    const count = (predicate) => rows.filter(predicate).length, monitored=count((item)=>item.monitoring);
    return {resources:rows.length,categories:categories.size,online:count((item)=>item.status==="online"),offline:count((item)=>item.status==="offline"),unknown:count((item)=>item.status==="unknown"),monitoring:monitored,monitoringRate:rows.length?Number((monitored/rows.length*100).toFixed(1)):0};
  });
  return bus;
}

module.exports = { createCapabilityBus, visibleResources, aggregate, SPACES, DIMENSIONS };
