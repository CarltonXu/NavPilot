const crypto = require("crypto");
const db = require("../../db");
const { createNavigationService, realm } = require("../navigationService");
const { auditWith } = require("../eventService");
const { loadPlan, serializePlan, planError, hash } = require("./planService");
const navigation = createNavigationService(db);
function executionByKey(actorId, key, requestHash) {
  const row = db
    .prepare(
      "SELECT * FROM command_executions WHERE actor_user_id=? AND idempotency_key=?",
    )
    .get(actorId, key);
  if (!row) return null;
  if (row.request_hash !== requestHash)
    throw planError("IDEMPOTENCY_CONFLICT", "幂等键已用于其他请求", 409);
  return row.result_json ? JSON.parse(row.result_json) : null;
}
function verifyExpected(row, current) {
  const expected = JSON.parse(row.expected_versions_json || "{}");
  for (const [key, version] of Object.entries(expected)) {
    const [type, id] = key.split(":");
    const value =
      type === "item"
        ? navigation.getItem(current, id)
        : navigation.getCategory(current, id);
    if (Number(value.version) !== Number(version))
      throw planError("PLAN_STALE", "数据已发生变化，请重新生成计划", 409);
  }
}
function resolveReferences(value, context) {
  const result = { ...(value || {}) };
  if (Object.prototype.hasOwnProperty.call(result, "category_ref")) {
    const id = context.categories.get(result.category_ref);
    if (!id)
      throw planError(
        "AI_PLAN_DEPENDENCY_INVALID",
        "计划引用的分类尚未创建",
        409,
      );
    result.category_id = id;
    delete result.category_ref;
  }
  if (Object.prototype.hasOwnProperty.call(result, "parent_ref")) {
    const id = context.categories.get(result.parent_ref);
    if (!id)
      throw planError(
        "AI_PLAN_DEPENDENCY_INVALID",
        "计划引用的父分类尚未创建",
        409,
      );
    result.parent_id = id;
    delete result.parent_ref;
  }
  return result;
}
function applyOperation(
  current,
  operation,
  context = { categories: new Map() },
) {
  let result;
  switch (operation.op) {
    case "item.create":
      return navigation.createItem(
        current,
        resolveReferences(operation.input, context),
      );
    case "item.bulkUpdate":
      return navigation.bulkUpdateItems(
        current,
        operation.ids,
        resolveReferences(operation.patch, context),
      );
    case "item.delete":
      return navigation.deleteItem(current, operation.id);
    case "category.create":
      result = navigation.createCategory(
        current,
        resolveReferences(operation.input, context),
      );
      if (operation.createRef)
        context.categories.set(operation.createRef, result.value.id);
      return result;
    case "category.update":
      return navigation.updateCategory(
        current,
        operation.id,
        resolveReferences(operation.patch, context),
      );
    case "category.delete":
      return navigation.deleteCategory(
        current,
        operation.id,
        operation.deleteOptions || {},
      );
    case "category.reorder":
      return navigation.reorderCategories(
        current,
        operation.parentId ?? null,
        operation.orderedIds,
      );
    default:
      throw planError("AI_INVALID_RESPONSE", `不支持的操作 ${operation.op}`);
  }
}
function inverseFor(operation, result, current) {
  if (operation.op === "item.create")
    return [{ op: "item.delete", id: result.value.id }];
  if (operation.op === "item.bulkUpdate") {
    const rows = Array.isArray(result) ? result : [result];
    return rows.map((entry) => ({
      op: "item.restore",
      id: entry.value.id,
      snapshot: entry.before,
    }));
  }
  if (operation.op === "item.delete")
    return [{ op: "item.restore_deleted", snapshot: result.before }];
  if (operation.op === "category.create")
    return [{ op: "category.delete", id: result.value.id }];
  if (operation.op === "category.update")
    return [
      { op: "category.restore", id: result.value.id, snapshot: result.before },
    ];
  if (operation.op === "category.delete")
    return [
      {
        op: "category.restore_deleted",
        categories: result.deletedCategories,
        items: result.affectedItems,
      },
    ];
  if (operation.op === "category.reorder")
    return [
      {
        op: "category.reorder",
        parentId: result.before.parentId ?? null,
        orderedIds: result.before.orderedIds,
      },
    ];
  return [];
}
function restoreItem(current, snapshot, { deleted = false } = {}) {
  if (deleted) {
    const exists = db
      .prepare("SELECT 1 FROM items WHERE id=?")
      .get(snapshot.id);
    if (exists) throw planError("UNDO_CONFLICT", "原条目 ID 已被占用", 409);
    db.prepare(
      `INSERT INTO items(id,name,url,icon,description,tags_json,category_id,sort_order,check_method,check_target,check_enabled,scope,owner_id,status,version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,datetime('now'))`,
    ).run(
      snapshot.id,
      snapshot.name,
      snapshot.url,
      snapshot.icon,
      snapshot.description,
      JSON.stringify(snapshot.tags || []),
      snapshot.categoryId,
      snapshot.sortOrder,
      snapshot.checkMethod,
      snapshot.checkTarget,
      snapshot.checkEnabled ? 1 : 0,
      current.scope,
      current.ownerId,
      snapshot.status || "unknown",
    );
    return;
  }
  navigation.updateItem(current, snapshot.id, {
    name: snapshot.name,
    url: snapshot.url,
    icon: snapshot.icon,
    description: snapshot.description,
    tags: snapshot.tags || [],
    category_id: snapshot.categoryId,
    check_method: snapshot.checkMethod,
    check_target: snapshot.checkTarget,
    check_enabled: snapshot.checkEnabled,
  });
}
function applyInverse(current, operation) {
  switch (operation.op) {
    case "item.delete":
      return navigation.deleteItem(current, operation.id);
    case "item.restore":
      return restoreItem(current, operation.snapshot);
    case "item.restore_deleted":
      return restoreItem(current, operation.snapshot, { deleted: true });
    case "category.delete":
      return navigation.deleteCategory(current, operation.id);
    case "category.restore":
      return navigation.updateCategory(current, operation.id, {
        name: operation.snapshot.name,
        icon: operation.snapshot.icon,
      });
    case "category.restore_deleted": {
      const categories =
        operation.categories || [operation.snapshot].filter(Boolean);
      for (const category of categories)
        if (db.prepare("SELECT 1 FROM categories WHERE id=?").get(category.id))
          throw planError("UNDO_CONFLICT", "原分类 ID 已被占用", 409);
      for (const item of operation.items || []) {
        const currentItem = db
          .prepare(
            "SELECT category_id FROM items WHERE id=? AND scope=? AND owner_id IS ?",
          )
          .get(item.id, current.scope, current.ownerId);
        if (!currentItem || currentItem.category_id !== null)
          throw planError("UNDO_CONFLICT", "受影响资源已发生变化", 409);
      }
      for (const category of categories.sort(
        (a, b) => (a.depth || 1) - (b.depth || 1) || a.sortOrder - b.sortOrder,
      ))
        db.prepare(
          `INSERT INTO categories(id,name,icon,scope,owner_id,parent_id,sort_order,version,updated_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'))`,
        ).run(
          category.id,
          category.name,
          category.icon,
          current.scope,
          current.ownerId,
          category.parentId ?? null,
          category.sortOrder,
          category.version || 1,
        );
      for (const item of operation.items || [])
        navigation.updateItem(current, item.id, {
          category_id: item.categoryId,
        });
      return;
    }
    case "category.reorder":
      return navigation.reorderCategories(
        current,
        operation.parentId ?? null,
        operation.orderedIds,
      );
    default:
      throw planError("UNDO_CONFLICT", "撤销操作不受支持", 409);
  }
}
function executePlan({
  id,
  actor,
  req,
  idempotencyKey,
  confirmed,
  confirmDestructive,
}) {
  if (!idempotencyKey || String(idempotencyKey).length < 8)
    throw planError("IDEMPOTENCY_KEY_REQUIRED", "缺少有效幂等键");
  if (!confirmed)
    throw planError(
      "AI_PLAN_CONFIRMATION_REQUIRED",
      "执行 AI 计划前必须由用户明确授权",
      400,
    );
  const row = loadPlan(id, actor),
    requestHash = hash({ id, action: "execute" }),
    replay = executionByKey(actor.id, idempotencyKey, requestHash);
  if (replay) return replay;
  if (row.status !== "draft")
    throw planError("AI_PLAN_ALREADY_EXECUTED", "AI 计划已执行", 409);
  const operations = JSON.parse(row.operations_json);
  if (
    operations.some((op) => op.destructive || op.op.endsWith(".delete")) &&
    !confirmDestructive
  )
    throw planError(
      "DESTRUCTIVE_CONFIRMATION_REQUIRED",
      "请确认破坏性操作",
      400,
    );
  const current = realm(row.realm_scope, row.realm_owner_id);
  const result = db.transaction(() => {
    verifyExpected(row, current);
    const results = [],
      inverse = [],
      context = { categories: new Map() };
    for (const operation of operations) {
      const applied = applyOperation(current, operation, context);
      results.push(applied);
      inverse.unshift(...inverseFor(operation, applied, current));
    }
    const value = {
      planId: id,
      status: "executed",
      affectedCount: results.reduce(
        (n, x) => n + (Array.isArray(x) ? x.length : 1),
        0,
      ),
    };
    db.prepare(
      "UPDATE ai_plans SET status='executed',inverse_operations_json=?,result_json=?,executed_at_ms=? WHERE id=?",
    ).run(JSON.stringify(inverse), JSON.stringify(value), Date.now(), id);
    db.prepare(
      `INSERT INTO command_executions(id,plan_id,actor_user_id,action,idempotency_key,request_hash,status,result_json,created_at_ms,completed_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      crypto.randomUUID(),
      id,
      actor.id,
      "execute",
      idempotencyKey,
      requestHash,
      "succeeded",
      JSON.stringify(value),
      Date.now(),
      Date.now(),
    );
    auditWith(db, req, "ai.plan.executed", {
      targetType: "ai_plan",
      targetId: id,
      metadata: {
        scope: current.scope,
        operationTypes: operations.map((x) => x.op),
        affectedCount: value.affectedCount,
      },
    });
    return value;
  })();
  return result;
}
function undoPlan({ id, actor, req, idempotencyKey }) {
  if (!idempotencyKey || String(idempotencyKey).length < 8)
    throw planError("IDEMPOTENCY_KEY_REQUIRED", "缺少有效幂等键");
  const row = loadPlan(id, actor),
    requestHash = hash({ id, action: "undo" }),
    replay = executionByKey(actor.id, idempotencyKey, requestHash);
  if (replay) return replay;
  if (row.status !== "executed" || !row.inverse_operations_json)
    throw planError("UNDO_CONFLICT", "该计划无法撤销", 409);
  const current = realm(row.realm_scope, row.realm_owner_id);
  return db.transaction(() => {
    const inverse = JSON.parse(row.inverse_operations_json);
    inverse.forEach((op) => applyInverse(current, op));
    const value = { planId: id, status: "undone" };
    db.prepare(
      "UPDATE ai_plans SET status='undone',undone_at_ms=?,result_json=? WHERE id=?",
    ).run(Date.now(), JSON.stringify(value), id);
    db.prepare(
      `INSERT INTO command_executions(id,plan_id,actor_user_id,action,idempotency_key,request_hash,status,result_json,created_at_ms,completed_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      crypto.randomUUID(),
      id,
      actor.id,
      "undo",
      idempotencyKey,
      requestHash,
      "succeeded",
      JSON.stringify(value),
      Date.now(),
      Date.now(),
    );
    auditWith(db, req, "ai.plan.undone", {
      targetType: "ai_plan",
      targetId: id,
      metadata: { scope: current.scope, operationCount: inverse.length },
    });
    return value;
  })();
}
module.exports = { executePlan, undoPlan, applyOperation, applyInverse };
