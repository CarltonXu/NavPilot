const { createNavigationService } = require("../navigationService");
const { selectItems } = require("./resourceSelector");

function hostname(value) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return "unknown";
  }
}

function increment(map, key) {
  const label = String(key || "unknown");
  map.set(label, (map.get(label) || 0) + 1);
}

function executeResourceQuery(db, current, intent, locale = "zh-CN") {
  const navigation = createNavigationService(db);
  const categories = navigation.listCategories(current);
  const items = navigation.listItems(current);
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const matches = selectItems(items, categories, intent.filters);
  const statusCounts = { online: 0, offline: 0, unknown: 0 };
  let monitoringEnabled = 0;
  for (const item of matches) {
    statusCounts[item.status || "unknown"] += 1;
    if (item.check_enabled) monitoringEnabled += 1;
  }
  const groups = new Map();
  if (intent.groupBy !== "none") {
    for (const item of matches) {
      const category = categoryById.get(item.category_id);
      if (intent.groupBy === "status") increment(groups, item.status || "unknown");
      else if (intent.groupBy === "category")
        increment(groups, category?.path_label || category?.name || (locale === "en" ? "Uncategorized" : "未分类"));
      else if (intent.groupBy === "domain") increment(groups, hostname(item.url));
      else if (intent.groupBy === "checkEnabled")
        increment(groups, item.check_enabled ? (locale === "en" ? "Enabled" : "已开启") : (locale === "en" ? "Disabled" : "未开启"));
      else if (intent.groupBy === "tag") {
        const tags = Array.isArray(item.tags) && item.tags.length
          ? item.tags
          : [locale === "en" ? "Untagged" : "无标签"];
        tags.forEach((tag) => increment(groups, tag));
      }
    }
  }
  const breakdown = [...groups.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 30)
    .map(([name, count]) => ({ name, count }));
  const rows = intent.view === "summary"
    ? []
    : matches.slice(0, intent.limit).map((item) => {
        const category = categoryById.get(item.category_id);
        return {
          id: item.id,
          name: item.name,
          url: item.url,
          status: item.status || "unknown",
          category: category?.path_label || category?.name || (locale === "en" ? "Uncategorized" : "未分类"),
          tags: Array.isArray(item.tags) ? item.tags.join(", ") : "",
          checkEnabled: Boolean(item.check_enabled),
          lastCheckedAt: item.last_checked_at || null,
        };
      });
  const columns = locale === "en"
    ? [
        { key: "name", label: "Resource" },
        { key: "url", label: "URL" },
        { key: "status", label: "Status" },
        { key: "category", label: "Category" },
        { key: "tags", label: "Tags" },
        { key: "checkEnabled", label: "Monitoring" },
      ]
    : [
        { key: "name", label: "资源名称" },
        { key: "url", label: "访问地址" },
        { key: "status", label: "状态" },
        { key: "category", label: "所属分类" },
        { key: "tags", label: "标签" },
        { key: "checkEnabled", label: "探测" },
      ];
  return {
    kind: "query",
    title: intent.title || (locale === "en" ? "Resource query" : "资源查询"),
    answer: locale === "en"
      ? `Found ${matches.length} matching resources out of ${items.length} in this workspace. All figures below are calculated from current workspace data.`
      : `当前空间共 ${items.length} 个资源，找到 ${matches.length} 个符合条件的资源。以下统计均基于当前空间实时数据。`,
    summary: {
      matched: matches.length,
      total: items.length,
      online: statusCounts.online,
      offline: statusCounts.offline,
      unknown: statusCounts.unknown,
      monitoringEnabled,
    },
    breakdown,
    columns,
    rows,
    truncated: rows.length < matches.length,
    query: intent,
  };
}

module.exports = { executeResourceQuery };
