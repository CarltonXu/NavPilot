const crypto = require("crypto");
const defaultDb = require("../db");

function problem(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}
function validUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
function categoryRows(db, userId) {
  return db
    .prepare(
      "SELECT id,name,icon,parent_id,sort_order FROM categories WHERE scope='personal' AND owner_id=? ORDER BY sort_order,id",
    )
    .all(userId);
}
function itemRows(db, userId) {
  return db
    .prepare(
      "SELECT id,name,url,icon,description,tags_json,category_id,sort_order,check_enabled,check_method,check_target FROM items WHERE scope='personal' AND owner_id=? ORDER BY sort_order,id",
    )
    .all(userId);
}
function tags(value) {
  try {
    const input = Array.isArray(value) ? value : JSON.parse(value || "[]");
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
  } catch {
    return [];
  }
}

function selectionSnapshot(
  db,
  userId,
  { all = false, itemIds = [], categoryIds = [] } = {},
) {
  const categories = categoryRows(db, userId),
    items = itemRows(db, userId),
    byId = new Map(categories.map((row) => [row.id, row]));
  const categorySet = new Set((categoryIds || []).map(Number)),
    itemSet = new Set((itemIds || []).map(Number));
  if (all) {
    categories.forEach((row) => categorySet.add(row.id));
    items.forEach((row) => itemSet.add(row.id));
  }
  if (!all && !categorySet.size && !itemSet.size)
    throw problem("SHARE_SELECTION_REQUIRED", "请选择要共享或导出的资源");
  for (const id of categorySet)
    if (!byId.has(id)) throw problem("CATEGORY_NOT_FOUND", "分类不存在", 404);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of categories)
      if (
        row.parent_id &&
        categorySet.has(row.parent_id) &&
        !categorySet.has(row.id)
      ) {
        categorySet.add(row.id);
        changed = true;
      }
  }
  for (const item of items)
    if (categorySet.has(item.category_id)) itemSet.add(item.id);
  for (const item of items.filter((row) => itemSet.has(row.id))) {
    let id = item.category_id;
    while (id) {
      if (!categorySet.has(id)) categorySet.add(id);
      id = byId.get(id)?.parent_id;
    }
  }
  const selectedItems = items.filter((row) => itemSet.has(row.id));
  const selectedCategories = categories.filter((row) =>
    categorySet.has(row.id),
  );
  return {
    format: "navpilot",
    version: 1,
    exportedAt: new Date().toISOString(),
    categories: selectedCategories.map((row) => ({
      key: `category:${row.id}`,
      name: row.name,
      icon: row.icon,
      parentKey:
        row.parent_id && categorySet.has(row.parent_id)
          ? `category:${row.parent_id}`
          : null,
      sortOrder: row.sort_order,
    })),
    items: selectedItems.map((row) => ({
      key: `item:${row.id}`,
      name: row.name,
      url: row.url,
      icon: row.icon,
      description: row.description,
      tags: tags(row.tags_json),
      categoryKey:
        row.category_id && categorySet.has(row.category_id)
          ? `category:${row.category_id}`
          : null,
      sortOrder: row.sort_order,
      checkEnabled: Boolean(row.check_enabled),
      checkMethod: row.check_method,
      checkTarget: row.check_target || "",
    })),
  };
}

