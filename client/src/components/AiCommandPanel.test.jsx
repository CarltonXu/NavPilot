import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocaleProvider } from '../i18n/LocaleContext.jsx';
import { api } from '../api.js';
import AiCommandPanel from './AiCommandPanel.jsx';

vi.mock('../api.js',()=>({api:{executeAiPlan:vi.fn(),undoAiPlan:vi.fn()}}));

afterEach(()=>{cleanup();vi.clearAllMocks();});

describe('AI command plan lifecycle',()=>{
  it('reapplies an undone plan with a fresh idempotency key and confirmation',async()=>{
    api.executeAiPlan.mockResolvedValue({planId:'plan-1',status:'executed',reapplied:true,affectedCount:1});
    render(<LocaleProvider><AiCommandPanel workspace compact initialPlan={{id:'plan-1',status:'undone',operations:[{op:'item.bulkUpdate',ids:['item-1'],patch:{check_enabled:true},display:{name:'Jenkins'}}],destructive:false}}/></LocaleProvider>);
    expect(screen.getByText('方案已撤销')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'重新应用'}));
    await waitFor(()=>expect(api.executeAiPlan).toHaveBeenCalledTimes(1));
    expect(api.executeAiPlan.mock.calls[0][0]).toBe('plan-1');
    expect(api.executeAiPlan.mock.calls[0][1]).toMatchObject({confirmed:true,confirmDestructive:false});
    expect(api.executeAiPlan.mock.calls[0][1].idempotencyKey.length).toBeGreaterThanOrEqual(8);
    expect(await screen.findByText('方案已重新应用')).toBeTruthy();
  });
});
