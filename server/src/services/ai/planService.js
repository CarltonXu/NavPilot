const crypto = require("crypto");
const db = require("../../db");
const { createNavigationService } = require("../navigationService");
const { assertRealmPermission } = require("../authorizationService");
const { selectItems, selectorDisplay } = require("./resourceSelector");
const navigation = createNavigationService(db);
function planError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}
function normalize(value) {
  return String(value || "")
    .trim()
    .replace(/\s*(?:\/|>|＞)\s*/g, " / ")
    .toLocaleLowerCase();
}
function resolveOne(values, reference, type) {
  const ref = normalize(reference).replace(/^#+/, "");
  const hasTag = (value) =>
    type === "item" &&
    Array.isArray(value.tags) &&
    value.tags.some((tag) => normalize(tag) === ref);
  const containsTag = (value) =>
    type === "item" &&
    Array.isArray(value.tags) &&
    value.tags.some((tag) => normalize(tag).includes(ref));
  const exact = values.filter(
    (value) =>
      normalize(
        type === "category" ? value.path_label || value.name : value.name,
      ) === ref ||
      normalize(value.name) === ref ||
      (type === "item" && normalize(value.url) === ref) ||
      hasTag(value),
  );
  const contains = exact.length
    ? exact
    : values.filter(
        (value) =>
          normalize(
            type === "category" ? value.path_label || value.name : value.name,
          ).includes(ref) ||
          (type === "item" && normalize(value.url).includes(ref)) ||
          containsTag(value),
      );
  if (!contains.length)
    throw planError(
      type === "item" ? "ITEM_NOT_FOUND" : "CATEGORY_NOT_FOUND",
      `未找到「${reference}」`,
      404,
    );
  if (contains.length > 1)
    throw planError(
      "AI_ENTITY_AMBIGUOUS",
      `「${reference}」匹配到多个对象，请提供完整分类路径、标签或更具体的名称/链接`,
      409,
    );
  return contains[0];
}
function categoryTarget(categories, name) {
  if (name === undefined) return undefined;
  if (
    name === null ||
    normalize(name) === "未分类" ||
    normalize(name) === "uncategorized"
  )
    return null;
  return resolveOne(categories, name, "category");
}
function categoryPatch(categories, name, key = "category_id") {
  const target = categoryTarget(categories, name);
  if (target === undefined) return {};
  if (target === null) return { [key]: null };
  return target.createRef
    ? { [key.replace(/_id$/, "_ref")]: target.createRef }
    : { [key]: target.id };
}
function mapFields(fields, categories) {
  const patch = {};
  if (!fields) return patch;
  const mapping = {
    checkMethod: "check_method",
    checkTarget: "check_target",
    checkEnabled: "check_enabled",
  };
  for (const [key, value] of Object.entries(fields)) {
    if (key === "category")
      Object.assign(patch, categoryPatch(categories, value));
    else patch[mapping[key] || key] = value;
  }
  return patch;
}
function categoryPathParts(value) {
  return String(value || "")
    .split(/\s*(?:\/|>|＞)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}
function canonicalize(commands, current) {
  const items = navigation.listItems(current),
    categories = navigation.listCategories(current);
  const operations = [],
    expected = {};
  for (const command of commands) {
    if (command.op === "item.create") {
      operations.push({
        op: command.op,
        input: mapFields(command.fields, categories),
        display: command.fields,
      });
      continue;
    }
    if (command.op === "category.create") {
      const parts = categoryPathParts(command.category);
      if (!parts.length)
        throw planError("CATEGORY_NAME_REQUIRED", "分类名称不能为空");
      let parent = command.parentCategory
        ? categoryTarget(categories, command.parentCategory)
        : null;
      for (const [index, name] of parts.entries()) {
        const pathLabel = parent
          ? `${parent.path_label || parent.name} / ${name}`
          : name;
        const existing = categories.find(
          (category) => normalize(category.path_label || category.name) === normalize(pathLabel),
        );
        if (existing) {
          parent = existing;
          continue;
        }
        const depth = Number(parent?.depth || 0) + 1;
        if (depth > 3)
          throw planError("CATEGORY_DEPTH_EXCEEDED", "分类最多支持三级", 400);
        const createRef = `category-create-${operations.length + 1}`;
        const parentPatch = parent?.createRef
          ? { parent_ref: parent.createRef }
          : { parent_id: parent?.id ?? null };
        operations.push({
          op: command.op,
          createRef,
          input: {
            name,
            icon: index === parts.length - 1 ? command.fields?.icon : undefined,
            ...parentPatch,
          },
          display: {
            name,
            parentCategory: parent?.path_label || parent?.name || null,
            path: pathLabel,
          },
        });
        parent = {
          id: createRef,
          createRef,
          name,
          path_label: pathLabel,
          parent_id: parent?.id ?? null,
          depth,
          version: null,
        };
        categories.push(parent);
      }
      continue;
    }
    if (command.op.startsWith("item.")) {
      const refs = command.items?.length ? command.items : [command.item];
      const targets = command.selector
        ? selectItems(items, categories, command.selector)
        : refs.map((ref) => resolveOne(items, ref, "item"));
      if (!targets.length)
        throw planError(
          "ITEM_NOT_FOUND",
          "当前空间中没有符合条件的资源",
          404,
        );
      const uniqueTargets = [...new Map(targets.map((item) => [item.id, item])).values()];
      uniqueTargets.forEach((item) => (expected[`item:${item.id}`] = item.version));
      if (command.op === "item.update" || command.op === "item.bulkUpdate")
        operations.push({
          op: "item.bulkUpdate",
          ids: uniqueTargets.map((x) => x.id),
          patch: mapFields(command.fields, categories),
          preview: uniqueTargets.map(navigation.itemSnapshot),
          display: {
            ...(command.selector
              ? { selector: selectorDisplay(command.selector), matched: uniqueTargets.length }
              : { items: refs }),
            ...command.fields,
          },
        });
      else if (command.op === "item.move")
        operations.push({
          op: "item.bulkUpdate",
          ids: uniqueTargets.map((x) => x.id),
          patch: categoryPatch(
            categories,
            command.destinationCategory || command.category,
          ),
          preview: uniqueTargets.map(navigation.itemSnapshot),
          display: {
            ...(command.selector
              ? { selector: selectorDisplay(command.selector), matched: uniqueTargets.length }
              : { items: refs }),
            destinationCategory:
              command.destinationCategory || command.category,
          },
          label: "move",
        });
      else if (command.op === "item.delete")
        operations.push(
          ...uniqueTargets.map((item) => ({
            op: "item.delete",
            id: item.id,
            preview: navigation.itemSnapshot(item),
            destructive: true,
          })),
        );
      continue;
    }
    const target = resolveOne(categories, command.category, "category");
    if (target.createRef)
      throw planError(
        "AI_PLAN_DEPENDENCY_INVALID",
        "同一计划中新建的分类只能作为后续操作的目标分类",
        409,
      );
    expected[`category:${target.id}`] = target.version;
    if (command.op === "category.update")
      operations.push({
        op: command.op,
        id: target.id,
        patch: mapFields(command.fields, categories),
        preview: navigation.categorySnapshot(target),
        display: { category: command.category, ...command.fields },
      });
    else if (command.op === "category.delete") {
      const impact = navigation.getCategoryImpact(current, target.id);
      operations.push({
        op: command.op,
        id: target.id,
        deleteOptions: {
          expectedVersion: target.version,
          impactHash: impact.impactHash,
          confirmSubtree: true,
        },
        preview: navigation.categorySnapshot(target),
        display: {
          category: target.path_label || target.name,
          categoryCount: impact.categoryCount,
          resourceCount: impact.resourceCount,
        },
        destructive: true,
      });
    } else if (command.op === "category.move") {
      operations.push({
        op: "category.update",
        id: target.id,
        patch: command.destinationCategory
          ? categoryPatch(categories, command.destinationCategory, "parent_id")
          : { parent_id: null },
        preview: navigation.categorySnapshot(target),
        display: {
          category: command.category,
          destinationCategory: command.destinationCategory || null,
        },
      });
    } else if (command.op === "category.reorder") {
      const siblings = categories.filter(
        (category) =>
          !category.createRef &&
          (category.parent_id ?? null) === (target.parent_id ?? null),
      );
      const ordered = siblings
        .map((x) => x.id)
        .filter((id) => id !== target.id);
      let index = ordered.length;
      if (command.beforeCategory) {
        const before = resolveOne(siblings, command.beforeCategory, "category");
        index = ordered.indexOf(before.id);
      }
      if (command.afterCategory) {
        const after = resolveOne(siblings, command.afterCategory, "category");
        index = ordered.indexOf(after.id) + 1;
      }
      ordered.splice(Math.max(0, index), 0, target.id);
      operations.push({
        op: "category.reorder",
        parentId: target.parent_id ?? null,
        orderedIds: ordered,
        preview: { category: navigation.categorySnapshot(target) },
      });
    }
  }
  if (!operations.length)
    throw planError("CATEGORY_CONFLICT", "目标分类已经存在", 409);
  return {
    operations,
    expectedVersions: expected,
    destructive: operations.some(
      (x) => x.destructive || x.op.endsWith(".delete"),
    ),
  };
}
function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}
function createPlan({ actor, current, locale, text, commands, model, summary = "", suggestions = [] }) {
  assertRealmPermission(actor, current, "manage");
  const canonical = canonicalize(commands, current),
    id = crypto.randomUUID(),
    now = Date.now();
  db.prepare(
    `INSERT INTO ai_plans(id,actor_user_id,realm_scope,realm_owner_id,status,locale,input_hash,provider_model,summary,suggestions_json,operations_json,warnings_json,expected_versions_json,created_at_ms,expires_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    actor.id,
    current.scope,
    current.ownerId,
    "draft",
    locale,
    hash(text),
    model,
    String(summary || "").trim().slice(0, 300) || null,
    JSON.stringify((Array.isArray(suggestions) ? suggestions : []).map((value) => String(value).trim().slice(0, 240)).filter(Boolean).slice(0, 8)),
    JSON.stringify(canonical.operations),
    "[]",
    JSON.stringify(canonical.expectedVersions),
    now,
    now + 30 * 60 * 1000,
  );
  return serializePlan(db.prepare("SELECT * FROM ai_plans WHERE id=?").get(id));
}
function serializePlan(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    scope: row.realm_scope,
    summary: row.summary || "",
    suggestions: JSON.parse(row.suggestions_json || "[]"),
    operations: JSON.parse(row.operations_json),
    warnings: JSON.parse(row.warnings_json || "[]"),
    destructive: JSON.parse(row.operations_json).some(
      (x) => x.destructive || x.op.endsWith(".delete"),
    ),
    expiresAt: row.expires_at_ms,
    executedAt: row.executed_at_ms,
    undoneAt: row.undone_at_ms,
    result: row.result_json ? JSON.parse(row.result_json) : null,
  };
}
function loadPlan(id, actor) {
  const row = db.prepare("SELECT * FROM ai_plans WHERE id=?").get(id);
  if (!row || row.actor_user_id !== actor.id)
    throw planError("AI_PLAN_NOT_FOUND", "AI 计划不存在", 404);
  if (row.status === "draft" && row.expires_at_ms < Date.now()) {
    db.prepare("UPDATE ai_plans SET status='expired' WHERE id=?").run(id);
    throw planError("AI_PLAN_EXPIRED", "AI 计划已过期，请重新生成", 409);
  }
  return row;
}
module.exports = {
  canonicalize,
  createPlan,
  serializePlan,
  loadPlan,
  planError,
  hash,
};
