import React from'react';
import{afterEach,beforeEach,describe,expect,it,vi}from'vitest';
import{cleanup,fireEvent,render,screen,waitFor}from'@testing-library/react';
import{LocaleProvider}from'../i18n/LocaleContext.jsx';
import{api}from'../api.js';
import AiWorkspace from'./AiWorkspace.jsx';

vi.mock('../api.js',()=>({api:{listAiConversations:vi.fn(),listAiJobs:vi.fn(),listAiReports:vi.fn(),getAiConversation:vi.fn(),discussAi:vi.fn()}}));
vi.mock('../auth/AuthContext.jsx',()=>({useAuth:()=>({authenticated:true,loading:false,isAdmin:true,user:{id:'admin',role:'admin',displayName:'Admin'},setLoginOpen:vi.fn()})}));
vi.mock('./ThemeSwitcher.jsx',()=>({default:()=>null}));
vi.mock('./LocaleSwitcher.jsx',()=>({default:()=>null}));
vi.mock('./NotificationCenter.jsx',()=>({default:()=>null}));
vi.mock('./AuthDialogs.jsx',()=>({AccountMenu:()=>null}));
vi.mock('./AiOrganizePanel.jsx',()=>({default:()=> <div>organize-panel</div>}));
vi.mock('./AiCommandPanel.jsx',()=>({default:({initialText,initialConversationId})=><div data-testid="execution-plan">{initialConversationId}:{initialText}</div>}));

beforeEach(()=>{localStorage.setItem('navpilot_locale','zh-CN');sessionStorage.clear();api.listAiConversations.mockResolvedValue([]);api.listAiJobs.mockResolvedValue([]);api.listAiReports.mockResolvedValue([]);api.discussAi.mockResolvedValue({conversationId:'conversation-1',answer:'建议先按使用场景分类。'});});
afterEach(()=>{cleanup();vi.clearAllMocks();});

describe('AI Workspace',()=>{
  it('keeps advisory discussion separate until the user converts it into a plan',async()=>{
    render(<LocaleProvider><AiWorkspace theme="dark" onThemeChange={()=>{}} branding={{siteName:'NavPilot'}} aiPersonalEnabled/></LocaleProvider>);
    expect(screen.getByText('AI 工作台')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('描述目标、问题或想法。讨论阶段不会修改任何资源。'),{target:{value:'讨论公司导航分类'}});
    fireEvent.click(screen.getByRole('button',{name:/发送讨论/}));
    await screen.findByText('建议先按使用场景分类。');
    expect(api.discussAi).toHaveBeenCalledWith('personal','讨论公司导航分类','zh-CN',null);
    expect(screen.queryByTestId('execution-plan')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'转成执行方案'}));
    await waitFor(()=>expect(screen.getByTestId('execution-plan').textContent).toContain('conversation-1'));
  });
});
