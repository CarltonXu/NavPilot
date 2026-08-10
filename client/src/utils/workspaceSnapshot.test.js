import { describe,expect,it } from 'vitest';
import { beginWorkspaceLoad,failWorkspaceLoad } from './workspaceSnapshot.js';

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
});
