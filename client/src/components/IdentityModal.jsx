import React, { useState } from 'react';
import { useI18n } from '../i18n/LocaleContext.jsx';

function genId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `user-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export default function IdentityModal({ onClose, onSubmit, initialName = '' }) {
  const { t } = useI18n();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState('');
  function handleSubmit() {
    if (!name.trim()) { setError(t('identity.required')); return; }
    onSubmit({ id: genId(), name: name.trim() });
  }
  return <div className="modal-mask" onClick={onClose}><div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
    <h3>{t('identity.title')}</h3><p className="modal-sub">{t('identity.description')}</p>
    <div className="form-row"><label>{t('identity.nickname')}</label><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('identity.placeholder')} onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} /></div>
    {error && <div className="error-text">{error}</div>}<div className="hint" style={{ marginTop: 4 }}>{t('identity.hint')}</div>
    <div className="modal-actions"><button className="icon-btn" onClick={onClose}>{t('common.cancel')}</button><button className="icon-btn primary" onClick={handleSubmit}>{t('identity.enter')}</button></div>
  </div></div>;
}
