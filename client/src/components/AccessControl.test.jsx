import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api.js';
import { LocaleProvider } from '../i18n/LocaleContext.jsx';
import { AccessEditor } from './AccessControl.jsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('AccessEditor', () => {
  it('selects a group and preserves an explicit expiry', async () => {
    localStorage.setItem('navpilot_locale','zh-CN');
    vi.spyOn(api,'searchAccessPrincipals').mockResolvedValue({ principals:[{ type:'group', id:'engineering', displayName:'研发团队' }] });
    let current = { visibility:'public', grants:[] };
    const onChange = vi.fn((value) => { current = value; rerender(<LocaleProvider><AccessEditor value={current} onChange={onChange}/></LocaleProvider>); });
    const { rerender } = render(<LocaleProvider><AccessEditor value={current} onChange={onChange}/></LocaleProvider>);
    fireEvent.click(screen.getByRole('radio',{name:/指定范围/}));
    await waitFor(()=>expect(api.searchAccessPrincipals).toHaveBeenCalled());
    await waitFor(()=>expect(screen.getByRole('option',{name:/研发团队/})).toBeTruthy());
    fireEvent.change(screen.getByRole('combobox'),{target:{value:'group:engineering'}});
    expect(current.grants).toHaveLength(1);
    expect(current.grants[0]).toMatchObject({type:'group',id:'engineering',expiresAtMs:null});
  });
});
