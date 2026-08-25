const defaultDb = require('../db');

const VISIBILITIES = Object.freeze(['public', 'authenticated', 'restricted']);

function problem(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function isAuthenticated(actor) {
  return Boolean(actor?.id) && actor.status !== 'disabled';
}

function isAdmin(actor) {
  return isAuthenticated(actor) && actor.role === 'admin';
}

function sqlVisibility(alias = 'items', actor, now = Date.now()) {
  if (isAdmin(actor)) return { sql: '1=1', params: [] };
  const userId = isAuthenticated(actor) ? actor.id : null;
  const clauses = [
    `(${alias}.scope='personal' AND ${alias}.owner_id=?)`,
    `(${alias}.scope='public' AND ${alias}.visibility='public')`,
  ];
  const params = [userId];
  if (userId) {
    clauses.push(`(${alias}.scope='public' AND ${alias}.visibility='authenticated')`);
    clauses.push(`(${alias}.scope='public' AND ${alias}.visibility='restricted' AND (
      EXISTS (SELECT 1 FROM item_access_user_grants iug
        WHERE iug.item_id=${alias}.id AND iug.user_id=? AND (iug.expires_at_ms IS NULL OR iug.expires_at_ms>?))
      OR EXISTS (SELECT 1 FROM item_access_group_grants igg
        JOIN access_group_members agm ON agm.group_id=igg.group_id
        WHERE igg.item_id=${alias}.id AND agm.user_id=? AND (igg.expires_at_ms IS NULL OR igg.expires_at_ms>?))
    ))`);
    params.push(userId, now, userId, now);
  }
  return { sql: `(${clauses.join(' OR ')})`, params };
}

function normalizeGrants(db, grants, { requireEffective = false, now = Date.now() } = {}) {
  if (!Array.isArray(grants)) grants = [];
  const result = [], seen = new Set();
  for (const raw of grants) {
    const type = raw?.type === 'group' ? 'group' : raw?.type === 'user' ? 'user' : null;
    const id = String(raw?.id || '').trim();
    if (!type || !id) throw problem('INVALID_ACCESS_GRANT', '授权主体无效');
    const key = `${type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const expiresAtMs = raw.expiresAtMs == null || raw.expiresAtMs === '' ? null : Number(raw.expiresAtMs);
    if (expiresAtMs !== null && (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= 0))
      throw problem('INVALID_GRANT_EXPIRY', '授权到期时间无效');
    const exists = type === 'group'
      ? db.prepare('SELECT 1 FROM access_groups WHERE id=?').get(id)
      : db.prepare("SELECT 1 FROM users WHERE id=? AND status='active'").get(id);
    if (!exists) throw problem(type === 'group' ? 'ACCESS_GROUP_NOT_FOUND' : 'USER_NOT_FOUND', type === 'group' ? '授权组不存在' : '授权用户不存在', 404);
    result.push({ type, id, expiresAtMs });
  }
  if (result.length > 200) throw problem('TOO_MANY_ACCESS_GRANTS', '单个资源最多配置 200 个授权主体');
  if (requireEffective && !result.some((grant) => grant.expiresAtMs == null || grant.expiresAtMs > now))
    throw problem('RESTRICTED_GRANT_REQUIRED', '指定范围至少需要一个当前有效的用户或授权组');
  return result;
}

function createAccessControlService(db = defaultDb) {
  function bumpRevision() {
    db.prepare('UPDATE access_control_state SET revision=revision+1,updated_at_ms=? WHERE id=1').run(Date.now());
  }

  function revision() {
    return db.prepare('SELECT revision,updated_at_ms AS updatedAtMs FROM access_control_state WHERE id=1').get() || { revision: 1, updatedAtMs: 0 };
  }

  function canViewItem(actor, item, now = Date.now()) {
    if (!item) return false;
    if (isAdmin(actor)) return true;
    if (item.scope === 'personal') return isAuthenticated(actor) && item.owner_id === actor.id;
    if (item.visibility === 'public' || !item.visibility) return true;
    if (item.visibility === 'authenticated') return isAuthenticated(actor);
    if (!isAuthenticated(actor)) return false;
    return Boolean(db.prepare(`SELECT 1 WHERE
      EXISTS (SELECT 1 FROM item_access_user_grants WHERE item_id=? AND user_id=? AND (expires_at_ms IS NULL OR expires_at_ms>?))
      OR EXISTS (SELECT 1 FROM item_access_group_grants igg JOIN access_group_members agm ON agm.group_id=igg.group_id
        WHERE igg.item_id=? AND agm.user_id=? AND (igg.expires_at_ms IS NULL OR igg.expires_at_ms>?))`)
      .get(item.id, actor.id, now, item.id, actor.id, now));
  }

  function getVisibleItem(actor, id) {
    const item = db.prepare('SELECT * FROM items WHERE id=?').get(Number(id));
    return canViewItem(actor, item) ? item : null;
  }

  function filterVisibleItems(actor, items) {
    if (isAdmin(actor)) return items;
    if (!items.length) return items;
    const predicate = sqlVisibility('items', actor);
    const ids = new Set(db.prepare(`SELECT items.id FROM items WHERE ${predicate.sql}`).all(...predicate.params).map((row) => row.id));
    return items.filter((item) => ids.has(item.id));
  }

  function visibleItemIds(actor, current, now = Date.now()) {
    const predicate = sqlVisibility('items', actor, now);
    return db.prepare(`SELECT items.id FROM items WHERE items.scope=? AND items.owner_id IS ? AND ${predicate.sql}`)
      .all(current.scope, current.ownerId, ...predicate.params).map((row) => row.id);
  }

  function itemAccess(itemId) {
    const item = db.prepare('SELECT id,scope,visibility,version FROM items WHERE id=?').get(Number(itemId));
    if (!item) throw problem('ITEM_NOT_FOUND', '条目不存在', 404);
    const grants = [
      ...db.prepare(`SELECT 'user' type,g.user_id id,g.expires_at_ms expiresAtMs,u.username,u.display_name displayName
        FROM item_access_user_grants g JOIN users u ON u.id=g.user_id WHERE g.item_id=? ORDER BY u.display_name`).all(item.id),
      ...db.prepare(`SELECT 'group' type,g.group_id id,g.expires_at_ms expiresAtMs,a.name displayName
        FROM item_access_group_grants g JOIN access_groups a ON a.id=g.group_id WHERE g.item_id=? ORDER BY a.name`).all(item.id),
    ];
    return { visibility: item.scope === 'personal' ? 'public' : item.visibility, grants, itemVersion: item.version };
  }

  function replaceItemAccess(itemId, access, actor, { incrementVersion = true } = {}) {
    const item = db.prepare('SELECT * FROM items WHERE id=?').get(Number(itemId));
    if (!item) throw problem('ITEM_NOT_FOUND', '条目不存在', 404);
    if (item.scope !== 'public') return itemAccess(item.id);
    const visibility = String(access?.visibility || 'public');
    if (!VISIBILITIES.includes(visibility)) throw problem('INVALID_VISIBILITY', '可见范围无效');
    const grants = normalizeGrants(db, access?.grants, { requireEffective: visibility === 'restricted' });
    const expectedVersion = access?.expectedVersion;
    if (expectedVersion != null && Number(expectedVersion) !== item.version)
      throw problem('VERSION_CONFLICT', '资源已被其他人修改，请刷新后重试', 409);
    db.prepare(`UPDATE items SET visibility=?,version=version+?,updated_at=datetime('now') WHERE id=?`)
      .run(visibility, incrementVersion ? 1 : 0, item.id);
    db.prepare('DELETE FROM item_access_user_grants WHERE item_id=?').run(item.id);
    db.prepare('DELETE FROM item_access_group_grants WHERE item_id=?').run(item.id);
    const now = Date.now();
    const userInsert = db.prepare('INSERT INTO item_access_user_grants(item_id,user_id,expires_at_ms,granted_by_user_id,created_at_ms) VALUES(?,?,?,?,?)');
    const groupInsert = db.prepare('INSERT INTO item_access_group_grants(item_id,group_id,expires_at_ms,granted_by_user_id,created_at_ms) VALUES(?,?,?,?,?)');
    for (const grant of grants) {
      (grant.type === 'user' ? userInsert : groupInsert).run(item.id, grant.id, grant.expiresAtMs, actor?.id || null, now);
    }
    bumpRevision();
    return itemAccess(item.id);
  }

  function inheritedCategoryAccess(categoryId) {
    let category = categoryId == null ? null : db.prepare("SELECT id,parent_id,default_visibility FROM categories WHERE id=? AND scope='public'").get(Number(categoryId));
    while (category) {
      if (category.default_visibility) {
        const grants = [
          ...db.prepare("SELECT 'user' type,user_id id,expires_at_ms expiresAtMs FROM category_access_user_defaults WHERE category_id=?").all(category.id),
          ...db.prepare("SELECT 'group' type,group_id id,expires_at_ms expiresAtMs FROM category_access_group_defaults WHERE category_id=?").all(category.id),
        ];
        return { visibility: category.default_visibility, grants, sourceCategoryId: category.id, inherited: category.id !== Number(categoryId) };
      }
      category = category.parent_id == null ? null : db.prepare('SELECT id,parent_id,default_visibility FROM categories WHERE id=?').get(category.parent_id);
    }
    return { visibility: 'public', grants: [], sourceCategoryId: null, inherited: Boolean(categoryId) };
  }

  function categoryAccess(categoryId) {
    const category = db.prepare('SELECT * FROM categories WHERE id=?').get(Number(categoryId));
    if (!category) throw problem('CATEGORY_NOT_FOUND', '分类不存在', 404);
    const effective = category.scope === 'public' ? inheritedCategoryAccess(category.id) : { visibility: 'public', grants: [], sourceCategoryId: null, inherited: false };
    return { ...effective, explicit: Boolean(category.default_visibility), categoryVersion: category.version };
  }

  function replaceCategoryAccess(categoryId, access, actor) {
    const category = db.prepare('SELECT * FROM categories WHERE id=?').get(Number(categoryId));
    if (!category || category.scope !== 'public') throw problem('CATEGORY_NOT_FOUND', '公共分类不存在', 404);
    if (access?.expectedVersion != null && Number(access.expectedVersion) !== category.version)
      throw problem('VERSION_CONFLICT', '分类已被其他人修改，请刷新后重试', 409);
    const inherit = Boolean(access?.inherit);
    const visibility = inherit ? null : String(access?.visibility || 'public');
    if (visibility !== null && !VISIBILITIES.includes(visibility)) throw problem('INVALID_VISIBILITY', '可见范围无效');
    const grants = inherit ? [] : normalizeGrants(db, access?.grants, { requireEffective: visibility === 'restricted' });
    db.prepare("UPDATE categories SET default_visibility=?,version=version+1,updated_at=datetime('now') WHERE id=?").run(visibility, category.id);
    db.prepare('DELETE FROM category_access_user_defaults WHERE category_id=?').run(category.id);
    db.prepare('DELETE FROM category_access_group_defaults WHERE category_id=?').run(category.id);
    const userInsert = db.prepare('INSERT INTO category_access_user_defaults(category_id,user_id,expires_at_ms) VALUES(?,?,?)');
    const groupInsert = db.prepare('INSERT INTO category_access_group_defaults(category_id,group_id,expires_at_ms) VALUES(?,?,?)');
    for (const grant of grants) (grant.type === 'user' ? userInsert : groupInsert).run(category.id, grant.id, grant.expiresAtMs);
    bumpRevision();
    return categoryAccess(category.id);
  }

  function descendantCategoryIds(categoryId) {
    return db.prepare(`WITH RECURSIVE tree(id) AS (
      SELECT id FROM categories WHERE id=? AND scope='public'
      UNION ALL SELECT c.id FROM categories c JOIN tree t ON c.parent_id=t.id
    ) SELECT id FROM tree`).all(Number(categoryId)).map((row) => row.id);
  }

  function applyCategoryAccess(categoryId, options, actor) {
    const ids = descendantCategoryIds(categoryId);
    if (!ids.length) throw problem('CATEGORY_NOT_FOUND', '公共分类不存在', 404);
    const targetIds = options?.includeDescendants ? ids : [Number(categoryId)];
    const placeholders = targetIds.map(() => '?').join(',');
    const itemIds = db.prepare(`SELECT id FROM items WHERE scope='public' AND category_id IN (${placeholders})`).all(...targetIds).map((row) => row.id);
    const template = categoryAccess(categoryId);
    if (options?.preview) return { categoryCount: targetIds.length, itemCount: itemIds.length, itemIds: itemIds.slice(0, 100) };
    for (const itemId of itemIds) replaceItemAccess(itemId, template, actor);
    if (options?.applyCategoryDefaults && options?.includeDescendants) {
      for (const id of targetIds.filter((id) => id !== Number(categoryId))) replaceCategoryAccess(id, { visibility: template.visibility, grants: template.grants }, actor);
    }
    return { categoryCount: targetIds.length, itemCount: itemIds.length };
  }

  return {
    VISIBILITIES, isAuthenticated, isAdmin, sqlVisibility, canViewItem, getVisibleItem,
    filterVisibleItems, visibleItemIds, itemAccess, replaceItemAccess, inheritedCategoryAccess,
    categoryAccess, replaceCategoryAccess, applyCategoryAccess, bumpRevision, revision,
  };
}

module.exports = { createAccessControlService, VISIBILITIES, isAuthenticated, isAdmin, sqlVisibility, problem };
