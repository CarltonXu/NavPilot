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
module.exports = { validateEnvelope, ALLOWED, MAX_OPERATIONS };
