import { describe, expect, it } from 'vitest';
import { ICON_NAMES } from '../components/Icon.jsx';
import {
  CATEGORY_ICON_GROUPS,
  CATEGORY_ICONS,
  ICON_LABELS,
} from './categoryIcons.js';

describe('category icon catalog', () => {
  it('provides unique, drawable and searchable icons for every category', () => {
    const names = CATEGORY_ICON_GROUPS.flatMap(group => group.names);

    expect(CATEGORY_ICON_GROUPS.map(group => group.key)).toContain('ai');
    expect(CATEGORY_ICON_GROUPS.every(group => group.names.length >= 13)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
    expect(CATEGORY_ICONS).toHaveLength(names.length);
    names.forEach(name => {
      expect(ICON_NAMES).toContain(name);
      expect(ICON_LABELS[name]?.zh).toBeTruthy();
      expect(ICON_LABELS[name]?.en).toBeTruthy();
      expect(ICON_LABELS[name]?.search).toContain(name.toLocaleLowerCase());
    });
  });
});
