const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { createNavigationService, realm } = require('../services/navigationService');
const { presentItem } = require('../services/itemPresentation');
const { createAccessControlService } = require('../services/accessControlService');

const router = express.Router();
const navigation = createNavigationService(db);
const access = createAccessControlService(db);

function currentRealm(req, scope) {
  return realm(scope, scope === 'personal' ? req.auth?.user?.id : null);
}

function aggregate(table, current, extra = '') {
  return db.prepare(`
    SELECT COUNT(*) count,
      COALESCE(SUM(id),0) id_sum,
      COALESCE(SUM(version),0) version_sum,
      COALESCE(MAX(id),0) max_id,
      COALESCE(MAX(updated_at),'') updated_at
      ${extra}
    FROM ${table}
    WHERE scope=? AND owner_id IS ?
  `).get(current.scope, current.ownerId);
}

function visibleWorkspace(req, current) {
  const allItems = navigation.listItems(current);
  const items = access.filterVisibleItems(req.auth?.user, allItems);
  const allCategories = navigation.listCategories(current);
  let categories = allCategories;
  if (current.scope === 'public' && !access.isAdmin(req.auth?.user)) {
    const keep = new Set(), byId = new Map(allCategories.map((row) => [row.id, row]));
    for (const item of items) {
      let id = item.category_id;
      while (id) { keep.add(id); id = byId.get(id)?.parent_id ?? null; }
    }
    categories = allCategories.filter((row) => keep.has(row.id));
  }
  const favorites = req.auth?.user
    ? db.prepare(`
        SELECT COUNT(*) count, COALESCE(SUM(f.item_id),0) item_sum,
          COALESCE(MAX(f.created_at_ms),0) created_at_ms
        FROM user_favorites f
        JOIN items i ON i.id=f.item_id
        WHERE f.user_id=? AND i.scope=? AND i.owner_id IS ?
      `).get(req.auth.user.id, current.scope, current.ownerId)
    : { count: 0, item_sum: 0, created_at_ms: 0 };
  return { items, categories, favorites };
}

function workspaceVersion(req, current, visible) {
  const actor = req.auth?.user;
  const acl = access.revision();
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      actor: actor ? { id: actor.id, role: actor.role, status: actor.status } : null,
      acl,
      categories: visible.categories.map((row) => [row.id,row.version,row.updated_at]),
      items: visible.items.map((row) => [row.id,row.version,row.visibility,row.click_count,row.status,row.latency_ms,row.last_checked_at]),
      favorites: visible.favorites,
    }))
    .digest('hex')
    .slice(0, 20);
}

router.get('/', (req, res) => {
  const scope = req.query.scope || 'public';
  if (scope === 'personal' && !req.auth?.user)
    return res.status(401).json({ code: 'AUTH_REQUIRED', error: '请先登录' });
  try {
    const current = currentRealm(req, scope);
    const visible = visibleWorkspace(req, current);
    const version = workspaceVersion(req, current, visible);
    res.set('Cache-Control', 'private, no-cache');
    if (req.query.version === version)
      return res.json({ version, changed: false });

    const categories = visible.categories;
    const favorites = req.auth?.user
      ? new Map(
          db.prepare(`SELECT f.item_id,f.created_at_ms FROM user_favorites f
            JOIN items i ON i.id=f.item_id
            WHERE f.user_id=? AND i.scope=? AND i.owner_id IS ?`)
            .all(req.auth.user.id, current.scope, current.ownerId)
            .map((row) => [row.item_id, row.created_at_ms]),
        )
      : new Map();
    const items = visible.items.map((item) =>
      presentItem({
        ...item,
        is_favorite: favorites.has(item.id),
        favorite_at_ms: favorites.get(item.id) || null,
      }),
    );
    return res.json({ version, changed: true, categories, items });
  } catch (error) {
    return res.status(error.status || 500).json({
      code: error.code || 'WORKSPACE_LOAD_FAILED',
      error: error.status ? error.message : '空间数据加载失败',
    });
  }
});

module.exports = router;
