import React from 'react';
import { useI18n } from '../i18n/LocaleContext.jsx';
import DropdownMenu from './DropdownMenu.jsx';
import Icon from './Icon.jsx';
const LOCALES=[{key:'zh-CN',labelKey:'locale.zh'},{key:'en',labelKey:'locale.en'}];
export default function LocaleSwitcher(){const{locale,setLocale,t}=useI18n();return <DropdownMenu className="locale-switcher" trigger={<button className="icon-btn square-icon" aria-label={t('locale.label')} title={t('locale.label')}><Icon name="globe" size={18}/></button>}>{LOCALES.map(item=><button role="menuitem" key={item.key} className={item.key===locale?'active':''} onClick={()=>setLocale(item.key)}>{t(item.labelKey)}</button>)}</DropdownMenu>;}
