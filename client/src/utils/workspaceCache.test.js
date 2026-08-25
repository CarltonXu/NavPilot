import { beforeEach, describe, expect, it } from 'vitest';
import {
  readWorkspaceCache,
  WORKSPACE_CACHE_TTL_MS,
  writeWorkspaceCache,
} from './workspaceCache.js';

describe('workspace session cache', () => {
  beforeEach(() => sessionStorage.clear());

  it('restores a fresh snapshot during browser refresh', () => {
    writeWorkspaceCache(
      'anonymous:public',
      { categories: [{ id: 1 }], items: [{ id: 2 }], version: 'v1' },
      1_000,
    );
    const value = readWorkspaceCache('anonymous:public', 1_500);
    expect(value).toMatchObject({ version: 'v1', fresh: true });
    expect(value.categories).toEqual([{ id: 1 }]);
    expect(value.items).toEqual([{ id: 2 }]);
  });

  it('keeps stale data available while marking it for validation', () => {
    writeWorkspaceCache(
      'anonymous:public',
      { categories: [], items: [{ id: 2 }], version: 'v1' },
      1_000,
    );
    const value = readWorkspaceCache(
      'anonymous:public',
      1_000 + WORKSPACE_CACHE_TTL_MS,
    );
    expect(value.fresh).toBe(false);
    expect(value.items).toHaveLength(1);
  });

  it('ignores malformed cache entries', () => {
    sessionStorage.setItem('navpilot_workspace_v2:anonymous:public', '{bad json');
    expect(readWorkspaceCache('anonymous:public')).toBeNull();
  });
});
