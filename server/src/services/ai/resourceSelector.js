function selectionError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function hostname(value) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLocaleLowerCase();
  } catch {
    return "";
  }
}

function resolveCategory(categories, reference) {
  const ref = normalize(reference);
  const exact = categories.filter(
    (category) =>
      normalize(category.path_label || category.name) === ref ||
      normalize(category.name) === ref,
  );
  const matches = exact.length
    ? exact
    : categories.filter((category) =>
        normalize(category.path_label || category.name).includes(ref),
      );
  if (!matches.length)
    throw selectionError(
      "CATEGORY_NOT_FOUND",
      `未找到分类「${reference}」`,
      404,
    );
  if (matches.length > 1)
    throw selectionError(
      "AI_ENTITY_AMBIGUOUS",
      `分类「${reference}」匹配到多个对象，请提供完整分类路径`,
      409,
    );
  return matches[0];
}

function selectItems(items, categories, selector = {}) {
  let values = [...items];
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  if (Array.isArray(selector.status) && selector.status.length) {
    const allowed = new Set(selector.status);
    values = values.filter((item) => allowed.has(item.status || "unknown"));
  }
  if (typeof selector.checkEnabled === "boolean")
    values = values.filter(
      (item) => Boolean(item.check_enabled) === selector.checkEnabled,
    );
  if (typeof selector.uncategorized === "boolean")
    values = values.filter(
      (item) => (item.category_id == null) === selector.uncategorized,
    );
  if (typeof selector.untagged === "boolean")
    values = values.filter(
      (item) =>
        (!Array.isArray(item.tags) || item.tags.length === 0) === selector.untagged,
    );
  if (selector.category) {
    const target = resolveCategory(categories, selector.category);
    const ids = new Set(
      selector.includeSubcategories === false
        ? [target.id]
        : categories
            .filter((category) =>
              (category.path || []).some((part) => part.id === target.id),
            )
            .map((category) => category.id),
    );
    values = values.filter((item) => ids.has(item.category_id));
  }
  if (Array.isArray(selector.tags) && selector.tags.length) {
    const wanted = selector.tags.map(normalize);
    values = values.filter((item) => {
      const actual = (Array.isArray(item.tags) ? item.tags : []).map(normalize);
      return selector.tagMode === "all"
        ? wanted.every((tag) => actual.includes(tag))
        : wanted.some((tag) => actual.includes(tag));
    });
  }
  if (selector.domain) {
    const wanted = normalize(selector.domain).replace(/^www\./, "");
    values = values.filter((item) => hostname(item.url).includes(wanted));
  }
  if (selector.text) {
    const wanted = normalize(selector.text);
    values = values.filter((item) => {
      const category = categoryById.get(item.category_id);
      return normalize(
        [
          item.name,
          item.url,
          item.description,
          ...(Array.isArray(item.tags) ? item.tags : []),
          category?.path_label || category?.name,
        ].join(" "),
      ).includes(wanted);
    });
  }
  return values;
}

function selectorDisplay(selector = {}) {
  const value = {};
  if (selector.all) value.range = "all";
  if (selector.status) value.status = selector.status;
  if (selector.checkEnabled !== undefined)
    value.checkEnabled = selector.checkEnabled;
  if (selector.uncategorized !== undefined)
    value.uncategorized = selector.uncategorized;
  if (selector.untagged !== undefined) value.untagged = selector.untagged;
  if (selector.category) value.category = selector.category;
  if (selector.tags) value.tags = selector.tags;
  if (selector.domain) value.domain = selector.domain;
  if (selector.text) value.text = selector.text;
  return value;
}

module.exports = {
  selectItems,
  selectorDisplay,
  resolveCategory,
  selectionError,
};
