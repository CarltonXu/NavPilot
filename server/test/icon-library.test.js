const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCategoryIcon } = require('../src/services/navigationService');

test('server accepts every vector icon exposed by the client picker', async () => {
  const { CATEGORY_ICON_GROUPS } = await import('../../client/src/constants/categoryIcons.js');
  const names = CATEGORY_ICON_GROUPS.flatMap((group) => group.names);
  assert.equal(CATEGORY_ICON_GROUPS.length, 11);
  assert.ok(names.length > 100);
  assert.equal(new Set(names).size, names.length);
  for (const name of names)
    assert.equal(normalizeCategoryIcon(`icon:${name}`), `icon:${name}`, name);
  assert.equal(normalizeCategoryIcon('icon:not-a-real-icon'), 'icon:folder');
});
