const crypto = require("crypto");
const defaultDb = require("../db");
const { createAccessControlService } = require("./accessControlService");

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
function normalizeRealm(value) {
  if (value && typeof value === "object") {
    const scope = value.scope === "public" ? "public" : "personal";
    return { scope, ownerId: scope === "public" ? null : value.ownerId };
  }
  return { scope:"personal", ownerId:value };
}
function categoryRows(db, realmValue) {
  const current = normalizeRealm(realmValue);
  return db
    .prepare(
      "SELECT id,name,icon,parent_id,sort_order FROM categories WHERE scope=? AND owner_id IS ? ORDER BY sort_order,id",
    )
    .all(current.scope, current.ownerId);
}
function itemRows(db, realmValue) {
  const current = normalizeRealm(realmValue);
  return db
    .prepare(
      "SELECT id,name,url,icon,description,tags_json,category_id,sort_order,check_enabled,check_method,check_target,visibility FROM items WHERE scope=? AND owner_id IS ? ORDER BY sort_order,id",
    )
    .all(current.scope, current.ownerId);
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
  realmValue,
  { all = false, itemIds = [], categoryIds = [] } = {},
) {
  const current = normalizeRealm(realmValue),
    categories = categoryRows(db, current),
    items = itemRows(db, current),
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
    version: 2,
    sourceScope: current.scope,
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
      ...(current.scope === 'public' ? { access: {
        visibility: row.visibility || 'public',
        grants: [
          ...db.prepare(`SELECT 'user' type,u.username identifier,g.expires_at_ms expiresAtMs FROM item_access_user_grants g JOIN users u ON u.id=g.user_id WHERE g.item_id=?`).all(row.id),
          ...db.prepare(`SELECT 'group' type,a.name identifier,g.expires_at_ms expiresAtMs FROM item_access_group_grants g JOIN access_groups a ON a.id=g.group_id WHERE g.item_id=?`).all(row.id),
        ],
      }} : {}),
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
  const payloadVersion = Number(payload.version) || 1;
  const items = payload.items
    .slice(0, 10000)
    .map((row, index) => ({
      key: String(row.key ?? `item:${index}`),
      name: String(row.name || "")
        .trim()
        .slice(0, 120),
      url: validUrl(row.url),
      icon: String(row.icon || "icon:link").slice(0, 500),
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
      access: payloadVersion >= 2 && row.access ? {
        visibility: ['public','authenticated','restricted'].includes(row.access.visibility) ? row.access.visibility : 'public',
        grants: (Array.isArray(row.access.grants) ? row.access.grants : []).slice(0,200).map(grant => ({
          type: grant?.type === 'group' ? 'group' : 'user',
          identifier: String(grant?.identifier || '').trim().slice(0,120),
          expiresAtMs: grant?.expiresAtMs == null ? null : Number(grant.expiresAtMs),
        })).filter(grant => grant.identifier),
      } : null,
    }))
    .filter((row) => row.name && row.url);
  return { format: "navpilot", version: payloadVersion >= 2 ? 2 : 1, categories, items };
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

function previewImport(db, realmValue, payload, format = "auto") {
  const current = normalizeRealm(realmValue);
  const normalized =
    format === "chrome" || (format === "auto" && payload?.roots)
      ? normalizeChrome(payload)
      : normalizeNavpilot(payload);
  const existing = new Set(
    itemRows(db, realmValue)
      .map((row) => validUrl(row.url)?.toLowerCase())
      .filter(Boolean),
  );
  const seen = new Set();
  normalized.items = normalized.items.map((item) => {
    const fingerprint = item.url.toLowerCase(),
      duplicate = existing.has(fingerprint) || seen.has(fingerprint);
    seen.add(fingerprint);
    if (current.scope !== 'public' || !item.access) return { ...item, duplicate };
    const grants = item.access.grants.map((grant) => {
      const principal = grant.type === 'group'
        ? db.prepare('SELECT id,name displayName FROM access_groups WHERE name=? COLLATE NOCASE').get(grant.identifier)
        : db.prepare("SELECT id,display_name displayName FROM users WHERE username=? COLLATE NOCASE AND status='active'").get(grant.identifier);
      return { ...grant, mapped: Boolean(principal), mappedId: principal?.id || null, displayName: principal?.displayName || grant.identifier };
    });
    return { ...item, duplicate, access:{ ...item.access, grants }, accessBlocked:item.access.visibility==='restricted'&&!grants.some(grant=>grant.mapped&&(grant.expiresAtMs==null||grant.expiresAtMs>Date.now())) };
  });
  return {
    ...normalized,
    summary: {
      categories: normalized.categories.length,
      items: normalized.items.length,
      duplicates: normalized.items.filter((item) => item.duplicate).length,
      unresolvedPrincipals: normalized.items.reduce((count,item)=>count+(item.access?.grants?.filter(grant=>grant.mapped===false).length||0),0),
      blockedRestrictedItems: normalized.items.filter((item)=>item.accessBlocked).length,
    },
  };
}

function importNormalized(
  db,
  realmValue,
  input,
  { selectedKeys, targetCategoryId = null, preserveStructure = true, returnIds = false } = {},
) {
  const current = normalizeRealm(realmValue),
    data = normalizeNavpilot(input),
    access = createAccessControlService(db),
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
            "SELECT id FROM categories WHERE id=? AND scope=? AND owner_id IS ?",
          )
          .get(Number(targetCategoryId), current.scope, current.ownerId);
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
        itemRows(db, current)
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
          "SELECT id FROM categories WHERE scope=? AND owner_id IS ? AND parent_id IS ? AND name=? COLLATE NOCASE",
        )
        .get(current.scope, current.ownerId, parent, row.name);
      if (found) {
        categoryMap.set(key, found.id);
        return found.id;
      }
      const max = db
        .prepare(
          "SELECT COALESCE(MAX(sort_order),-1) max FROM categories WHERE scope=? AND owner_id IS ? AND parent_id IS ?",
        )
        .get(current.scope, current.ownerId, parent).max;
      const id = Number(
        db
          .prepare(
            "INSERT INTO categories(name,icon,scope,owner_id,parent_id,sort_order,version,updated_at) VALUES(?,?,?,?,?,?,1,datetime('now'))",
          )
          .run(row.name, String(row.icon||'').startsWith('icon:')?row.icon:'icon:folder', current.scope, current.ownerId, parent, max + 1).lastInsertRowid,
      );
      categoryMap.set(key, id);
      return id;
    }
    [...needed].forEach(ensure);
    let imported = 0,
      skipped = 0;
    const importedIds = [];
    for (const item of selectedItems) {
      const fingerprint = item.url.toLowerCase();
      if (existing.has(fingerprint)) {
        skipped += 1;
        continue;
      }
      const categoryId = ensure(item.categoryKey),
        max = db
          .prepare(
            "SELECT COALESCE(MAX(sort_order),-1) max FROM items WHERE scope=? AND owner_id IS ? AND category_id IS ?",
          )
          .get(current.scope, current.ownerId, categoryId).max;
      const importedId = Number(db.prepare(
        "INSERT INTO items(name,url,icon,description,tags_json,category_id,sort_order,check_method,check_target,check_enabled,scope,owner_id,version,updated_at) VALUES(?,?,?,?,?,?,?, ?,NULL,0,?,?,1,datetime('now'))",
      ).run(
        item.name,
        item.url,
        item.icon,
        item.description,
        JSON.stringify(tags(item.tags)),
        categoryId,
        max + 1,
        item.checkMethod === "http" ? "http" : "none",
        current.scope,
        current.ownerId,
      ).lastInsertRowid);
      if (current.scope === 'public') {
        let itemAccess = data.version >= 2 && item.access ? item.access : access.inheritedCategoryAccess(categoryId);
        if (itemAccess.grants?.length) {
          itemAccess = { ...itemAccess, grants: itemAccess.grants.map(grant => {
            const principal = grant.type === 'group'
              ? db.prepare('SELECT id FROM access_groups WHERE name=? COLLATE NOCASE').get(grant.identifier)
              : db.prepare("SELECT id FROM users WHERE username=? COLLATE NOCASE AND status='active'").get(grant.identifier);
            return principal ? { type: grant.type, id: principal.id, expiresAtMs: grant.expiresAtMs } : null;
          }).filter(Boolean) };
        }
        if (itemAccess.visibility === 'restricted' && !itemAccess.grants?.some(grant => grant.expiresAtMs == null || grant.expiresAtMs > Date.now()))
          throw problem('RESTRICTED_PRINCIPAL_MAPPING_REQUIRED', `资源“${item.name}”的授权用户或组无法映射，已阻止导入`);
        access.replaceItemAccess(importedId, itemAccess, null, { incrementVersion: false });
      }
      importedIds.push(importedId);
      existing.add(fingerprint);
      imported += 1;
    }
    return {
      imported,
      skipped,
      categoriesCreated: new Set(categoryMap.values()).size,
      ...(returnIds ? { importedIds } : {}),
    };
  })();
  return result;
}

function createTransferService(db = defaultDb) {
  return {
    selectionSnapshot: (realmValue, selection) =>
      selectionSnapshot(db, realmValue, selection),
    previewImport: (realmValue, payload, format) =>
      previewImport(db, realmValue, payload, format),
    importNormalized: (realmValue, input, options) =>
      importNormalized(db, realmValue, input, options),
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
