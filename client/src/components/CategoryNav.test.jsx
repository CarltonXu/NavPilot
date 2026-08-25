import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/LocaleContext.jsx';
import CategoryNav from './CategoryNav.jsx';

const categories=[{id:1,name:'研发',path_label:'公司 / 研发',icon:'icon:code',parent_id:null}];
const props={categories,counts:{all:8,1:5,uncategorized:3},active:1,onSelect:vi.fn(),onSelectFavorites:vi.fn(),onCreate:vi.fn(),onRename:vi.fn(),onDelete:vi.fn()};

beforeEach(()=>{localStorage.setItem('navpilot_locale','zh-CN');history.replaceState({},'');props.onSelect.mockClear();props.onSelectFavorites.mockClear();window.scrollTo=vi.fn();});
afterEach(()=>{cleanup();document.body.style.overflow='';});

describe('CategoryNav mobile drawer',()=>{
  it('shows the active path in a compact trigger and closes after selection',async()=>{
    render(<LocaleProvider><CategoryNav {...props}/></LocaleProvider>);
    const trigger=screen.getByRole('button',{name:/当前分类/});
    expect(trigger.textContent).toContain('公司 / 研发');
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog',{name:'选择分类'})).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');
    const allButtons=screen.getAllByRole('button',{name:/全部/});
    fireEvent.click(allButtons.at(-1));
    expect(props.onSelect).toHaveBeenCalledWith('all');
    await waitFor(()=>expect(screen.queryByRole('dialog',{name:'选择分类'})).toBeNull());
  });

  it('closes with Escape without changing the category',async()=>{
    render(<LocaleProvider><CategoryNav {...props}/></LocaleProvider>);
    fireEvent.click(screen.getByRole('button',{name:/当前分类/}));
    fireEvent.keyDown(window,{key:'Escape'});
    await waitFor(()=>expect(screen.queryByRole('dialog',{name:'选择分类'})).toBeNull());
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('uses browser back to dismiss the drawer',async()=>{
    render(<LocaleProvider><CategoryNav {...props}/></LocaleProvider>);
    fireEvent.click(screen.getByRole('button',{name:/当前分类/}));
    fireEvent.popState(window);
    await waitFor(()=>expect(screen.queryByRole('dialog',{name:'选择分类'})).toBeNull());
  });
});

describe('CategoryNav favorites entry',()=>{
  it('shows favorites as a primary entry and invokes its dedicated filter',()=>{
    render(<LocaleProvider><CategoryNav {...props} active="all" favoriteCount={3} favoriteActive/></LocaleProvider>);
    const favorite=screen.getByRole('button',{name:'我的收藏3'});

    expect(favorite.classList.contains('active')).toBe(true);
    expect(favorite.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button',{name:/当前分类我的收藏3/})).toBeTruthy();
    fireEvent.click(favorite);
    expect(props.onSelectFavorites).toHaveBeenCalledTimes(1);
  });

  it('stays hidden until the current space contains a favorite',()=>{
    render(<LocaleProvider><CategoryNav {...props} favoriteCount={0}/></LocaleProvider>);
    expect(screen.queryByRole('button',{name:/我的收藏/})).toBeNull();
  });
});
