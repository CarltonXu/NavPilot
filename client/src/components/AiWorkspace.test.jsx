import React from'react';
import{afterEach,beforeEach,describe,expect,it,vi}from'vitest';
import{act,cleanup,fireEvent,render,screen,waitFor}from'@testing-library/react';
import{LocaleProvider}from'../i18n/LocaleContext.jsx';
import{api}from'../api.js';
import AiWorkspace from'./AiWorkspace.jsx';

vi.mock('../api.js',()=>({api:{listAiConversations:vi.fn(),getAiConversation:vi.fn(),getAiPlan:vi.fn(),getAiReport:vi.fn(),getAiRun:vi.fn(),discussAiStream:vi.fn(),runAiInstruction:vi.fn(),runAiInstructionStream:vi.fn()}}));
vi.mock('../auth/AuthContext.jsx',()=>({useAuth:()=>({authenticated:true,loading:false,isAdmin:true,user:{id:'admin',role:'admin',displayName:'Admin'},setLoginOpen:vi.fn()})}));
vi.mock('./ThemeSwitcher.jsx',()=>({default:()=>null}));
vi.mock('./LocaleSwitcher.jsx',()=>({default:()=>null}));
vi.mock('./AuthDialogs.jsx',()=>({AccountMenu:()=>null}));
vi.mock('./AiCommandPanel.jsx',()=>({default:({initialText,initialConversationId,readOnly})=><div data-testid="execution-plan" data-read-only={String(Boolean(readOnly))}>{initialConversationId}:{initialText}</div>}));

beforeEach(()=>{localStorage.setItem('navpilot_locale','zh-CN');sessionStorage.clear();api.listAiConversations.mockResolvedValue([]);api.runAiInstructionStream.mockResolvedValue({result:{kind:'query',conversationId:'instruction-1',title:'失联资源汇总',answer:'当前空间共 10 个资源，找到 2 个符合条件的资源。',summary:{matched:2,total:10,online:0,offline:2,unknown:0,monitoringEnabled:2},breakdown:[{name:'研发',count:2}],columns:[{key:'name',label:'资源名称'}],rows:[{id:1,name:'Jenkins'}],truncated:false}});api.discussAiStream.mockImplementation(async(_scope,_text,_locale,_conversationId,handlers)=>{handlers.onMeta({conversationId:'conversation-1'});handlers.onDelta('建议先按使用场景');handlers.onDelta('分类。');return{conversationId:'conversation-1',model:'test-model'};});});
afterEach(()=>{cleanup();vi.clearAllMocks();});

