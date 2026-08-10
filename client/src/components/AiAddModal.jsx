import React from 'react';
import { useI18n } from '../i18n/LocaleContext.jsx';
import AiCommandPanel from './AiCommandPanel.jsx';
export default function AiAddModal({onClose,onCreated}){const{t}=useI18n();return <div className="modal-mask" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal ai-command-modal"><h3>{t('ai.title')}</h3><p className="modal-sub">{t('ai.description')}</p><AiCommandPanel scope="public" onClose={onClose} onExecuted={(result,undo)=>onCreated?.(result,undo)}/><div className="modal-actions"><button className="icon-btn" onClick={onClose}>{t('common.close')}</button></div></div></div>;}