function normalizeNavpilot(payload) {
  if (
    !payload ||
    !Array.isArray(payload.categories) ||
    !Array.isArray(payload.items)
  )
    throw problem("INVALID_IMPORT_FILE", "不是有效的 NavPilot JSON 文件");
  const categories = payload.categories
    .slice(0, 5000)
    .map((row, index) => ({
      key: String(row.key ?? `category:${index}`),
      name: String(row.name || "")
        .trim()
        .slice(0, 80),
      icon: String(row.icon || "icon:folder").slice(0, 80),
      parentKey: row.parentKey == null ? null : String(row.parentKey),
      sortOrder: Number(row.sortOrder) || index,
    }))
    .filter((row) => row.name);
  const keys = new Set(categories.map((row) => row.key));
  const items = payload.items
    .slice(0, 10000)
    .map((row, index) => ({
      key: String(row.key ?? `item:${index}`),
      name: String(row.name || "")
        .trim()
        .slice(0, 120),
      url: validUrl(row.url),
      icon: String(row.icon || "icon:link").slice(0, 80),
      description: String(row.description || "").slice(0, 500),
      tags: tags(row.tags),
      categoryKey:
        row.categoryKey != null && keys.has(String(row.categoryKey))
          ? String(row.categoryKey)
          : null,
      sortOrder: Number(row.sortOrder) || index,
      checkEnabled: Boolean(row.checkEnabled),
      checkMethod: ["http", "none"].includes(row.checkMethod)
        ? row.checkMethod
        : "none",
      checkTarget: String(row.checkTarget || "").slice(0, 500),
    }))
    .filter((row) => row.name && row.url);
  return { format: "navpilot", version: 1, categories, items };
}

function normalizeChrome(payload) {
  if (!payload?.roots || typeof payload.roots !== "object")
    throw problem(
      "INVALID_IMPORT_FILE",
      "不是有效的 Chrome Bookmarks JSON 文件",
    );
  const categories = [],
    items = [];
  let sequence = 0;
  function walk(node, parentKey, path) {
    if (!node || typeof node !== "object") return;
    if (node.url) {
      const url = validUrl(node.url);
      if (url)
        items.push({
          key: `chrome:item:${node.id || sequence++}:${path}`,
          name: String(node.title || node.name || url).slice(0, 120),
          url,
          icon: "icon:link",
          description: "",
          tags: [],
          categoryKey: parentKey,
          sortOrder: sequence++,
          checkEnabled: false,
          checkMethod: "none",
          checkTarget: "",
        });
      return;
    }
    const children = Array.isArray(node.children) ? node.children : [];
    let nextParent = parentKey;
    const title = String(node.title || node.name || "").trim();
    if (title && children.length) {
      nextParent = `chrome:category:${node.id || sequence++}:${path}`;
      categories.push({
        key: nextParent,
        name: title.slice(0, 80),
        icon: "icon:folder",
        parentKey,
        sortOrder: sequence++,
      });
    }
    children.forEach((child, index) =>
      walk(child, nextParent, `${path}/${index}`),
    );
  }
  Object.entries(payload.roots).forEach(([key, node]) => walk(node, null, key));
  return normalizeNavpilot({ categories, items });
}

function previewImport(db, userId, payload, format = "auto") {
  const normalized =
    format === "chrome" || (format === "auto" && payload?.roots)
      ? normalizeChrome(payload)
      : normalizeNavpilot(payload);
  const existing = new Set(
    itemRows(db, userId)
      .map((row) => validUrl(row.url)?.toLowerCase())
      .filter(Boolean),
  );
  const seen = new Set();
  normalized.items = normalized.items.map((item) => {
    const fingerprint = item.url.toLowerCase(),
      duplicate = existing.has(fingerprint) || seen.has(fingerprint);
    seen.add(fingerprint);
    return { ...item, duplicate };
  });
  return {
    ...normalized,
    summary: {
      categories: normalized.categories.length,
      items: normalized.items.length,
      duplicates: normalized.items.filter((item) => item.duplicate).length,
    },
  };
}

