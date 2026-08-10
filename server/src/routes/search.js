const express = require('express');
const db = require('../db');

const router = express.Router();
router.get('/', (req, res) => {
  const query = String(req.query.q || '').trim().slice(0, 120);
  if (!query) return res.json([]);
  const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
  const userId = req.auth?.user?.id || null;
  const sql = `SELECT items.id,items.scope,items.name,items.url,items.description,items.icon,items.status,items.latency_ms AS latencyMs,
    categories.id AS categoryId,categories.name AS categoryName,categories.icon AS categoryIcon
    FROM items LEFT JOIN categories ON categories.id=items.category_id
    WHERE (items.scope='public' OR (items.scope='personal' AND items.owner_id=?))
      AND (items.name LIKE ? ESCAPE '\\' OR items.url LIKE ? ESCAPE '\\' OR items.description LIKE ? ESCAPE '\\' OR categories.name LIKE ? ESCAPE '\\')
    ORDER BY CASE WHEN lower(items.name)=lower(?) THEN 0 WHEN lower(items.name) LIKE lower(?) THEN 1 ELSE 2 END,items.scope,items.name LIMIT 50`;
  res.json(db.prepare(sql).all(userId, pattern, pattern, pattern, pattern, query, `${query}%`));
});
module.exports = router;
