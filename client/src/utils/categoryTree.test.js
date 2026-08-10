import { describe, expect, it } from 'vitest';
import { buildCategoryTree, categoryCounts, categorySelectionStates, descendantIds, filterByCategory, flattenCategoryTree } from './categoryTree.js';

const categories=[
  {id:3,name:'监控',parent_id:2,sort_order:0},
  {id:1,name:'研发',parent_id:null,sort_order:0},
  {id:2,name:'后端',parent_id:1,sort_order:0},
  {id:4,name:'办公',parent_id:null,sort_order:1},
];
const items=[{id:1,category_id:1},{id:2,category_id:2},{id:3,category_id:3},{id:4,category_id:4},{id:5,category_id:null}];

describe('category tree utilities',()=>{
  it('builds a stable three-level tree and full paths',()=>{
    const { roots }=buildCategoryTree(categories);
    expect(roots.map(node=>node.id)).toEqual([1,4]);
    expect(roots[0].children[0].children[0].id).toBe(3);
    expect(flattenCategoryTree(categories).find(node=>node.id===3).path_label).toBe('研发 / 后端 / 监控');
  });
  it('aggregates descendant resources for parent categories',()=>{
    const counts=categoryCounts(categories,items);
    expect(counts.aggregate[1]).toBe(3);
    expect(counts.aggregate[2]).toBe(2);
    expect(counts.aggregate[3]).toBe(1);
    expect([...descendantIds(categories,1)]).toEqual([1,2,3]);
    expect(filterByCategory(items,categories,1).map(item=>item.id)).toEqual([1,2,3]);
  });
  it('keeps uncategorized resources separate',()=>{
    expect(filterByCategory(items,categories,'uncategorized').map(item=>item.id)).toEqual([5]);
  });
  it('reports full and partial selection for category subtrees',()=>{
    const states=categorySelectionStates(categories,items,new Set([1,2,5]));
    expect(states.all).toBe('mixed');
    expect(states[1]).toBe('mixed');
    expect(states[2]).toBe('mixed');
    expect(states[3]).toBe('none');
    expect(states.uncategorized).toBe('all');
    expect(categorySelectionStates(categories,items,[1,2,3])[1]).toBe('all');
  });
});
