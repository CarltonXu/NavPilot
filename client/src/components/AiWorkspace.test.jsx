import React from'react';
import{afterEach,beforeEach,describe,expect,it,vi}from'vitest';
import{cleanup,fireEvent,render,screen,waitFor}from'@testing-library/react';
import{LocaleProvider}from'../i18n/LocaleContext.jsx';
import{api}from'../api.js';
import AiWorkspace from'./AiWorkspace.jsx';

vi.mock('../api.js',()=>({api:{listAiConversations:vi.fn(),getAiConversation:vi.fn(),discussAiStream:vi.fn()}}));
vi.mock('../auth/AuthContext.jsx',()=>({useAuth:()=>({authenticated:true,loading:false,isAdmin:true,user:{id:'admin',role:'admin',displayName:'Admin'},setLoginOpen:vi.fn()})}));
vi.mock('./ThemeSwitcher.jsx',()=>({default:()=>null}));
vi.mock('./LocaleSwitcher.jsx',()=>({default:()=>null}));
vi.mock('./AuthDialogs.jsx',()=>({AccountMenu:()=>null}));
vi.mock('./AiCommandPanel.jsx',()=>({default:({initialText,initialConversationId})=><div data-testid="execution-plan">{initialConversationId}:{initialText}</div>}));

beforeEach(()=>{localStorage.setItem('navpilot_locale','zh-CN');sessionStorage.clear();api.listAiConversations.mockResolvedValue([]);api.discussAiStream.mockImplementation(async(_scope,_text,_locale,_conversationId,handlers)=>{handlers.onMeta({conversationId:'conversation-1'});handlers.onDelta('建议先按使用场景');handlers.onDelta('分类。');return{conversationId:'conversation-1',model:'test-model'};});});
afterEach(()=>{cleanup();vi.clearAllMocks();});

describe('AI Workspace',()=>{
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
});
