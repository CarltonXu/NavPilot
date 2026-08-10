import React from 'react';
import { useI18n } from '../i18n/LocaleContext.jsx';
import DropdownMenu from './DropdownMenu.jsx';
import Icon from './Icon.jsx';
const THEMES=[{key:'dark',dot:'#5b7fff'},{key:'light',dot:'#3452d9'},{key:'midnight',dot:'#8b7bff'},{key:'eyecare',dot:'#3d6b57'}];
export default function ThemeSwitcher({theme,onChange}){const{t}=useI18n();const current=THEMES.find(x=>x.key===theme)||THEMES[0];return <DropdownMenu className="theme-switcher" trigger={<button className="icon-btn square-icon" aria-label={t('theme.label')} title={t('theme.label')}><Icon name={theme==='light'?'sun':'moon'} size={18}/><span className="theme-indicator" style={{background:current.dot}}/></button>}>{THEMES.map(item=><button role="menuitem" key={item.key} className={item.key===theme?'active':''} onClick={()=>onChange(item.key)}><span className="swatch" style={{background:item.dot}}/>{t(`theme.${item.key}`)}</button>)}</DropdownMenu>;}
