import React, { useState } from 'react';
import { useI18n } from '../i18n/LocaleContext.jsx';

import { flattenCategoryTree } from '../utils/categoryTree.js';

const ICON_PRESETS = ['🔗', '🌐', '💻', '📊', '📚', '🛠️', '📋', '🐙', '☁️', '🧭', '📈', '🔒', '📁', '🚀'];

export default function ItemFormModal({ item, categories, onClose, onSubmit, onDelete }) {
  const { t, errorMessage } = useI18n();
  const isEdit = Boolean(item && item.id);
  const [form, setForm] = useState({ name: item?.name || '', url: item?.url || '', icon: item?.icon || '🔗', description: item?.description || '', category_id: item?.category_id ?? '', check_method: item?.check_method || 'http', check_target: item?.check_target || '', check_enabled: item?.check_enabled ?? 1 });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.url.trim()) { setError(t('item.required')); return; }
    setSaving(true); setError('');
    try { await onSubmit({ ...form, category_id: form.category_id === '' ? null : Number(form.category_id), check_enabled: form.check_enabled ? 1 : 0 }); }
    catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  }
  return <div className="modal-mask" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}>
    <h3>{t(isEdit ? 'item.editTitle' : 'item.addTitle')}</h3><p className="modal-sub">{t('item.description')}</p>
    <form onSubmit={submit}>
      <div className="form-grid-2"><div className="form-row"><label>{t('item.name')}</label><input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder={t('item.namePlaceholder')} /></div><div className="form-row"><label>{t('item.icon')}</label><input value={form.icon} onChange={(e) => update('icon', e.target.value)} placeholder="🔗" /></div></div>
      <div className="form-row"><label>{t('item.url')}</label><input value={form.url} onChange={(e) => update('url', e.target.value)} placeholder="https://" /></div>
      <div className="form-row"><label>{t('item.quickIcon')}</label><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{ICON_PRESETS.map((icon) => <button type="button" key={icon} className="mini-btn" style={{ width: 30, height: 30, fontSize: 15 }} onClick={() => update('icon', icon)}>{icon}</button>)}</div></div>
      <div className="form-row"><label>{t('item.descriptionLabel')}</label><textarea rows={2} value={form.description} onChange={(e) => update('description', e.target.value)} placeholder={t('item.descriptionPlaceholder')} /></div>
      <div className="form-grid-2"><div className="form-row"><label>{t('item.category')}</label><select value={form.category_id} onChange={(e) => update('category_id', e.target.value)}><option value="">{t('category.uncategorized')}</option>{flattenCategoryTree(categories).map((c) => <option key={c.id} value={c.id}>{c.path_label}</option>)}</select></div><div className="form-row"><label>{t('item.checkMethod')}</label><select value={form.check_method} onChange={(e) => update('check_method', e.target.value)}><option value="http">HTTP(S)</option><option value="tcp">{t('item.tcp')}</option><option value="none">{t('item.none')}</option></select></div></div>
      {form.check_method !== 'none' && <div className="form-row"><label>{t('item.checkTarget')}</label><input value={form.check_target} onChange={(e) => update('check_target', e.target.value)} placeholder={form.check_method === 'tcp' ? t('item.tcpPlaceholder') : 'https://example.com/health'} /><div className="hint">{t('item.checkHint')}</div></div>}
      {error && <div className="error-text">{error}</div>}<div className="modal-actions">{isEdit && <button type="button" className="icon-btn" style={{ marginRight: 'auto', color: 'var(--offline)' }} onClick={onDelete}>{t('common.delete')}</button>}<button type="button" className="icon-btn" onClick={onClose}>{t('common.cancel')}</button><button type="submit" className="icon-btn primary" disabled={saving}>{t(saving ? 'common.saving' : 'common.save')}</button></div>
    </form>
  </div></div>;
}
