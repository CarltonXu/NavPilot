import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/LocaleContext.jsx';
import { api } from '../api.js';
import GlobalSearch, { openGlobalSearch } from './GlobalSearch.jsx';

vi.mock('../api.js',()=>({api:{searchItems:vi.fn(),clickItem:vi.fn()}}));
vi.mock('../auth/AuthContext.jsx',()=>({useAuth:()=>({authenticated:true,setLoginOpen:vi.fn()})}));

beforeEach(()=>{
  localStorage.setItem('navpilot_locale','zh-CN');
  api.searchItems.mockResolvedValue([{
    id:1,scope:'public',name:'内部 GitLab',url:'https://gitlab.example.com',
    description:'公司内部代码托管与持续集成平台，供研发团队管理项目和流水线。',
    categoryPath:'公司内部 / 研发平台',icon:'icon:code',searchEventId:'search-1',
  }]);
  api.clickItem.mockResolvedValue({});
});
afterEach(()=>{cleanup();vi.clearAllMocks();});

describe('GlobalSearch results',()=>{
  it('shows the resource description with its full category path and URL',async()=>{
    render(<LocaleProvider><GlobalSearch/></LocaleProvider>);
    openGlobalSearch('GitLab');
    const input=await screen.findByPlaceholderText('搜索公共空间、个人空间、分类或网址…');
    fireEvent.change(input,{target:{value:'GitLab'}});
    await waitFor(()=>expect(api.searchItems).toHaveBeenCalledWith('GitLab'));
    expect(await screen.findByText('公司内部代码托管与持续集成平台，供研发团队管理项目和流水线。')).toBeTruthy();
    expect(screen.getByText('公司内部 / 研发平台')).toBeTruthy();
    expect(screen.getByText('https://gitlab.example.com')).toBeTruthy();
  });
});
