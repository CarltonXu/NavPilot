import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/LocaleContext.jsx';
import NavCard from './NavCard.jsx';

const item = {
  id:1,
  name:'内部 Wiki',
  url:'https://wiki.example.com/docs',
  icon:'icon:docs',
  description:'团队知识库',
  category_name:'文档',
  status:'online',
  is_favorite:false,
};

beforeEach(() => {
  localStorage.setItem('navpilot_locale', 'zh-CN');
});
afterEach(cleanup);

function renderCard(props = {}) {
  const callbacks = {
    onEdit:vi.fn(), onDelete:vi.fn(), onRecheck:vi.fn(),
    onToggleFavorite:vi.fn(), onCopied:vi.fn(), onClick:vi.fn(),
  };
  const result = render(<LocaleProvider><NavCard item={item} canManage canFavorite {...callbacks} {...props}/></LocaleProvider>);
  return { ...result, ...callbacks };
}

describe('NavCard context menu', () => {
  it.each([
    ['card', '.nav-card'],
    ['compact', '.nav-list-row'],
    ['overview', '.overview-resource-card'],
  ])('opens from the %s resource view and invokes edit directly', async (viewMode, selector) => {
    const result = renderCard({ viewMode });
    fireEvent.contextMenu(result.container.querySelector(selector), { clientX:120, clientY:90 });
    const menu = screen.getByRole('menu', { name:'「内部 Wiki」的操作' });
    expect(within(menu).getByRole('menuitem', { name:'在新标签页打开' })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name:'复制链接' })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name:'添加收藏' })).toBeTruthy();
    fireEvent.click(within(menu).getByRole('menuitem', { name:/编辑条目/ }));
    expect(result.onEdit).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('shows management shortcuts outside edit mode when the user has permission', () => {
    const result = renderCard({ canManage:false, canConfigure:true });
    fireEvent.contextMenu(result.container.querySelector('.nav-card'));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name:/编辑条目/ })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name:'立即探测' })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name:'删除条目' })).toBeTruthy();
    expect(result.container.querySelector('.item-selection')).toBeNull();
  });

  it('hides management actions when the user has no management permission', () => {
    const result = renderCard({ canManage:false, canConfigure:false });
    fireEvent.contextMenu(result.container.querySelector('.nav-card'));
    const menu = screen.getByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name:/编辑条目/ })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name:'立即探测' })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name:'删除条目' })).toBeNull();
  });

  it('copies the link and closes with Escape', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable:true, value:{ writeText } });
    const result = renderCard();
    fireEvent.contextMenu(result.container.querySelector('.nav-card'));
    fireEvent.click(screen.getByRole('menuitem', { name:'复制链接' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(item.url));
    await waitFor(() => expect(result.onCopied).toHaveBeenCalledTimes(1));
    fireEvent.contextMenu(result.container.querySelector('.nav-card'));
    fireEvent.keyDown(document, { key:'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('preserves the browser context menu while Shift is held', () => {
    const result = renderCard();
    fireEvent.contextMenu(result.container.querySelector('.nav-card'), { shiftKey:true });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows the uptime timeline without opening the resource link', () => {
    const onShowAvailability = vi.fn();
    const availability = { state:'online', availability:99.9, daily:Array.from({length:30},(_,index)=>({date:`2026-07-${String(index+1).padStart(2,'0')}`,status:'online',checks:1,availability:100})) };
    renderCard({ item:{...item,check_enabled:1}, availability, onShowAvailability });
    fireEvent.click(screen.getByRole('button',{name:/过去 30 天可用性/}));
    expect(onShowAvailability).toHaveBeenCalledTimes(1);
  });

  it('shows a visible no-history timeline when monitoring is enabled', () => {
    const result = renderCard({ item:{...item,check_enabled:1}, availability:{ state:'unknown', availability:null, checks:0, daily:Array.from({length:30},(_,index)=>({date:String(index),status:'unknown',checks:0})) } });
    expect(result.container.querySelectorAll('.nav-card-availability .availability-bars>i')).toHaveLength(30);
    expect(result.container.querySelector('.nav-card-availability .availability-state.unknown')).toBeTruthy();
    expect(screen.getByText('等待首次检测')).toBeTruthy();
  });

  it.each([
    ['compact', 14],
    ['overview', 7],
  ])('shows a readable monitoring range in %s mode', (viewMode, expectedDays) => {
    const result = renderCard({ item:{...item,check_enabled:1}, availability:{ state:'unknown', availability:null, checks:0, daily:Array.from({length:30},(_,index)=>({date:String(index),status:'unknown',checks:0})) }, viewMode });
    expect(result.container.querySelectorAll('.nav-card-availability .availability-bars>i')).toHaveLength(expectedDays);
    expect(result.container.querySelector('.availability-bars').style.getPropertyValue('--availability-bars')).toBe(String(expectedDays));
    expect(result.container.querySelector('.nav-card-availability .availability-state.unknown')).toBeTruthy();
  });
});
