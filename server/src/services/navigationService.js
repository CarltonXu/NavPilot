const crypto = require("crypto");
const defaultDb = require("../db");

const selectItem = `SELECT items.id,items.name,items.url,items.icon,items.description,items.ai_summary,items.content_hash,items.content_analyzed_at_ms,items.tags_json,items.category_id,items.sort_order,items.click_count,items.status,items.latency_ms,items.last_checked_at,items.check_enabled,items.check_method,items.check_target,items.scope,items.owner_id,items.visibility,items.version,items.created_at,items.updated_at,categories.name AS category_name,categories.icon AS category_icon FROM items LEFT JOIN categories ON categories.id=items.category_id`;
const selectCategory =
  "SELECT id,name,icon,scope,owner_id,parent_id,sort_order,version,default_visibility,created_at,updated_at FROM categories";

function domainError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}
function realm(scope, ownerId = null) {
  if (!["public", "personal"].includes(scope))
    throw domainError("INVALID_SCOPE", "无效空间范围");
  if (scope === "personal" && !ownerId)
    throw domainError("AUTH_REQUIRED", "请先登录", 401);
  return { scope, ownerId: scope === "personal" ? ownerId : null };
}
function normalizeUrl(value) {
  let parsed;
  try {
    const raw = String(value || "").trim();
    parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw domainError("INVALID_ITEM_URL", "链接格式无效");
  }
  if (!["http:", "https:"].includes(parsed.protocol))
    throw domainError("INVALID_ITEM_URL", "只支持 HTTP(S) 链接");
  return parsed.toString();
}
function normalizeTags(value) {
  let input = value;
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      input = input.split(/[,，]/);
    }
  }
  if (!Array.isArray(input)) return [];
  const seen = new Set(),
    result = [];
  for (const raw of input) {
    const tag = String(raw || "")
        .trim()
        .replace(/^#+/, "")
        .slice(0, 30),
      key = tag.toLocaleLowerCase();
    if (tag && !seen.has(key)) {
      seen.add(key);
      result.push(tag);
    }
    if (result.length >= 20) break;
  }
  return result;
}
function decorateItem(value) {
  return value ? { ...value, tags: normalizeTags(value.tags_json) } : value;
}
function categorySnapshot(value) {
  if (!value) return null;
  return {
    id: value.id,
    name: value.name,
    icon: value.icon,
    scope: value.scope,
    visibility: value.visibility || "public",
    parentId: value.parent_id ?? null,
    sortOrder: value.sort_order,
    depth: value.depth,
    path: value.path,
    pathLabel: value.path_label,
    version: value.version,
  };
}
function itemSnapshot(value) {
  if (!value) return null;
  return {
    id: value.id,
    name: value.name,
    url: value.url,
    icon: value.icon,
    description: value.description,
    aiSummary: value.ai_summary || null,
    contentAnalyzedAt: value.content_analyzed_at_ms || null,
    tags: normalizeTags(value.tags ?? value.tags_json),
    categoryId: value.category_id,
    categoryName: value.category_name || null,
    sortOrder: value.sort_order,
    checkMethod: value.check_method,
    checkTarget: value.check_target,
    checkEnabled: Boolean(value.check_enabled),
    scope: value.scope,
    status: value.status,
    version: value.version,
  };
}
function changedFields(before, after) {
  const keys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);
  return [...keys].filter(
    (key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]),
  );
}
function getCategory(db, current, id) {
  if (id === null || id === undefined || id === "") return null;
  const value = db
    .prepare(`${selectCategory} WHERE id=? AND scope=? AND owner_id IS ?`)
    .get(Number(id), current.scope, current.ownerId);
  if (!value) throw domainError("CATEGORY_NOT_FOUND", "分类不存在", 404);
  return value;
}
function getItem(db, current, id) {
  const value = db
    .prepare(
      `${selectItem} WHERE items.id=? AND items.scope=? AND items.owner_id IS ?`,
    )
    .get(Number(id), current.scope, current.ownerId);
  if (!value) throw domainError("ITEM_NOT_FOUND", "条目不存在", 404);
  return decorateItem(value);
}
function assertVersion(value, expectedVersion) {
  if (
    expectedVersion !== undefined &&
    Number(expectedVersion) !== Number(value.version)
  )
    throw domainError("ENTITY_STALE", "数据已发生变化，请刷新后重试", 409);
}
const CATEGORY_ICON_NAMES = new Set([
  "folder","grid","home","link","globe","compass","map","mapPin","star","bookmark","tag","layers","dashboard","menu","pin",
  "building","briefcase","users","user","calendar","clock","mail","clipboard","listChecks","target","project","contact","printer",
  "message","phone","headset","send","inbox","bell","megaphone","microphone","video","mobile","chatDots","atSign","share",
  "code","terminal","gitBranch","bug","api","webhook","workflow","tools","puzzle","lab","braces","command","binary",
  "database","server","cloud","network","wifi","router","hardDrive","container","boxes","cpu","monitor","memory","rack","storage",
  "docs","file","fileText","book","newspaper","image","camera","music","archive","download","upload","package","pdf","spreadsheet","film",
  "chart","barChart","pieChart","activity","gauge","table","filter","calculator","insights","search","lineChart","scatterChart","sigma",
  "shield","shieldCheck","lock","key","eye","fingerprint","scan","firewall","certificate","alert","userCheck","shieldAlert","vault",
  "wallet","creditCard","shoppingCart","store","receipt","dollar","bank","coins","truck","gift","percent","factory","handshake",
  "palette","brush","pen","wand","lightbulb","rocket","shapes","scissors","presentation","sparkles","pencilRuler","swatch","frame",
  "assistant","brain","bot","neural","aiChip","prompt","inputTokens","outputTokens","imageAi","vision","voiceAi","translate","agents","model","automation",
]);
function normalizeCategoryIcon(value) {
  const icon=String(value||"icon:folder").trim();
  return icon.startsWith("icon:")&&CATEGORY_ICON_NAMES.has(icon.slice(5))?icon:"icon:folder";
}
function compactItemOrder(db, current, categoryId) {
  const rows = db
    .prepare(
      "SELECT id,sort_order FROM items WHERE scope=? AND owner_id IS ? AND category_id IS ? ORDER BY sort_order,id",
    )
    .all(current.scope, current.ownerId, categoryId);
  const update = db.prepare(
    "UPDATE items SET sort_order=?,version=version+1,updated_at=datetime('now') WHERE id=?",
  );
  rows.forEach((row, index) => {
    if (index !== row.sort_order) update.run(index, row.id);
  });
}

