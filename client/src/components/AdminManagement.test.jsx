import React from 'react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { LocaleProvider } from '../i18n/LocaleContext.jsx';
import { api } from '../api.js';
import UserManagement from './UserManagement.jsx';
import { AuditTable } from './AdminAnalytics.jsx';

vi.mock('../api.js',()=>({api:{getAuditEvents:vi.fn(),listUsers:vi.fn(),listLegacySpaces:vi.fn(),getUser:vi.fn(),createUser:vi.fn(),updateUser:vi.fn(),deleteUser:vi.fn(),resetUserPassword:vi.fn(),assignLegacySpace:vi.fn()}}));

const user={id:'u1',username:'zhangsan',displayName:'张三',role:'user',status:'active',createdAt:'2026-08-01 10:00:00',lastLoginAt:null,passwordChangedAt:null};
const groups=[
  {id:'g1',name:'研发团队',description:'产品研发成员',memberCount:3},
  {id:'g2',name:'运维团队',description:'平台运维成员',memberCount:2},
];
const detail={
  user,
  stats:{personalItems:3,personalCategories:2,activeSessions:1,aiPlans:0},
  accessGroups:[groups[0]],
  availableAccessGroups:groups,
  authorization:{
    directResources:[{id:11,name:'内部文档',url:'https://docs.example',expiresAtMs:null}],
    groupResources:[{id:12,name:'研发看板',url:'https://board.example',groupId:'g1',groupName:'研发团队',expiresAtMs:null}],
    directCategories:[{id:21,name:'产品资料',expiresAtMs:null}],
    groupCategories:[],
  },
};

beforeEach(()=>{
  localStorage.setItem('navpilot_locale','zh-CN');
  api.getAuditEvents.mockResolvedValue({items:[],pagination:{page:1,pageSize:20,total:45,totalPages:3}});
  api.listUsers.mockResolvedValue([user]);
  api.listLegacySpaces.mockResolvedValue([]);
  api.getUser.mockResolvedValue(detail);
  api.updateUser.mockResolvedValue({user,accessGroups:groups});
});
afterEach(()=>{cleanup();vi.clearAllMocks();});

describe('admin management controls',()=>{
  it('changes the audit page size and requests the first page',async()=>{
    render(<LocaleProvider><AuditTable/></LocaleProvider>);
    await waitFor(()=>expect(api.getAuditEvents).toHaveBeenCalledWith(1,20));
    fireEvent.change(screen.getByRole('combobox',{name:'每页显示数量'}),{target:{value:'50'}});
    await waitFor(()=>expect(api.getAuditEvents).toHaveBeenCalledWith(1,50));
  });

  it('shows a structured account detail dialog with complete action groups',async()=>{
    render(<LocaleProvider><UserManagement/></LocaleProvider>);
    const row=await screen.findByRole('button',{name:/张三/});
    fireEvent.click(row);
    const dialog=await screen.findByRole('dialog',{name:'张三'});
    expect(within(dialog).getByRole('button',{name:'删除账户'})).toBeTruthy();
    expect(within(dialog).getByRole('button',{name:'重置密码'})).toBeTruthy();
    expect(within(dialog).getByRole('button',{name:'取消'})).toBeTruthy();
    expect(within(dialog).getByRole('button',{name:'保存修改'})).toBeTruthy();
    expect(within(dialog).getByRole('checkbox',{name:/研发团队/}).checked).toBe(true);
    expect(within(dialog).getByRole('checkbox',{name:/运维团队/}).checked).toBe(false);
    expect(within(dialog).getByText('内部文档')).toBeTruthy();
    expect(within(dialog).getByText('研发看板')).toBeTruthy();
    expect(within(dialog).getByText('产品资料')).toBeTruthy();
  });

  it('updates access-group membership from the account detail dialog',async()=>{
    render(<LocaleProvider><UserManagement/></LocaleProvider>);
    fireEvent.click(await screen.findByRole('button',{name:/张三/}));
    const dialog=await screen.findByRole('dialog',{name:'张三'});
    fireEvent.click(within(dialog).getByRole('checkbox',{name:/运维团队/}));
    fireEvent.click(within(dialog).getByRole('button',{name:'保存修改'}));
    await waitFor(()=>expect(api.updateUser).toHaveBeenCalledWith('u1',expect.objectContaining({
      accessGroupIds:['g1','g2'],
      expectedAccessGroupIds:['g1'],
    })));
  });

  it('refreshes account data without remounting the tab',async()=>{
    const view=render(<LocaleProvider><UserManagement refreshToken={0}/></LocaleProvider>);
    await waitFor(()=>expect(api.listUsers).toHaveBeenCalledTimes(1));
    view.rerender(<LocaleProvider><UserManagement refreshToken={1}/></LocaleProvider>);
    await waitFor(()=>expect(api.listUsers).toHaveBeenCalledTimes(2));
  });
});
