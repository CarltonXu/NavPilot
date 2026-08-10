import React from 'react';
import { useI18n } from '../i18n/LocaleContext.jsx';
import Icon from './Icon.jsx';

export default function SpaceSwitcher({ space, onChange, userName, canEditPublic=false, publicEditMode=false, isPersonalOwner=false, personalEditMode=false, onEnterPublicEdit, onExitPublicEdit, onEnterPersonalEdit, onExitPersonalEdit }) {
  const { t } = useI18n();
  const editable=space==='public'?canEditPublic:isPersonalOwner,editing=space==='public'?publicEditMode:personalEditMode;
  const toggle=space==='public'?(editing?onExitPublicEdit:onEnterPublicEdit):(editing?onExitPersonalEdit:onEnterPersonalEdit);
  const label=space==='public'?(editing?'space.exitPublicEdit':'space.editPublic'):(editing?'space.exitPersonalEdit':'space.editPersonal');
  return <div className="space-bar"><div className="space-switch"><button className={space === 'public' ? 'active' : ''} onClick={() => onChange('public')}><span className="space-icon">🏢</span> {t('space.public')}</button><button className={space === 'personal' ? 'active' : ''} onClick={() => onChange('personal')}><span className="space-icon">👤</span> {t('space.personal')}</button></div><div className="space-desc">{space === 'public' ? t(publicEditMode?'space.publicEditing':'space.publicViewing') : `${t(personalEditMode?'space.personalEditing':'space.personalViewing')}${userName ? ` · ${t('space.currentIdentity', { name: userName })}` : ''}`}</div>{editable&&<button className={`icon-btn space-edit-btn ${editing?'active':''}`} onClick={toggle}><Icon name={editing?'check':'settings'} size={15}/>{t(label)}</button>}</div>;
}
