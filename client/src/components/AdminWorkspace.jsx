import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useI18n } from '../i18n/LocaleContext.jsx';
import AiSettingsPanel from './SystemSettingsModal.jsx';
import AdminAnalytics, { AuditTable } from './AdminAnalytics.jsx';
import UserManagement from './UserManagement.jsx';
import ThemeSwitcher from './ThemeSwitcher.jsx';
import LocaleSwitcher from './LocaleSwitcher.jsx';
import Icon from './Icon.jsx';

const tabs = [
  ['analytics','grid','analytics.title'], ['audit','shield','analytics.audit'], ['users','user','admin.users'],
  ['general','settings','settings.generalTitle'], ['ai','assistant','settings.aiMenu'],
];

function AdminLoading(){const{t}=useI18n();return <div className="admin-workspace admin-loading-shell" aria-busy="true"><header className="admin-header"><div><span className="skeleton-line skeleton-short"/><span className="skeleton-line skeleton-title"/><span className="skeleton-line skeleton-copy"/></div><span className="skeleton-line skeleton-account"/></header><nav className="admin-tabs" aria-label={t('common.loading')}>{tabs.map(([key])=><span className="skeleton-tab" key={key}/>)}</nav><main className="admin-panel admin-loading-panel"><Icon name="settings" size={22}/><span>{t('common.loading')}</span></main></div>;}

function GeneralSettings({ theme,onThemeChange,branding,onBrandingChange }) {
  const {t,errorMessage}=useI18n();
  const [draft,setDraft]=useState(branding),[saving,setSaving]=useState(false),[saved,setSaved]=useState(false),[error,setError]=useState('');
  useEffect(()=>setDraft(branding),[branding]);
  async function save(){setSaving(true);setSaved(false);setError('');try{const result=await api.updateAdminSettings({branding:draft});setDraft(result.branding);onBrandingChange?.(result.branding);setSaved(true);}catch(e){setError(errorMessage(e));}finally{setSaving(false);}}
  return <section className="admin-panel settings-page general-settings-page"><div className="settings-page-heading"><div className="settings-page-icon"><Icon name="settings" size={22}/></div><div><h2>{t('settings.generalTitle')}</h2><p>{t('settings.generalDescription')}</p></div></div><section className="settings-section"><h3>{t('settings.branding')}</h3><div className="branding-form-grid"><div className="form-row"><label>{t('settings.siteName')}</label><input value={draft.siteName||''} onChange={e=>{setSaved(false);setDraft({...draft,siteName:e.target.value});}} placeholder="NavPilot"/></div><div className="form-row"><label>{t('settings.logoUrl')}</label><input value={draft.logoUrl||''} onChange={e=>{setSaved(false);setDraft({...draft,logoUrl:e.target.value});}} placeholder="https://example.com/logo.svg"/></div><div className="form-row"><label>{t('settings.faviconUrl')}</label><input value={draft.faviconUrl||''} onChange={e=>{setSaved(false);setDraft({...draft,faviconUrl:e.target.value});}} placeholder={t('settings.faviconHint')}/></div><div className="branding-preview"><span>{draft.logoUrl?<img src={draft.logoUrl} alt=""/>:<Icon name="assistant" size={20}/>}</span><strong>{draft.siteName||'NavPilot'}</strong></div></div></section><section className="settings-section"><h3>{t('settings.browserPreferences')}</h3><div className="preference-grid"><article><div><h3>{t('theme.label')}</h3><p>{t('settings.themeDescription')}</p></div><ThemeSwitcher theme={theme} onChange={onThemeChange}/></article><article><div><h3>{t('locale.label')}</h3><p>{t('settings.localeDescription')}</p></div><LocaleSwitcher/></article></div><div className="settings-note"><Icon name="user" size={17}/><div><strong>{t('settings.preferenceScope')}</strong><span>{t('settings.preferenceScopeDesc')}</span></div></div></section>{error&&<div className="error-text">{error}</div>}{saved&&<div className="settings-saved">{t('toast.settingsSaved')}</div>}<div className="settings-actions"><button className="icon-btn primary" disabled={saving} onClick={save}>{t(saving?'common.saving':'common.save')}</button></div></section>;
}

export default function AdminWorkspace({ theme,onThemeChange,branding,onBrandingChange }) {
  const auth=useAuth();const{t}=useI18n();const[tab,setTab]=useState(()=>{const saved=sessionStorage.getItem('navpilot_admin_tab');return tabs.some(([key])=>key===saved)?saved:'analytics';});
  useEffect(()=>{if(!auth.loading&&!auth.user)auth.setLoginOpen(true);},[auth.loading,auth.user,auth.setLoginOpen]);
  useEffect(()=>sessionStorage.setItem('navpilot_admin_tab',tab),[tab]);
  if(auth.loading)return <AdminLoading/>;
  if(!auth.user)return <div className="admin-workspace"><div className="admin-panel empty-state">{t('auth.loginRequired')}</div></div>;
  if(!auth.isAdmin)return <div className="empty-state">{t('auth.forbidden')}</div>;
  if(auth.user.mustChangePassword)return <AdminLoading/>;
  return <div className="admin-workspace"><header className="admin-header"><div><a href="/" className="back-link"><Icon name="link" size={14}/>{t('admin.back')}</a><h1>{t('admin.workspace')}</h1><p>{t('admin.workspaceDesc')}</p></div><div><span>{auth.user.displayName}</span><button className="icon-btn" onClick={auth.logout}><Icon name="user" size={15}/>{t('auth.logout')}</button></div></header><nav className="admin-tabs" role="tablist" aria-label={t('admin.workspace')}>{tabs.map(([key,icon,label])=><button role="tab" aria-selected={tab===key} className={tab===key?'active':''} key={key} onClick={()=>setTab(key)}><Icon name={icon} size={16}/><span>{t(label)}</span></button>)}</nav><main className="admin-tab-content"><section className="admin-tab-panel" hidden={tab!=='analytics'}><AdminAnalytics/></section><section className="admin-tab-panel" hidden={tab!=='audit'}><AuditTable/></section><section className="admin-tab-panel" hidden={tab!=='users'}><UserManagement/></section><section className="admin-tab-panel" hidden={tab!=='general'}><GeneralSettings theme={theme} onThemeChange={onThemeChange} branding={branding} onBrandingChange={onBrandingChange}/></section><section className="admin-tab-panel" hidden={tab!=='ai'}><AiSettingsPanel/></section></main></div>;
}
