import React from 'react';
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/LocaleContext.jsx';
import CategoryTree from './CategoryTree.jsx';

afterEach(cleanup);

describe('CategoryTree editing', () => {
  it('creates a root category from a dialog instead of an inline sidebar form', async () => {
    localStorage.setItem('navpilot_locale', 'zh-CN');
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<LocaleProvider><CategoryTree categories={[]} counts={{}} active="all" manageable onCreate={onCreate} onRename={vi.fn()} onDelete={vi.fn()}/></LocaleProvider>);
    fireEvent.click(screen.getByRole('button', { name:'新建分类' }));
    expect(screen.getByRole('dialog', { name:'新建分类' })).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name:'分类名称' }), { target:{ value:'研发工具' } });
    fireEvent.click(screen.getByRole('button', { name:'创建分类' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ name:'研发工具',icon:'icon:folder',parent_id:null }));
  });

  it('keeps the selected parent when creating a child category in the dialog', async () => {
    localStorage.setItem('navpilot_locale', 'zh-CN');
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<LocaleProvider><CategoryTree categories={[{ id:1,name:'研发',icon:'icon:code',parent_id:null }]} counts={{1:0}} active="all" manageable onCreate={onCreate} onRename={vi.fn()} onDelete={vi.fn()}/></LocaleProvider>);
    fireEvent.click(screen.getByRole('button', { name:'在「研发」下新增分类' }));
    expect(screen.getByText('将在「研发」下创建子分类')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name:'分类名称' }), { target:{ value:'后端' } });
    fireEvent.submit(screen.getByRole('textbox', { name:'分类名称' }).closest('form'));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ name:'后端',icon:'icon:folder',parent_id:1 }));
  });

  it('renames a category inline in edit mode', async () => {
    localStorage.setItem('navpilot_locale', 'zh-CN');
    const onRename = vi.fn().mockResolvedValue(undefined);
    render(<LocaleProvider><CategoryTree categories={[{ id:1,name:'研发',icon:'icon:code',parent_id:null }]} counts={{1:2}} active="all" manageable onCreate={vi.fn()} onRename={onRename} onDelete={vi.fn()}/></LocaleProvider>);
    fireEvent.click(screen.getByRole('button', { name:'重命名分类「研发」' }));
    const input = screen.getByRole('textbox', { name:'重命名分类「研发」' });
    fireEvent.change(input, { target:{ value:'研发工具' } });
    fireEvent.keyDown(input, { key:'Enter' });
    await waitFor(() => expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ id:1,name:'研发' }), '研发工具'));
  });

  it('moves a category under another category with drag and drop', async () => {
    localStorage.setItem('navpilot_locale', 'zh-CN');
    const onMoveCategory=vi.fn();
    const data=new Map(),dataTransfer={effectAllowed:'',dropEffect:'',setData:(type,value)=>data.set(type,value),getData:type=>data.get(type)||''};
    render(<LocaleProvider><CategoryTree categories={[{id:1,name:'研发',icon:'icon:code',parent_id:null,depth:1,sort_order:0},{id:2,name:'办公',icon:'icon:briefcase',parent_id:null,depth:1,sort_order:1}]} counts={{1:0,2:0}} active="all" manageable onCreate={vi.fn()} onRename={vi.fn()} onChangeIcon={vi.fn()} onDelete={vi.fn()} onMoveCategory={onMoveCategory}/></LocaleProvider>);
    fireEvent.dragStart(screen.getByRole('button',{name:'拖动分类「研发」'}),{dataTransfer});
    const target=screen.getByRole('button',{name:'办公 0'}).closest('.category-tree-row');
    fireEvent.dragOver(target,{dataTransfer});
    fireEvent.drop(target,{dataTransfer});
    expect(onMoveCategory).toHaveBeenCalledWith(1,2,0);
  });

  it('keeps category dragging working when the browser hides drag data during dragover', () => {
    localStorage.setItem('navpilot_locale', 'zh-CN');
    const onMoveCategory=vi.fn(),data=new Map();let protectedMode=false;
    const dataTransfer={effectAllowed:'',dropEffect:'',setData:(type,value)=>data.set(type,value),getData:type=>protectedMode?'':data.get(type)||'',setDragImage:vi.fn()};
    render(<LocaleProvider><CategoryTree categories={[{id:1,name:'一级 A',icon:'icon:folder',parent_id:null,depth:1,sort_order:0},{id:2,name:'一级 B',icon:'icon:folder',parent_id:null,depth:1,sort_order:1},{id:3,name:'二级 B',icon:'icon:folder',parent_id:2,depth:2,sort_order:0}]} counts={{1:0,2:0,3:0}} active="all" manageable onCreate={vi.fn()} onRename={vi.fn()} onChangeIcon={vi.fn()} onDelete={vi.fn()} onMoveCategory={onMoveCategory}/></LocaleProvider>);
    fireEvent.dragStart(screen.getByRole('button',{name:'拖动分类「一级 A」'}),{dataTransfer});
    protectedMode=true;
    const target=screen.getByRole('button',{name:'二级 B 0'}).closest('.category-tree-row');target.getBoundingClientRect=()=>({top:100,height:40});
    const over=createEvent.dragOver(target,{dataTransfer}),drop=createEvent.drop(target,{dataTransfer});Object.defineProperty(over,'clientY',{value:120});Object.defineProperty(drop,'clientY',{value:120});
    fireEvent(target,over);fireEvent(target,drop);
    expect(onMoveCategory).toHaveBeenCalledWith(1,3,0);
  });

  it('moves a second-level category before a sibling without changing its parent', () => {
    localStorage.setItem('navpilot_locale', 'zh-CN');
    const onMoveCategory=vi.fn(),data=new Map(),dataTransfer={effectAllowed:'',dropEffect:'',setData:(type,value)=>data.set(type,value),getData:type=>data.get(type)||''};
    const categories=[{id:1,name:'研发',icon:'icon:code',parent_id:null,depth:1,sort_order:0},{id:2,name:'前端',icon:'icon:monitor',parent_id:1,depth:2,sort_order:0},{id:3,name:'后端',icon:'icon:server',parent_id:1,depth:2,sort_order:1}];
    render(<LocaleProvider><CategoryTree categories={categories} counts={{1:0,2:0,3:0}} active="all" manageable onCreate={vi.fn()} onRename={vi.fn()} onChangeIcon={vi.fn()} onDelete={vi.fn()} onMoveCategory={onMoveCategory}/></LocaleProvider>);
    fireEvent.dragStart(screen.getByRole('button',{name:'拖动分类「后端」'}),{dataTransfer});
    const target=screen.getByRole('button',{name:'前端 0'}).closest('.category-tree-row');
    target.getBoundingClientRect=()=>({top:100,height:40});
    const dragOver=createEvent.dragOver(target,{dataTransfer}),drop=createEvent.drop(target,{dataTransfer});
    Object.defineProperty(dragOver,'clientY',{value:102});Object.defineProperty(drop,'clientY',{value:102});
    fireEvent(target,dragOver);fireEvent(target,drop);
    expect(onMoveCategory).toHaveBeenCalledWith(3,1,0);
  });

  it('changes a category icon using SVG choices', async () => {
    localStorage.setItem('navpilot_locale', 'zh-CN');
    const onChangeIcon=vi.fn().mockResolvedValue(undefined);
    const category={id:1,name:'研发',icon:'icon:code',parent_id:null,depth:1,sort_order:0};
    render(<LocaleProvider><CategoryTree categories={[category]} counts={{1:0}} active="all" manageable onCreate={vi.fn()} onRename={vi.fn()} onChangeIcon={onChangeIcon} onDelete={vi.fn()}/></LocaleProvider>);
    fireEvent.click(screen.getByRole('button',{name:'更换分类「研发」的图标'}));
    fireEvent.click(screen.getByRole('button',{name:'选择图标 database'}));
    fireEvent.click(screen.getByRole('button',{name:'确认'}));
    await waitFor(()=>expect(onChangeIcon).toHaveBeenCalledWith(category,'icon:database'));
  });
});
