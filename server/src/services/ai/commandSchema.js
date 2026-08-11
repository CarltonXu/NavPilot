const ALLOWED = new Set([
  "item.create",
  "item.update",
  "item.delete",
  "item.bulkUpdate",
  "item.move",
  "category.create",
  "category.update",
  "category.delete",
  "category.reorder",
  "category.move",
]);
const MAX_OPERATIONS = 50;
const UNIVERSAL_ITEM_REFERENCES = new Set([
  "all",
  "all items",
  "all links",
  "all resources",
  "everything",
  "全部",
  "全部资源",
  "全部链接",
  "所有",
  "所有资源",
  "所有链接",
  "全部条目",
  "所有条目",
]);
function schemaError(message) {
  return Object.assign(new Error(message), {
    code: "AI_INVALID_RESPONSE",
    status: 502,
  });
}
function text(value, max = 500) {
  if (value === undefined || value === null) return undefined;
  const result = String(value).trim();
  if (result.length > max) throw schemaError("AI 返回字段过长");
  return result;
}
function validateSelector(raw, { allowEmpty = false } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw schemaError("AI 资源选择条件无效");
  const value = {};
  if (raw.all !== undefined) value.all = raw.all === true;
  if (raw.status !== undefined) {
    const statuses = Array.isArray(raw.status) ? raw.status : [raw.status];
    value.status = [...new Set(statuses.map((item) => text(item, 20)))];
    if (
      !value.status.length ||
      value.status.some((item) => !["online", "offline", "unknown"].includes(item))
    )
      throw schemaError("AI 资源状态筛选无效");
  }
  if (raw.checkEnabled !== undefined) {
    if (typeof raw.checkEnabled !== "boolean")
      throw schemaError("AI 探测状态筛选无效");
    value.checkEnabled = raw.checkEnabled;
  }
  if (raw.uncategorized !== undefined) {
    if (typeof raw.uncategorized !== "boolean")
      throw schemaError("AI 未分类筛选无效");
    value.uncategorized = raw.uncategorized;
  }
  if (raw.untagged !== undefined) {
    if (typeof raw.untagged !== "boolean")
      throw schemaError("AI 无标签筛选无效");
    value.untagged = raw.untagged;
  }
  if (raw.category !== undefined) value.category = text(raw.category, 160);
  if (raw.includeSubcategories !== undefined)
    value.includeSubcategories = raw.includeSubcategories !== false;
  if (raw.tags !== undefined) {
    const tags = Array.isArray(raw.tags)
      ? raw.tags
      : String(raw.tags || "").split(/[,，]/);
    value.tags = [...new Set(tags.map((tag) => text(tag, 30)).filter(Boolean))].slice(0, 20);
    if (!value.tags.length) throw schemaError("AI 标签筛选无效");
  }
  if (raw.tagMode !== undefined) {
    value.tagMode = text(raw.tagMode, 10);
    if (!["any", "all"].includes(value.tagMode))
      throw schemaError("AI 标签匹配方式无效");
  }
  if (raw.text !== undefined) value.text = text(raw.text, 160);
  if (raw.domain !== undefined) value.domain = text(raw.domain, 160);
  if (!allowEmpty && !value.all && !Object.keys(value).some((key) => key !== "all"))
    throw schemaError("AI 资源选择条件不能为空");
  return value;
}
function universalReference(value) {
  return UNIVERSAL_ITEM_REFERENCES.has(
    String(value || "").trim().toLocaleLowerCase(),
  );
}
function validateCommand(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw schemaError("AI 操作格式无效");
  const op = text(raw.op, 40);
  if (!ALLOWED.has(op))
    throw schemaError(`不支持的 AI 操作: ${op || "unknown"}`);
  const value = { op };
  for (const key of [
    "item",
    "category",
    "parentCategory",
    "destinationCategory",
    "beforeCategory",
    "afterCategory",
  ])
    if (raw[key] !== undefined) value[key] = text(raw[key], 160);
  if (raw.items !== undefined) {
    if (!Array.isArray(raw.items) || raw.items.length > 100)
      throw schemaError("AI 条目选择无效");
    value.items = raw.items.map((item) => text(item, 160));
  }
  if (raw.selector !== undefined) value.selector = validateSelector(raw.selector);
  if (raw.fields !== undefined) {
    if (
      !raw.fields ||
      typeof raw.fields !== "object" ||
      Array.isArray(raw.fields)
    )
      throw schemaError("AI 修改字段无效");
    const allowed = [
      "name",
      "url",
      "icon",
      "description",
      "tags",
      "category",
      "checkMethod",
      "checkTarget",
      "checkEnabled",
    ];
    value.fields = {};
    for (const [key, item] of Object.entries(raw.fields)) {
      if (!allowed.includes(key)) throw schemaError(`不允许修改字段: ${key}`);
      if (key === "tags") {
        const input = Array.isArray(item)
          ? item
          : String(item || "").split(/[,，]/);
        value.fields.tags = [
          ...new Set(input.map((tag) => text(tag, 30)).filter(Boolean)),
        ].slice(0, 20);
      } else
        value.fields[key] =
          typeof item === "boolean"
            ? item
            : text(item, key === "description" ? 500 : 500);
    }
  }
  if (op === "item.create") {
    value.fields = value.fields || {};
    if (!value.fields.name || !value.fields.url)
      throw schemaError("新增条目缺少名称或链接");
  }
  if (op === "category.create" && !value.category)
    throw schemaError("新增分类缺少名称");
  if (
    op.startsWith("item.") &&
    op !== "item.create" &&
    !value.selector &&
    (universalReference(value.item) ||
      (value.items?.length === 1 && universalReference(value.items[0])))
  ) {
    value.selector = { all: true };
    delete value.item;
    delete value.items;
  }
  return value;
}
function validateEnvelope(raw) {
  if (
    !raw ||
    typeof raw !== "object" ||
    !Array.isArray(raw.operations) ||
    !raw.operations.length ||
    raw.operations.length > MAX_OPERATIONS
  )
    throw schemaError("AI 操作列表无效");
  return { operations: raw.operations.map(validateCommand) };
}
module.exports = {
  validateEnvelope,
  validateSelector,
  universalReference,
  ALLOWED,
  MAX_OPERATIONS,
};
