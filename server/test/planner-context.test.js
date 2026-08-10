const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlannerContext, compactPlannerContext } = require('../src/services/ai/plannerContext');

test('planner context uses aggregates and a bounded representative resource sample', () => {
  const categories = [
    { id:'engineering', name:'研发', path_label:'公司 / 研发' },
    { id:'office', name:'办公', path_label:'公司 / 办公' },
  ];
  const items = Array.from({ length:120 }, (_, index) => ({
    id:`item-${index}`,
    name:index === 99 ? 'GitHub Enterprise' : `Resource ${index}`,
    url:index === 99 ? 'https://github.example.com' : `https://service-${index % 10}.example.com`,
    description:`Description ${index} ${'x'.repeat(300)}`,
    category_id:index % 2 ? 'engineering' : 'office',
    tags:index % 3 ? ['内部'] : ['开发', '常用'],
    status:index % 4 ? 'online' : 'unknown',
    click_count:index,
  }));
  const value = buildPlannerContext({ categories, items, text:'把 GitHub Enterprise 移动到研发分类' });
  assert.equal(value.resourceCount, 120);
  assert.equal(value.contextMode, 'resource_detail');
  assert.equal(value.includedResourceCount, 60);
  assert.equal(value.truncated, true);
  assert.equal(value.resources[0].name, 'GitHub Enterprise');
  assert.equal(value.categories.length, 2);
  assert.ok(value.statistics.topDomains.length <= 20);
  assert.ok(JSON.stringify(value).length < 20000);

  const compact = compactPlannerContext(value);
  assert.equal(compact.resources.length, 12);
  assert.ok(JSON.stringify(compact).length < JSON.stringify(value).length);
});

test('broad taxonomy planning uses a smaller overview sample', () => {
  const items = Array.from({ length:100 }, (_, index) => ({
    name:`Resource ${index}`, url:`https://${index}.example.com`, description:'Internal service', click_count:index,
  }));
  const value = buildPlannerContext({ items, text:'请规划公司内部网站、外部资源和小工具的分类结构' });
  assert.equal(value.contextMode, 'space_overview');
  assert.equal(value.includedResourceCount, 24);
  assert.equal(value.truncated, true);
});