describe('AI Workspace',()=>{
  it('renders streamed deltas before the upstream request completes',async()=>{
    let release;
    api.discussAiStream.mockImplementationOnce(async(_scope,_text,_locale,_conversationId,handlers)=>{
      handlers.onMeta({conversationId:'conversation-stream'});
      handlers.onDelta('第一段内容');
      await new Promise(resolve=>{release=resolve;});
      handlers.onDelta('，第二段内容');
      return{conversationId:'conversation-stream',model:'test-model'};
    });
    render(<LocaleProvider><AiWorkspace theme="dark" onThemeChange={()=>{}} branding={{siteName:'NavPilot'}} aiPersonalEnabled/></LocaleProvider>);
    fireEvent.change(screen.getByPlaceholderText('描述你想分析、整理或创建的内容。讨论阶段不会修改资源。'),{target:{value:'测试流式输出'}});
    const submit=screen.getByRole('button',{name:/发送讨论/});
    expect(submit.classList.contains('ai-discussion-submit')).toBe(true);
    fireEvent.click(submit);
    await screen.findByText('第一段内容');
    expect(screen.getByRole('button',{name:/停止生成/}).disabled).toBe(false);
    await act(async()=>release());
    await screen.findByText('第一段内容，第二段内容');
  });

  it('keeps advisory discussion separate until the user converts it into a plan',async()=>{
    render(<LocaleProvider><AiWorkspace theme="dark" onThemeChange={()=>{}} branding={{siteName:'NavPilot'}} aiPersonalEnabled/></LocaleProvider>);
    expect(screen.getByText('AI 工作台')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('描述你想分析、整理或创建的内容。讨论阶段不会修改资源。'),{target:{value:'讨论公司导航分类'}});
    fireEvent.click(screen.getByRole('button',{name:/发送讨论/}));
    await screen.findByText('建议先按使用场景分类。');
    expect(api.discussAiStream.mock.calls[0].slice(0,4)).toEqual(['personal','讨论公司导航分类','zh-CN',null]);
    expect(screen.queryByTestId('execution-plan')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'转成执行方案'}));
    await waitFor(()=>expect(screen.getByTestId('execution-plan').textContent).toContain('conversation-1'));
  });

  it('stops a streaming discussion without leaving the message in a generating state',async()=>{
    api.discussAiStream.mockImplementationOnce(async(_scope,_text,_locale,_conversationId,handlers)=>{
      handlers.onMeta({conversationId:'conversation-cancel'});handlers.onDelta('已生成部分内容');
      return new Promise((_resolve,reject)=>handlers.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}));
    });
    render(<LocaleProvider><AiWorkspace theme="dark" onThemeChange={()=>{}} branding={{siteName:'NavPilot'}} aiPersonalEnabled/></LocaleProvider>);
    fireEvent.change(screen.getByPlaceholderText('描述你想分析、整理或创建的内容。讨论阶段不会修改资源。'),{target:{value:'测试停止生成'}});
    fireEvent.click(screen.getByRole('button',{name:/发送讨论/}));
    await screen.findByText('已生成部分内容');
    fireEvent.click(screen.getByRole('button',{name:/停止生成/}));
    await screen.findAllByText('生成已停止');
    expect(document.querySelector('.ai-stream-caret')).toBeNull();
  });

  it('runs read-only natural-language commands and renders real query tables',async()=>{
    render(<LocaleProvider><AiWorkspace theme="dark" onThemeChange={()=>{}} branding={{siteName:'NavPilot'}} aiPersonalEnabled/></LocaleProvider>);
    fireEvent.click(screen.getByRole('tab',{name:'指令模式'}));
    fireEvent.change(screen.getByPlaceholderText('例如：帮我看看有多少失联链接，按分类整理成表格'),{target:{value:'帮我看看有多少失联的，整理成表格'}});
    fireEvent.click(screen.getByRole('button',{name:/执行指令/}));
    await screen.findByText('失联资源汇总');
    expect(api.runAiInstructionStream.mock.calls[0].slice(0,4)).toEqual(['personal','帮我看看有多少失联的，整理成表格','zh-CN',null]);
    expect(screen.getByText('Jenkins')).toBeTruthy();
    expect(document.querySelector('.ai-query-table-scroll table')).toBeTruthy();
  });

  it('shows animated staged feedback while a natural-language command is running',async()=>{
    let release;
    api.runAiInstructionStream.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve({result:{kind:'query',conversationId:'slow-instruction',title:'执行完成',answer:'完成',summary:{matched:0,total:0,online:0,offline:0,unknown:0,monitoringEnabled:0},breakdown:[],columns:[],rows:[],truncated:false}});}));
    render(<LocaleProvider><AiWorkspace theme="dark" onThemeChange={()=>{}} branding={{siteName:'NavPilot'}} aiPersonalEnabled/></LocaleProvider>);
    fireEvent.click(screen.getByRole('tab',{name:'指令模式'}));
    fireEvent.change(screen.getByPlaceholderText('例如：帮我看看有多少失联链接，按分类整理成表格'),{target:{value:'汇总当前空间'} });
    fireEvent.click(screen.getByRole('button',{name:/执行指令/}));
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getAllByText('正在识别指令与目标空间').length).toBeGreaterThan(0);
    expect(document.querySelector('.ai-instruction-progress-bar')).toBeTruthy();
    await act(async()=>release());
    await screen.findByText('执行完成');
  });

  it('keeps instruction history separate and restores its structured result',async()=>{
    const saved={kind:'query',title:'历史失联汇总',answer:'历史查询结果',summary:{matched:1,total:8,online:0,offline:1,unknown:0,monitoringEnabled:1},breakdown:[],columns:[{key:'name',label:'资源名称'}],rows:[{id:2,name:'历史 Jenkins'}],truncated:false};
    api.listAiConversations.mockResolvedValue([{id:'saved-instruction',scope:'personal',mode:'instruction',title:'检查历史失联资源',updatedAt:Date.now()}]);
    api.getAiConversation.mockResolvedValue({id:'saved-instruction',scope:'personal',messages:[{role:'user',content:'检查历史失联资源',metadata:{mode:'instruction'}},{role:'assistant',content:'历史查询结果',metadata:{mode:'instruction',kind:'query',result:saved}}]});
    render(<LocaleProvider><AiWorkspace theme="dark" onThemeChange={()=>{}} branding={{siteName:'NavPilot'}} aiPersonalEnabled/></LocaleProvider>);
    fireEvent.click(screen.getByRole('tab',{name:'指令模式'}));
    fireEvent.click(await screen.findByRole('button',{name:/检查历史失联资源/}));
    await screen.findByText('历史 Jenkins');
    expect(api.getAiConversation).toHaveBeenCalledWith('saved-instruction');
    expect(screen.getByText('指令执行记录')).toBeTruthy();
    expect(screen.queryByPlaceholderText('例如：帮我看看有多少失联链接，按分类整理成表格')).toBeNull();
    expect(screen.queryByRole('button',{name:/执行指令/})).toBeNull();
  });

  it('restores a historical operation plan as a read-only preview',async()=>{
    api.listAiConversations.mockResolvedValue([{id:'saved-plan',scope:'personal',mode:'instruction',title:'历史移动方案',updatedAt:Date.now()}]);
    api.getAiConversation.mockResolvedValue({id:'saved-plan',scope:'personal',messages:[{role:'user',content:'移动资源',metadata:{mode:'instruction'}},{role:'assistant',content:'已生成方案',planId:'plan-1',metadata:{mode:'instruction',kind:'plan'}}]});
    api.getAiPlan.mockResolvedValue({id:'plan-1',status:'draft',operations:[]});
    render(<LocaleProvider><AiWorkspace theme="dark" onThemeChange={()=>{}} branding={{siteName:'NavPilot'}} aiPersonalEnabled/></LocaleProvider>);
    fireEvent.click(screen.getByRole('tab',{name:'指令模式'}));
    fireEvent.click(await screen.findByRole('button',{name:/历史移动方案/}));
    const preview=await screen.findByTestId('execution-plan');
    expect(preview.getAttribute('data-read-only')).toBe('true');
    expect(screen.getByText('该指令当时生成的操作方案')).toBeTruthy();
    expect(screen.queryByRole('button',{name:/执行指令/})).toBeNull();
  });

  it('renders interactive report preview and HTML download actions',async()=>{
    api.runAiInstructionStream.mockResolvedValueOnce({result:{kind:'report',conversationId:'report-history',report:{id:'report-1',title:'资源交互式报告',metrics:{resources:12,categories:4,monitoringRate:75},spaces:[{key:'public'},{key:'personal'}],previewUrl:'/api/ai/reports/report-1/html',downloadUrl:'/api/ai/reports/report-1/html?download=1'}}});
    render(<LocaleProvider><AiWorkspace theme="dark" onThemeChange={()=>{}} branding={{siteName:'NavPilot'}} aiPersonalEnabled/></LocaleProvider>);
    fireEvent.click(screen.getByRole('tab',{name:'指令模式'}));
    fireEvent.change(screen.getByPlaceholderText('例如：帮我看看有多少失联链接，按分类整理成表格'),{target:{value:'将所有空间汇总成 HTML 动态图表'}});
    fireEvent.click(screen.getByRole('button',{name:/执行指令/}));
    const download=await screen.findByRole('link',{name:/下载 HTML/});
    expect(download.getAttribute('href')).toBe('/api/ai/reports/report-1/html?download=1');
    expect(screen.getByTitle('资源交互式报告').getAttribute('src')).toBe('/api/ai/reports/report-1/html');
  });
});
