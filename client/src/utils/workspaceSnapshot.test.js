import { describe,expect,it } from 'vitest';
import { beginWorkspaceLoad,canReuseWorkspaceSnapshot,failWorkspaceLoad } from './workspaceSnapshot.js';

describe('workspace background refresh',()=>{
  const ready={key:'user:1:public',status:'ready',categories:[{id:1}],items:[{id:2}]};

  it('keeps the ready snapshot visible while a refresh is running',()=>{
    expect(beginWorkspaceLoad(ready,ready.key)).toBe(ready);
  });

  it('keeps the last ready snapshot when a background refresh fails',()=>{
    expect(failWorkspaceLoad(ready,ready.key)).toBe(ready);
  });

  it('still exposes loading and error states before the first snapshot exists',()=>{
    const loading=beginWorkspaceLoad({key:null,status:'idle',categories:[],items:[]},ready.key);
    expect(loading).toEqual({key:ready.key,status:'loading',categories:[],items:[]});
    expect(failWorkspaceLoad(loading,ready.key).status).toBe('error');
  });

  it('does not let a fresh timestamp skip restoration after switching spaces',()=>{
    const now=10_000,ttl=120_000;
    expect(canReuseWorkspaceSnapshot(ready,ready.key,9_000,now,ttl)).toBe(true);
    expect(canReuseWorkspaceSnapshot({...ready,key:'user:1:personal'},ready.key,9_000,now,ttl)).toBe(false);
    expect(canReuseWorkspaceSnapshot({...ready,status:'loading'},ready.key,9_000,now,ttl)).toBe(false);
  });
});
