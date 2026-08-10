const MAX_RESOURCES = 60;

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function searchTokens(text) {
  return [...new Set(String(text || "")
    .toLocaleLowerCase()
    .split(/[\s,，。；;：:、!?！？()（）\[\]{}<>《》"'“”‘’]+/)
    .map((value) => value.trim())
    .filter((value) => value.length >= 2 && value.length <= 80))]
    .slice(0, 24);
}

function hostname(value) {
  try { return new URL(value).hostname.replace(/^www\./i, "").toLocaleLowerCase(); }
  catch { return ""; }
}

function increment(map, key, amount = 1) {
  if (key) map.set(key, (map.get(key) || 0) + amount);
}

function topCounts(map, limit = 20) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function buildPlannerContext({ categories = [], items = [], text = "", maxResources = MAX_RESOURCES } = {}) {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const categoryCounts = new Map(), tagCounts = new Map(), domainCounts = new Map(), statusCounts = new Map();
  const query = clean(text, 500).toLocaleLowerCase();
  const tokens = searchTokens(text);
  const ranked = items.map((item) => {
    const category = categoryById.get(item.category_id);
    const path = clean(category?.path_label || category?.name, 240);
    const tags = (Array.isArray(item.tags) ? item.tags : []).map((tag) => clean(tag, 30)).filter(Boolean);
    increment(categoryCounts, path || "未分类");
    increment(domainCounts, hostname(item.url));
    increment(statusCounts, clean(item.status || "unknown", 30));
    for (const tag of tags) increment(tagCounts, tag);

    const name = clean(item.name, 120), url = clean(item.url, 500), description = clean(item.description, 180);
    const searchable = `${name} ${url} ${description} ${tags.join(" ")} ${path}`.toLocaleLowerCase();
    let relevance = 0, directMatch = false;
    if (name.length >= 2 && query.includes(name.toLocaleLowerCase())) { relevance += 8; directMatch = true; }
    const itemHost = hostname(url);
    if (itemHost && query.includes(itemHost)) { relevance += 8; directMatch = true; }
    for (const token of tokens) if (searchable.includes(token)) relevance += token.length >= 5 ? 3 : 1;
    return {
      item: { name, url, description, tags: tags.slice(0, 6), category: path || null, status: clean(item.status, 30) || "unknown" },
      categoryKey: path || "未分类",
      directMatch,
      relevance,
      popularity: Number(item.click_count) || 0,
    };
  });

  ranked.sort((a, b) => b.relevance - a.relevance || b.popularity - a.popularity || a.item.name.localeCompare(b.item.name));
  const contextMode = ranked.some((entry) => entry.directMatch) ? "resource_detail" : "space_overview";
  const selectionLimit = contextMode === "resource_detail" ? maxResources : Math.min(maxResources, 24);
  const selected = [], selectedItems = new Set();
  const add = (entry) => {
    if (!entry || selectedItems.has(entry) || selected.length >= selectionLimit) return;
    selectedItems.add(entry); selected.push(entry);
  };
  ranked.filter((entry) => entry.relevance > 0).forEach(add);
  const representedCategories = new Set();
  for (const entry of ranked) {
    if (representedCategories.has(entry.categoryKey)) continue;
    representedCategories.add(entry.categoryKey); add(entry);
  }
  ranked.forEach(add);

  return {
    resourceCount: items.length,
    contextMode,
    includedResourceCount: selected.length,
    truncated: selected.length < items.length,
    categories: categories.map((category) => ({
      name: clean(category.name, 120),
      path: clean(category.path_label || category.name, 240),
      resourceCount: categoryCounts.get(clean(category.path_label || category.name, 240)) || 0,
    })),
    statistics: {
      uncategorizedCount: categoryCounts.get("未分类") || 0,
      statuses: topCounts(statusCounts, 10),
      topTags: topCounts(tagCounts),
      topDomains: topCounts(domainCounts),
    },
    resources: selected.map((entry) => entry.item),
  };
}

function compactPlannerContext(context = {}) {
  return {
    resourceCount: Number(context.resourceCount) || 0,
    contextMode: context.contextMode || "space_overview",
    includedResourceCount: Math.min(12, context.resources?.length || 0),
    truncated: true,
    categories: Array.isArray(context.categories) ? context.categories : [],
    statistics: context.statistics || {},
    resources: (Array.isArray(context.resources) ? context.resources : []).slice(0, 12).map((item) => ({
      name: clean(item.name, 100), url: clean(item.url, 300), tags: (item.tags || []).slice(0, 4), category: item.category || null,
    })),
  };
}

module.exports = { buildPlannerContext, compactPlannerContext, searchTokens };
