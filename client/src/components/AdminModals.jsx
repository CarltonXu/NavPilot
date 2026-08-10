import React, { useState } from 'react';
import { useI18n } from '../i18n/LocaleContext.jsx';
import { ContentIcon } from './Icon.jsx';

export function AdminTokenModal({ onClose, onSubmit }) {
  const { t } = useI18n();
  const [token, setToken] = useState('');
  return <div className="modal-mask" onClick={onClose}><div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
    <h3>{t('admin.title')}</h3><p className="modal-sub">{t('admin.description')}</p>
    <div className="form-row"><input type="password" autoFocus value={token} onChange={(e) => setToken(e.target.value)} placeholder={t('admin.token')} onKeyDown={(e) => e.key === 'Enter' && onSubmit(token)} /></div>
    <div className="modal-actions"><button className="icon-btn" onClick={onClose}>{t('common.cancel')}</button><button className="icon-btn primary" onClick={() => onSubmit(token)}>{t('common.confirm')}</button></div>
  </div></div>;
}

export function CategoryManageModal({ categories, onClose, onCreate, onDelete }) {
  const { t, errorMessage } = useI18n();
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('📁');
  const [error, setError] = useState('');
  async function handleCreate() {
    if (!newName.trim()) return;
    try { await onCreate({ name: newName.trim(), icon: newIcon || '📁' }); setNewName(''); setNewIcon('📁'); }
    catch (e) { setError(errorMessage(e)); }
  }
  return <div className="modal-mask" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}>
    <h3>{t('category.manage')}</h3><p className="modal-sub">{t('category.manageDesc')}</p>
    {categories.map((c) => <div key={c.id} className="ai-preview-item"><div className="content-icon-preview"><ContentIcon value={c.icon} size={18}/></div><div className="meta"><div className="name">{c.name}</div></div><button className="mini-btn" title={t('common.delete')} onClick={() => onDelete(c.id)}>✕</button></div>)}
    <div className="form-grid-2" style={{ marginTop: 14 }}><div className="form-row"><label>{t('category.icon')}</label><input value={newIcon} onChange={(e) => setNewIcon(e.target.value)} /></div><div className="form-row"><label>{t('category.newName')}</label><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('category.newPlaceholder')} onKeyDown={(e) => e.key === 'Enter' && handleCreate()} /></div></div>
    {error && <div className="error-text">{error}</div>}<div className="modal-actions"><button className="icon-btn" onClick={onClose}>{t('common.close')}</button><button className="icon-btn primary" onClick={handleCreate}>{t('category.add')}</button></div>
  </div></div>;
}
