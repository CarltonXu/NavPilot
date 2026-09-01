import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/LocaleContext.jsx';
import { CATEGORY_ICON_GROUPS, CATEGORY_ICONS } from '../constants/categoryIcons.js';
import VectorIconPicker from './VectorIconPicker.jsx';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('navpilot_locale', 'zh-CN');
});
afterEach(cleanup);

function renderPicker(props = {}) {
  const onChange = vi.fn();
  render(<LocaleProvider><VectorIconPicker value="icon:link" onChange={onChange} label="选择图标" {...props}/></LocaleProvider>);
  fireEvent.click(screen.getByRole('button', { name:/链接.*选择图标/ }));
  return { onChange, dialog:screen.getByRole('dialog', { name:'选择图标' }) };
}

describe('VectorIconPicker', () => {
  it('opens on all icons and presents the catalog in category sections', () => {
    const { dialog } = renderPicker();
    const all = within(dialog).getByRole('button', { name:`全部图标${CATEGORY_ICONS.length}` });

    expect(all.getAttribute('aria-current')).toBe('true');
    expect(dialog.querySelectorAll('.vector-icon-section')).toHaveLength(CATEGORY_ICON_GROUPS.length);
    expect(dialog.querySelectorAll('.vector-icon-grid button')).toHaveLength(CATEGORY_ICONS.length);
  }, 15000);

  it('focuses the AI catalog from the left category navigation', () => {
    const { dialog } = renderPicker();
    fireEvent.click(within(dialog).getByRole('button', { name:/人工智能/ }));

    expect(within(dialog).getByRole('button', { name:/智能大脑 AI brain/ })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name:/服务器 Server/ })).toBeNull();
  });

  it('searches all icon groups by Chinese and English names', () => {
    const { dialog } = renderPicker();
    const search = within(dialog).getByRole('textbox', { name:'搜索图标' });
    fireEvent.change(search, { target:{ value:'数据库' } });
    expect(within(dialog).getByRole('button', { name:/数据库 Database/ })).toBeTruthy();
    fireEvent.change(search, { target:{ value:'server' } });
    expect(within(dialog).getByRole('button', { name:/服务器 Server/ })).toBeTruthy();
  });

  it('applies only after confirmation and stores recent icons', async () => {
    const { dialog, onChange } = renderPicker();
    fireEvent.click(within(dialog).getByRole('button', { name:/开发/ }));
    fireEvent.click(within(dialog).getByRole('button', { name:/终端 Terminal/ }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name:'确认' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('icon:terminal'));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('navpilot_recent_icons'))).toEqual(['terminal']));
  });

  it('does not expose custom URLs for category-only pickers', () => {
    const { dialog } = renderPicker({ allowCustom:false });
    expect(within(dialog).queryByRole('textbox', { name:'自定义图标 URL' })).toBeNull();
  });
});
