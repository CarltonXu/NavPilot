import React from 'react';
import { useI18n } from '../i18n/LocaleContext.jsx';
import { ContentIcon } from './Icon.jsx';
import CategoryTree from './CategoryTree.jsx';

export default function CategoryNav({ categories, counts, active, onSelect, manageable=false, onCreate, onRename, onDelete, onDropItems }) {
  const { t } = useI18n();
  const totalCount = counts.all ?? Object.values(counts).reduce((a, b) => a + b, 0);
  function dropUncategorized(event){if(!manageable||!onDropItems)return;event.preventDefault();onDropItems(event,null);}
  return <nav className="category-nav" aria-label={t('category.manage')}>
    <button className={active === 'all' ? 'active' : ''} onClick={() => onSelect('all')}><span className="cat-icon"><ContentIcon value="icon:grid" size={17} /></span><span className="category-nav-name" title={t('category.all')}>{t('category.all')}</span><span className="count">{totalCount}</span></button>
    <CategoryTree categories={categories} counts={counts} active={active} onSelect={onSelect} manageable={manageable} onCreate={onCreate} onRename={onRename} onDelete={onDelete} onDropItems={onDropItems}/>
    <button className={active === 'uncategorized' ? 'active' : ''} onClick={() => onSelect('uncategorized')} onDragOver={event=>{if(manageable){event.preventDefault();event.dataTransfer.dropEffect='move';event.currentTarget.classList.add('drop-target');}}} onDragLeave={event=>event.currentTarget.classList.remove('drop-target')} onDrop={event=>{event.currentTarget.classList.remove('drop-target');dropUncategorized(event);}}><span className="cat-icon"><ContentIcon value="📎" size={17} /></span><span className="category-nav-name" title={t('category.uncategorized')}>{t('category.uncategorized')}</span><span className="count">{counts.uncategorized || 0}</span></button>
  </nav>;
}