function createNavigationService(db = defaultDb) {
  function rawCategories(current) {
    return db
      .prepare(
        `${selectCategory} WHERE scope=? AND owner_id IS ? ORDER BY sort_order,id`,
      )
      .all(current.scope, current.ownerId);
  }
  function decorateCategories(current) {
    const rows = rawCategories(current);
    const byParent = new Map();
    rows.forEach((row) => {
      const key = row.parent_id ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(row);
    });
    for (const children of byParent.values())
      children.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    const result = [],
      seen = new Set();
    function visit(row, ancestors) {
      if (seen.has(row.id)) return;
      seen.add(row.id);
      const path = [...ancestors, { id: row.id, name: row.name }];
      const decorated = {
        ...row,
        depth: path.length,
        path,
        path_label: path.map((part) => part.name).join(" / "),
      };
      result.push(decorated);
      (byParent.get(row.id) || []).forEach((child) => visit(child, path));
    }
    (byParent.get(null) || []).forEach((root) => visit(root, []));
    rows.filter((row) => !seen.has(row.id)).forEach((row) => visit(row, []));
    return result;
  }
  function listItems(current) {
    return db
      .prepare(
        `${selectItem} WHERE items.scope=? AND items.owner_id IS ? ORDER BY items.category_id,items.sort_order,items.id`,
      )
      .all(current.scope, current.ownerId)
      .map(decorateItem);
  }
  function listCategories(current) {
    return decorateCategories(current);
  }
  function categoryWithPath(current, id) {
    return (
      listCategories(current).find((row) => row.id === Number(id)) ||
      getCategory(db, current, id)
    );
  }
  function categoryDepth(current, id) {
    return id == null ? 0 : categoryWithPath(current, id).depth;
  }
  function subtree(current, id) {
    const categories = listCategories(current),
      target = categories.find((row) => row.id === Number(id));
    if (!target) throw domainError("CATEGORY_NOT_FOUND", "分类不存在", 404);
    return categories.filter((row) =>
      row.path?.some((part) => part.id === target.id),
    );
  }
  function validateParent(current, categoryId, parentId) {
    if (parentId === null || parentId === undefined || parentId === "")
      return null;
    const parent = categoryWithPath(current, parentId);
    if (Number(categoryId) === parent.id)
      throw domainError("CATEGORY_CYCLE", "分类不能成为自己的子分类", 409);
    if (categoryId != null) {
      const branch = subtree(current, categoryId);
      if (branch.some((row) => row.id === parent.id))
        throw domainError("CATEGORY_CYCLE", "分类不能移动到自己的下级", 409);
      const rootDepth = branch.find(
        (row) => row.id === Number(categoryId),
      ).depth;
      const height = Math.max(
        ...branch.map((row) => row.depth - rootDepth + 1),
      );
      if (parent.depth + height > 3)
        throw domainError("CATEGORY_DEPTH_EXCEEDED", "分类最多支持三级", 409);
    } else if (parent.depth >= 3)
      throw domainError("CATEGORY_DEPTH_EXCEEDED", "分类最多支持三级", 409);
    return parent;
  }
  function compactCategoryOrder(current, parentId) {
    const rows = db
      .prepare(
        "SELECT id,sort_order FROM categories WHERE scope=? AND owner_id IS ? AND parent_id IS ? ORDER BY sort_order,id",
      )
      .all(current.scope, current.ownerId, parentId);
    const update = db.prepare(
      "UPDATE categories SET sort_order=?,version=version+1,updated_at=datetime('now') WHERE id=?",
    );
    rows.forEach((row, index) => {
      if (row.sort_order !== index) update.run(index, row.id);
    });
  }
  function siblingConflict(error) {
    if (String(error.code).includes("CONSTRAINT"))
      throw domainError(
        "CATEGORY_SIBLING_CONFLICT",
        "同一级下已存在同名分类",
        409,
      );
    throw error;
  }
  function createCategory(current, input) {
    const name = String(input.name || "").trim();
    if (!name || name.length > 80)
      throw domainError("CATEGORY_NAME_REQUIRED", "分类名称不能为空");
    const parent = validateParent(
      current,
      null,
      input.parent_id ?? input.parentId ?? null,
    );
    try {
      const max = db
        .prepare(
          "SELECT COALESCE(MAX(sort_order),-1) max FROM categories WHERE scope=? AND owner_id IS ? AND parent_id IS ?",
        )
        .get(current.scope, current.ownerId, parent?.id ?? null).max;
      const id = Number(
        db
          .prepare(
            "INSERT INTO categories(name,icon,scope,owner_id,parent_id,sort_order,version,updated_at) VALUES(?,?,?,?,?,?,1,datetime('now'))",
          )
          .run(
            name,
            normalizeCategoryIcon(input.icon),
            current.scope,
            current.ownerId,
            parent?.id ?? null,
            max + 1,
          ).lastInsertRowid,
      );
      const after = categoryWithPath(current, id);
      return {
        value: after,
        before: null,
        after: categorySnapshot(after),
        changedFields: Object.keys(categorySnapshot(after)),
      };
    } catch (error) {
      siblingConflict(error);
    }
  }
  function updateCategory(current, id, patch = {}) {
    const beforeValue = categoryWithPath(current, id);
    assertVersion(beforeValue, patch.expectedVersion);
    const name =
      patch.name === undefined ? beforeValue.name : String(patch.name).trim();
    if (!name) throw domainError("CATEGORY_NAME_REQUIRED", "分类名称不能为空");
    const icon =
      patch.icon === undefined
        ? beforeValue.icon
        : normalizeCategoryIcon(patch.icon);
    const hasParent =
      Object.prototype.hasOwnProperty.call(patch, "parent_id") ||
      Object.prototype.hasOwnProperty.call(patch, "parentId");
    const requestedParent = Object.prototype.hasOwnProperty.call(
      patch,
      "parent_id",
    )
      ? patch.parent_id
      : patch.parentId;
    const parent = hasParent
      ? validateParent(current, beforeValue.id, requestedParent)
      : beforeValue.parent_id
        ? getCategory(db, current, beforeValue.parent_id)
        : null;
    const nextParentId = parent?.id ?? null,
      moved = nextParentId !== (beforeValue.parent_id ?? null);
    try {
      db.prepare(
        "UPDATE categories SET name=?,icon=?,parent_id=?,version=version+1,updated_at=datetime('now') WHERE id=?",
      ).run(name, icon, nextParentId, beforeValue.id);
    } catch (error) {
      siblingConflict(error);
    }
    if (moved) {
      compactCategoryOrder(current, beforeValue.parent_id ?? null);
      const max = db
        .prepare(
          "SELECT COALESCE(MAX(sort_order),-1) max FROM categories WHERE scope=? AND owner_id IS ? AND parent_id IS ? AND id<>?",
        )
        .get(current.scope, current.ownerId, nextParentId, beforeValue.id).max;
      db.prepare(
        "UPDATE categories SET sort_order=?,version=version+1,updated_at=datetime('now') WHERE id=?",
      ).run(max + 1, beforeValue.id);
    }
    const value = categoryWithPath(current, id),
      before = categorySnapshot(beforeValue),
      after = categorySnapshot(value);
    return {
      value,
      before,
      after,
      changedFields: changedFields(before, after),
      moved,
    };
  }
  function categoryImpact(current, id) {
    const branch = subtree(current, id),
      ids = branch.map((row) => row.id),
      placeholders = ids.map(() => "?").join(",");
    const items = ids.length
      ? db
          .prepare(
            `${selectItem} WHERE items.scope=? AND items.owner_id IS ? AND items.category_id IN (${placeholders}) ORDER BY items.id`,
          )
          .all(current.scope, current.ownerId, ...ids)
      : [];
    const categories = branch.map(categorySnapshot),
      affectedItems = items.map(itemSnapshot);
    const fingerprint = {
      categories: categories.map((row) => [row.id, row.version]),
      items: affectedItems.map((row) => [row.id, row.version, row.categoryId]),
    };
    return {
      category: categories[0],
      categoryCount: categories.length,
      descendantCount: Math.max(0, categories.length - 1),
      resourceCount: affectedItems.length,
      categories,
      resources: affectedItems,
      impactHash: crypto
        .createHash("sha256")
        .update(JSON.stringify(fingerprint))
        .digest("hex"),
    };
  }
  function deleteCategory(
    current,
    id,
    { expectedVersion, impactHash, confirmSubtree = false } = {},
  ) {
    const beforeValue = categoryWithPath(current, id);
    assertVersion(beforeValue, expectedVersion);
    const impact = categoryImpact(current, id);
    if (impactHash && impactHash !== impact.impactHash)
      throw domainError(
        "CATEGORY_DELETE_IMPACT_STALE",
        "分类内容已变化，请重新确认",
        409,
      );
    if (impact.categoryCount > 1 && !confirmSubtree && impactHash)
      throw domainError(
        "DESTRUCTIVE_CONFIRMATION_REQUIRED",
        "请确认删除分类及其子分类",
      );
    const ids = impact.categories.map((row) => row.id),
      placeholders = ids.map(() => "?").join(",");
    if (ids.length)
      db.prepare(
        `UPDATE items SET category_id=NULL,version=version+1,updated_at=datetime('now') WHERE scope=? AND owner_id IS ? AND category_id IN (${placeholders})`,
      ).run(current.scope, current.ownerId, ...ids);
    db.prepare(
      "DELETE FROM categories WHERE id=? AND scope=? AND owner_id IS ?",
    ).run(beforeValue.id, current.scope, current.ownerId);
    compactCategoryOrder(current, beforeValue.parent_id ?? null);
    compactItemOrder(db, current, null);
    return {
      value: {
        ok: true,
        categoryCount: impact.categoryCount,
        resourceCount: impact.resourceCount,
      },
      before: impact.category,
      after: null,
      deletedCategories: impact.categories,
      affectedItems: impact.resources,
      impact,
      changedFields: ["deleted"],
    };
  }
  function createItem(current, input) {
    const name = String(input.name || "").trim();
    if (!name || !input.url)
      throw domainError("ITEM_NAME_URL_REQUIRED", "名称与链接为必填项");
    const category = getCategory(db, current, input.category_id);
    const categoryId = category?.id || null;
    const method =
      current.scope === "personal" && input.check_method === "tcp"
        ? "none"
        : ["http", "tcp", "none"].includes(input.check_method)
          ? input.check_method
          : input.check_enabled === false || Number(input.check_enabled) === 0
            ? "none"
            : "http";
    const checkEnabled = method !== "none";
    const max = db
      .prepare(
        "SELECT COALESCE(MAX(sort_order),-1) max FROM items WHERE scope=? AND owner_id IS ? AND category_id IS ?",
      )
      .get(current.scope, current.ownerId, categoryId).max;
    const id = Number(
      db
        .prepare(
          `INSERT INTO items(name,url,icon,description,tags_json,category_id,sort_order,check_method,check_target,check_enabled,scope,owner_id,version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,datetime('now'))`,
        )
        .run(
          name,
          normalizeUrl(input.url),
          String(input.icon || "icon:link").slice(0, 500),
          String(input.description || "").slice(0, 500),
          JSON.stringify(normalizeTags(input.tags)),
          categoryId,
          max + 1,
          method,
          input.check_target || null,
          checkEnabled ? 1 : 0,
          current.scope,
          current.ownerId,
        ).lastInsertRowid,
    );
    const value = getItem(db, current, id);
    return {
      value,
      before: null,
      after: itemSnapshot(value),
      changedFields: Object.keys(itemSnapshot(value)),
    };
  }
  function updateItem(current, id, patch = {}) {
    const beforeValue = getItem(db, current, id);
    assertVersion(beforeValue, patch.expectedVersion);
    const category =
      patch.category_id === undefined
        ? beforeValue.category_id
          ? getCategory(db, current, beforeValue.category_id)
          : null
        : getCategory(db, current, patch.category_id);
    const nextCategoryId = category?.id || null;
    const moved = nextCategoryId !== beforeValue.category_id;
    let method =
      current.scope === "personal" && patch.check_method === "tcp"
        ? "none"
        : (patch.check_method ?? beforeValue.check_method);
    // Keep compatibility with API/AI callers that still send only
    // check_enabled, but store one unambiguous state in the database.
    if (patch.check_method === undefined && patch.check_enabled !== undefined) {
      method = patch.check_enabled
        ? beforeValue.check_method === "none" ? "http" : beforeValue.check_method
        : "none";
    }
    const checkEnabled = method !== "none";
    db.prepare(
      `UPDATE items SET name=?,url=?,icon=?,description=?,tags_json=?,category_id=?,check_method=?,check_target=?,check_enabled=?,version=version+1,updated_at=datetime('now') WHERE id=?`,
    ).run(
      String(patch.name ?? beforeValue.name).trim(),
      normalizeUrl(patch.url ?? beforeValue.url),
      String(patch.icon ?? beforeValue.icon).slice(0, 500),
      String(patch.description ?? beforeValue.description).slice(0, 500),
      JSON.stringify(
        patch.tags === undefined ? beforeValue.tags : normalizeTags(patch.tags),
      ),
      nextCategoryId,
      method,
      patch.check_target === undefined
        ? beforeValue.check_target
        : patch.check_target,
      checkEnabled ? 1 : 0,
      beforeValue.id,
    );
    if (moved) {
      compactItemOrder(db, current, beforeValue.category_id);
      const max = db
        .prepare(
          "SELECT COALESCE(MAX(sort_order),-1) max FROM items WHERE scope=? AND owner_id IS ? AND category_id IS ? AND id<>?",
        )
        .get(
          current.scope,
          current.ownerId,
          nextCategoryId,
          beforeValue.id,
        ).max;
      db.prepare(
        "UPDATE items SET sort_order=?,version=version+1,updated_at=datetime('now') WHERE id=?",
      ).run(max + 1, beforeValue.id);
    }
    const value = getItem(db, current, id),
      before = itemSnapshot(beforeValue),
      after = itemSnapshot(value);
    return {
      value,
      before,
      after,
      changedFields: changedFields(before, after),
      moved,
    };
  }
  function deleteItem(current, id, { expectedVersion } = {}) {
    const value = getItem(db, current, id);
    assertVersion(value, expectedVersion);
    db.prepare("DELETE FROM items WHERE id=?").run(value.id);
    compactItemOrder(db, current, value.category_id);
    return {
      value: { ok: true },
      before: itemSnapshot(value),
      after: null,
      changedFields: ["deleted"],
    };
  }
  function reorderCategories(current, parentId, orderedIds) {
    if (orderedIds === undefined) {
      orderedIds = parentId;
      parentId = null;
    }
    const parent = parentId == null ? null : getCategory(db, current, parentId);
    const ids = orderedIds.map(Number);
    if (!Array.isArray(orderedIds) || new Set(ids).size !== ids.length)
      throw domainError("ORDERED_IDS_INVALID", "排序参数无效");
    const existing = db
      .prepare(
        "SELECT id FROM categories WHERE scope=? AND owner_id IS ? AND parent_id IS ? ORDER BY sort_order,id",
      )
      .all(current.scope, current.ownerId, parent?.id ?? null)
      .map((x) => x.id);
    if (
      existing.length !== ids.length ||
      existing.some((id) => !ids.includes(id))
    )
      throw domainError(
        "ORDERED_IDS_INVALID",
        "排序列表必须包含同一父分类下的全部分类",
      );
    const update = db.prepare(
      "UPDATE categories SET sort_order=?,version=version+1,updated_at=datetime('now') WHERE id=? AND scope=? AND owner_id IS ? AND parent_id IS ?",
    );
    ids.forEach((id, index) =>
      update.run(index, id, current.scope, current.ownerId, parent?.id ?? null),
    );
    return {
      value: { ok: true },
      before: { parentId: parent?.id ?? null, orderedIds: existing },
      after: { parentId: parent?.id ?? null, orderedIds: ids },
      changedFields: ["orderedIds"],
    };
  }
  function moveCategory(current, id, input = {}) {
    const beforeValue = categoryWithPath(current, id);
    assertVersion(beforeValue, input.expectedVersion);
    const parent = validateParent(
      current,
      beforeValue.id,
      input.parentId ?? input.parent_id ?? null,
    );
    const nextParentId = parent?.id ?? null;
    const duplicate = db.prepare(
      "SELECT id FROM categories WHERE scope=? AND owner_id IS ? AND parent_id IS ? AND name=? COLLATE NOCASE AND id<>?",
    ).get(current.scope,current.ownerId,nextParentId,beforeValue.name,beforeValue.id);
    if (duplicate)
      throw domainError("CATEGORY_SIBLING_CONFLICT", "同一级下已存在同名分类", 409);
    const destination = db.prepare(
      "SELECT id FROM categories WHERE scope=? AND owner_id IS ? AND parent_id IS ? AND id<>? ORDER BY sort_order,id",
    ).all(current.scope,current.ownerId,nextParentId,beforeValue.id).map(row=>row.id);
    const requestedIndex=Number(input.index),index=Number.isInteger(requestedIndex)
      ? Math.max(0,Math.min(requestedIndex,destination.length))
      : destination.length;
    destination.splice(index,0,beforeValue.id);
    db.prepare(
      "UPDATE categories SET parent_id=?,sort_order=?,version=version+1,updated_at=datetime('now') WHERE id=? AND scope=? AND owner_id IS ?",
    ).run(nextParentId,index,beforeValue.id,current.scope,current.ownerId);
    if ((beforeValue.parent_id??null)!==nextParentId)
      compactCategoryOrder(current,beforeValue.parent_id??null);
    const update=db.prepare(
      "UPDATE categories SET sort_order=?,version=version+1,updated_at=datetime('now') WHERE id=? AND scope=? AND owner_id IS ? AND parent_id IS ?",
    );
    destination.forEach((categoryId,sortOrder)=>update.run(sortOrder,categoryId,current.scope,current.ownerId,nextParentId));
    const value=categoryWithPath(current,beforeValue.id),before=categorySnapshot(beforeValue),after=categorySnapshot(value);
    return { value, before, after, changedFields:changedFields(before,after), moved:true };
  }
  function reorderItems(current, categoryId, orderedIds) {
    const idValue = categoryId === null ? null : Number(categoryId);
    if (idValue !== null) getCategory(db, current, idValue);
    const ids = orderedIds.map(Number);
    if (!Array.isArray(orderedIds) || new Set(ids).size !== ids.length)
      throw domainError("ORDERED_IDS_INVALID", "排序参数无效");
    const existing = db
      .prepare(
        "SELECT id FROM items WHERE scope=? AND owner_id IS ? AND category_id IS ? ORDER BY sort_order,id",
      )
      .all(current.scope, current.ownerId, idValue)
      .map((x) => x.id);
    if (
      existing.length !== ids.length ||
      existing.some((id) => !ids.includes(id))
    )
      throw domainError("ORDERED_IDS_INVALID", "排序列表与当前分组不匹配");
    const update = db.prepare(
      "UPDATE items SET sort_order=?,version=version+1,updated_at=datetime('now') WHERE id=? AND scope=? AND owner_id IS ? AND category_id IS ?",
    );
    ids.forEach((id, index) =>
      update.run(index, id, current.scope, current.ownerId, idValue),
    );
    return {
      value: { ok: true },
      before: { categoryId: idValue, orderedIds: existing },
      after: { categoryId: idValue, orderedIds: ids },
      changedFields: ["orderedIds"],
    };
  }
  function bulkUpdateItems(current, ids, patch) {
    if (!Array.isArray(ids) || !ids.length)
      throw domainError("ITEM_IDS_REQUIRED", "请选择至少一个条目");
    return ids.map((id) => updateItem(current, id, patch));
  }
  function bulkDeleteItems(current, ids) {
    if (!Array.isArray(ids) || !ids.length)
      throw domainError("ITEM_IDS_REQUIRED", "请选择至少一个条目");
    const normalized = [...new Set(ids.map(Number))];
    if (
      normalized.length > 500 ||
      normalized.some((id) => !Number.isInteger(id) || id <= 0)
    )
      throw domainError("ITEM_IDS_INVALID", "批量删除的资源列表无效");
    const values = normalized.map((id) => getItem(db, current, id));
    const before = values.map(itemSnapshot),
      categories = new Set(values.map((item) => item.category_id ?? null)),
      remove = db.prepare(
        "DELETE FROM items WHERE id=? AND scope=? AND owner_id IS ?",
      );
    values.forEach((item) => remove.run(item.id, current.scope, current.ownerId));
    categories.forEach((categoryId) =>
      compactItemOrder(db, current, categoryId),
    );
    return {
      value: {
        ok: true,
        deletedCount: values.length,
        deletedIds: values.map((item) => item.id),
      },
      before,
      after: null,
      changedFields: ["deleted"],
    };
  }
  return {
    db,
    realm,
    listItems,
    listCategories,
    getItem: (r, id) => getItem(db, r, id),
    getCategory: (r, id) => categoryWithPath(r, id),
    getCategoryImpact: categoryImpact,
    createItem,
    updateItem,
    deleteItem,
    bulkUpdateItems,
    bulkDeleteItems,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderItems,
    reorderCategories,
    moveCategory,
    itemSnapshot,
    categorySnapshot,
  };
}
module.exports = {
  createNavigationService,
  realm,
  domainError,
  itemSnapshot,
  categorySnapshot,
  changedFields,
  normalizeTags,
  normalizeCategoryIcon,
};
