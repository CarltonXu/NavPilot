import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocaleProvider } from '../i18n/LocaleContext.jsx';
import { api } from '../api.js';
import { launchAiWorkspace } from './AiWorkspace.jsx';
import AiAssistantWidget from './AiAssistantWidget.jsx';

vi.mock('../api.js',()=>({api:{runAiQuickInstructionStream:vi.fn()}}));
vi.mock('../auth/AuthContext.jsx',()=>({useAuth:()=>({authenticated:true,isAdmin:false,user:{id:'member',role:'user'},setLoginOpen:vi.fn()})}));
vi.mock('./AiWorkspace.jsx',()=>({launchAiWorkspace:vi.fn()}));

beforeEach(()=>{
  localStorage.setItem('navpilot_locale','zh-CN');
  api.runAiQuickInstructionStream.mockResolvedValue({result:{kind:'query',conversationId:'quick-1',title:'资源汇总',answer:'共有 3 个资源。',summary:{matched:3,total:3,online:2,offline:1,unknown:0,monitoringEnabled:3},breakdown:[{name:'研发工具',count:3}],columns:[{key:'name',label:'名称'},{key:'url',label:'地址'},{key:'categoryName',label:'分类'},{key:'status',label:'状态'}],rows:[{id:1,name:'Jenkins',url:'https://very-long-domain.example/very/long/path/to/a/resource?with=a-long-query-value',categoryName:'研发工具',status:'online'}],truncated:false}});
});
afterEach(()=>{cleanup();vi.clearAllMocks();});

describe('AI Assistant quick commands',()=>{
  it('executes in the assistant instead of redirecting to AI Workspace',async()=>{
    const view=render(<LocaleProvider><AiAssistantWidget aiPersonalEnabled activeSpace="personal"/></LocaleProvider>);
    expect(screen.queryByRole('button',{name:'打开 AI 助手'})).toBeNull();
    fireEvent.keyDown(window,{key:'j',ctrlKey:true});
    expect(screen.getByText('新指令')).toBeTruthy();
    expect(screen.getByText('0 字')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('例如：帮我看看有多少失联链接，按分类整理成表格'),{target:{value:'汇总我的资源'}});
    expect(screen.getByText('6 字')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:/执行指令/}));
    await screen.findByText('资源汇总');
    expect(view.container.querySelector('.assistant-query-list')).toBeTruthy();
    expect(view.container.querySelector('.assistant-command-dialog table')).toBeNull();
    expect(screen.getByRole('link',{name:/very-long-domain/})).toBeTruthy();
    expect(api.runAiQuickInstructionStream.mock.calls[0].slice(0,4)).toEqual(['personal','汇总我的资源','zh-CN',null]);
    expect(launchAiWorkspace).not.toHaveBeenCalled();
  });

  it('opens AI Add requests in quick-command mode with their category context',async()=>{
    const view=render(<LocaleProvider><AiAssistantWidget aiPersonalEnabled activeSpace="public"/></LocaleProvider>);
    view.rerender(<LocaleProvider><AiAssistantWidget aiPersonalEnabled activeSpace="public" launchRequest={{id:1,scope:'public',text:'整理当前分类',context:{label:'公共空间 · 分类：研发工具',text:'当前空间：公共空间。当前分类：研发工具。'}}}/></LocaleProvider>);
    expect(await screen.findByRole('dialog',{name:'AI 助手'})).toBeTruthy();
    expect(screen.getByDisplayValue('整理当前分类')).toBeTruthy();
    expect(screen.getByText('公共空间 · 分类：研发工具')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:/执行指令/}));
    await waitFor(()=>expect(api.runAiQuickInstructionStream).toHaveBeenCalled());
    expect(api.runAiQuickInstructionStream.mock.calls[0][1]).toContain('当前分类：研发工具');
    expect(api.runAiQuickInstructionStream.mock.calls[0][1]).toContain('用户指令: 整理当前分类');
    expect(screen.queryByTitle('进入 AI 工作台')).toBeNull();
    await waitFor(()=>expect(launchAiWorkspace).not.toHaveBeenCalled());
  });
});
