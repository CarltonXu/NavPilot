import React from 'react';
import { useI18n } from '../i18n/LocaleContext.jsx';
import Icon from './Icon.jsx';

export default function SpaceSwitcher({ space, onChange, userName, canEditPublic=false, publicEditMode=false, isPersonalOwner=false, personalEditMode=false, onEnterPublicEdit, onExitPublicEdit, onEnterPersonalEdit, onExitPersonalEdit, locked=false, lockLabel='' }) {
  const { t } = useI18n();
  const editable=space==='public'?canEditPublic:isPersonalOwner,editing=space==='public'?publicEditMode:personalEditMode;
  const toggle=space==='public'?(editing?onExitPublicEdit:onEnterPublicEdit):(editing?onExitPersonalEdit:onEnterPersonalEdit);
  const label=space==='public'?(editing?'space.exitPublicEdit':'space.editPublic'):(editing?'space.exitPersonalEdit':'space.editPersonal');
  return <div className={`space-bar ${locked?'locked':''}`} aria-busy={locked}><div className="space-switch"><button className={space === 'public' ? 'active' : ''} disabled={locked} title={locked?lockLabel:''} onClick={() => onChange('public')}><span className="space-icon">🏢</span> {t('space.public')}</button><button className={space === 'personal' ? 'active' : ''} disabled={locked} title={locked?lockLabel:''} onClick={() => onChange('personal')}><span className="space-icon">👤</span> {t('space.personal')}</button></div><div className="space-desc">{locked?lockLabel:space === 'public' ? t(publicEditMode?'space.publicEditing':'space.publicViewing') : `${t(personalEditMode?'space.personalEditing':'space.personalViewing')}${userName ? ` · ${t('space.currentIdentity', { name: userName })}` : ''}`}</div>{editable&&<button className={`icon-btn space-edit-btn ${editing?'active':''}`} disabled={locked} title={locked?lockLabel:''} onClick={toggle}><Icon name={locked?'refresh':editing?'check':'settings'} className={locked?'batch-identify-spinner':''} size={15}/>{locked?lockLabel:t(label)}</button>}</div>;
}
