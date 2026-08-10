export function buildCategoryTree(categories = []) {
  const byId = new Map(categories.map((category) => [category.id, { ...category, children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    const parent = node.parent_id == null ? null : byId.get(node.parent_id);
    if (parent && parent.id !== node.id) parent.children.push(node); else roots.push(node);
  }
  const sort = (nodes) => { nodes.sort((a,b) => a.sort_order-b.sort_order || a.id-b.id); nodes.forEach((node) => sort(node.children)); };
  sort(roots);
  return { roots, byId };
}

export function flattenCategoryTree(categories = []) {
  const { roots } = buildCategoryTree(categories), result = [], seen = new Set();
  const visit = (node, path = []) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    const nextPath = [...path, node];
    result.push({ ...node, depth:nextPath.length, path:nextPath.map((entry) => ({ id:entry.id, name:entry.name })), path_label:nextPath.map((entry) => entry.name).join(' / ') });
    node.children.forEach((child) => visit(child,nextPath));
  };
  roots.forEach((root) => visit(root));
  categories.filter((category) => !seen.has(category.id)).forEach((category) => visit({ ...category, children:[] }));
  return result;
}

export function descendantIds(categories, categoryId) {
  const { byId } = buildCategoryTree(categories), ids = new Set();
  const visit = (node) => { if (!node || ids.has(node.id)) return; ids.add(node.id); node.children.forEach(visit); };
  visit(byId.get(Number(categoryId)));
  return ids;
}

export function categoryCounts(categories, items) {
  const direct = {};
  items.forEach((item) => { const key=item.category_id??'uncategorized'; direct[key]=(direct[key]||0)+1; });
  const aggregate = { ...direct }, { roots } = buildCategoryTree(categories);
  const visit = (node) => { const total=(direct[node.id]||0)+node.children.reduce((sum,child)=>sum+visit(child),0);aggregate[node.id]=total;return total; };
  roots.forEach(visit);
  return { direct, aggregate };
}

export function filterByCategory(items, categories, active) {
  if (active === 'all') return items;
  if (active === 'uncategorized') return items.filter((item) => !item.category_id);
  const ids=descendantIds(categories,active);
  return items.filter((item) => ids.has(item.category_id));
}