function importNormalized(
  db,
  userId,
  input,
  { selectedKeys, targetCategoryId = null, preserveStructure = true } = {},
) {
  const data = normalizeNavpilot(input),
    selected = new Set(
      Array.isArray(selectedKeys)
        ? selectedKeys.map(String)
        : data.items.map((item) => item.key),
    ),
    selectedItems = data.items.filter((item) => selected.has(item.key));
  if (!selectedItems.length)
    throw problem("IMPORT_SELECTION_REQUIRED", "请选择要导入的资源");
  const target =
    targetCategoryId == null
      ? null
      : db
          .prepare(
            "SELECT id FROM categories WHERE id=? AND scope='personal' AND owner_id=?",
          )
          .get(Number(targetCategoryId), userId);
  if (targetCategoryId != null && !target)
    throw problem("CATEGORY_NOT_FOUND", "目标分类不存在", 404);
  const categories = new Map(data.categories.map((row) => [row.key, row])),
    needed = new Set();
  for (const item of selectedItems) {
    let key = item.categoryKey;
    while (key && categories.has(key) && !needed.has(key)) {
      needed.add(key);
      key = categories.get(key).parentKey;
    }
  }
  const result = db.transaction(() => {
    const existing = new Set(
        itemRows(db, userId)
          .map((row) => validUrl(row.url)?.toLowerCase())
          .filter(Boolean),
      ),
      categoryMap = new Map();
    function depth(id) {
      let value = 0,
        current = id;
      while (current) {
        value += 1;
        current = db
          .prepare("SELECT parent_id FROM categories WHERE id=?")
          .get(current)?.parent_id;
      }
      return value;
    }
    function ensure(key) {
      if (!key || !preserveStructure) return target?.id || null;
      if (categoryMap.has(key)) return categoryMap.get(key);
      const row = categories.get(key);
      if (!row) return target?.id || null;
      const parent = ensure(row.parentKey);
      if (depth(parent) >= 3) {
        categoryMap.set(key, parent);
        return parent;
      }
      const found = db
        .prepare(
          "SELECT id FROM categories WHERE scope='personal' AND owner_id=? AND parent_id IS ? AND name=? COLLATE NOCASE",
        )
        .get(userId, parent, row.name);
      if (found) {
        categoryMap.set(key, found.id);
        return found.id;
      }
      const max = db
        .prepare(
          "SELECT COALESCE(MAX(sort_order),-1) max FROM categories WHERE scope='personal' AND owner_id=? AND parent_id IS ?",
        )
        .get(userId, parent).max;
      const id = Number(
        db
          .prepare(
            "INSERT INTO categories(name,icon,scope,owner_id,parent_id,sort_order,version,updated_at) VALUES(?,?,'personal',?,?,?,1,datetime('now'))",
          )
          .run(row.name, row.icon, userId, parent, max + 1).lastInsertRowid,
      );
      categoryMap.set(key, id);
      return id;
    }
    [...needed].forEach(ensure);
    let imported = 0,
      skipped = 0;
    for (const item of selectedItems) {
      const fingerprint = item.url.toLowerCase();
      if (existing.has(fingerprint)) {
        skipped += 1;
        continue;
      }
      const categoryId = ensure(item.categoryKey),
        max = db
          .prepare(
            "SELECT COALESCE(MAX(sort_order),-1) max FROM items WHERE scope='personal' AND owner_id=? AND category_id IS ?",
          )
          .get(userId, categoryId).max;
      db.prepare(
        "INSERT INTO items(name,url,icon,description,tags_json,category_id,sort_order,check_method,check_target,check_enabled,scope,owner_id,version,updated_at) VALUES(?,?,?,?,?,?,?, ?,NULL,0,'personal',?,1,datetime('now'))",
      ).run(
        item.name,
        item.url,
        item.icon,
        item.description,
        JSON.stringify(tags(item.tags)),
        categoryId,
        max + 1,
        item.checkMethod === "http" ? "http" : "none",
        userId,
      );
      existing.add(fingerprint);
      imported += 1;
    }
    return {
      imported,
      skipped,
      categoriesCreated: new Set(categoryMap.values()).size,
    };
  })();
  return result;
}

function createTransferService(db = defaultDb) {
  return {
    selectionSnapshot: (userId, selection) =>
      selectionSnapshot(db, userId, selection),
    previewImport: (userId, payload, format) =>
      previewImport(db, userId, payload, format),
    importNormalized: (userId, input, options) =>
      importNormalized(db, userId, input, options),
  };
}
module.exports = {
  createTransferService,
  selectionSnapshot,
  previewImport,
  importNormalized,
  normalizeChrome,
  normalizeNavpilot,
  problem,
};
