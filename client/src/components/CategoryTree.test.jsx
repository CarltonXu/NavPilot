import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
});
