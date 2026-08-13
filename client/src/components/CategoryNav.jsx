import React, { useRef, useState } from 'react';
import { useI18n } from '../i18n/LocaleContext.jsx';
import Icon, { ContentIcon } from './Icon.jsx';
import CategoryTree from './CategoryTree.jsx';
import CategorySelectionBox from './CategorySelectionBox.jsx';
import { CATEGORY_SIDEBAR_MAX_WIDTH, CATEGORY_SIDEBAR_MIN_WIDTH, categorySidebarCollapsePreview, clampCategorySidebarWidth } from '../utils/categorySidebar.js';

export default function CategoryNav({ categories, counts, active, onSelect, manageable=false, onCreate, onRename, onDelete, onDropItems, selectionStates, onToggleSelection, selectionDisabled=false, resizable=false, collapsed=false, onCollapsedChange, onWidthChange, onWidthReset }) {
  const { t, locale } = useI18n();
  const navRef=useRef(null),dragRef=useRef(null),[collapsePreview,setCollapsePreview]=useState(false);
  const totalCount = counts.all ?? Object.values(counts).reduce((a, b) => a + b, 0);
  const selectable=Boolean(selectionStates&&onToggleSelection);
  const selectionLabel=(key,name)=>t(selectionStates?.[key]==='all'?'batch.unselectCategory':'batch.selectCategory',{name});
  function dropUncategorized(event){if(!manageable||!onDropItems)return;event.preventDefault();onDropItems(event,null);}
  const resize=(value)=>onWidthChange?.(clampCategorySidebarWidth(value));
  const pointerDown=(event)=>{if(collapsed)return;event.preventDefault();event.currentTarget.setPointerCapture?.(event.pointerId);dragRef.current={pointerId:event.pointerId,x:event.clientX,width:navRef.current?.getBoundingClientRect().width||CATEGORY_SIDEBAR_MIN_WIDTH,collapsePreview:false};setCollapsePreview(false);document.body.classList.add('category-sidebar-resizing');};
  const pointerMove=(event)=>{const drag=dragRef.current;if(!drag||drag.pointerId!==event.pointerId)return;const rawWidth=drag.width+event.clientX-drag.x,nextPreview=categorySidebarCollapsePreview(rawWidth,drag.collapsePreview);drag.collapsePreview=nextPreview;setCollapsePreview(nextPreview);if(!nextPreview)resize(rawWidth);};
  const finishPointer=(event,allowCollapse)=>{const drag=dragRef.current;if(drag?.pointerId!==event.pointerId)return;dragRef.current=null;setCollapsePreview(false);document.body.classList.remove('category-sidebar-resizing');event.currentTarget.releasePointerCapture?.(event.pointerId);if(allowCollapse&&drag.collapsePreview)onCollapsedChange?.(true);};
  const pointerUp=(event)=>finishPointer(event,true),pointerCancel=(event)=>finishPointer(event,false);
  const keyResize=(event)=>{const current=navRef.current?.getBoundingClientRect().width||CATEGORY_SIDEBAR_MIN_WIDTH;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();resize(current+(event.key==='ArrowRight'?12:-12));}else if(event.key==='Home'){event.preventDefault();resize(CATEGORY_SIDEBAR_MIN_WIDTH);}else if(event.key==='End'){event.preventDefault();resize(CATEGORY_SIDEBAR_MAX_WIDTH);}};
  const collapseLabel=collapsed?(locale==='en'?'Expand categories':'展开分类栏'):(locale==='en'?'Collapse categories':'收起分类栏');
  return <nav ref={navRef} className={`category-nav ${resizable?'resizable':''} ${collapsed?'collapsed':''} ${collapsePreview?'collapse-preview':''}`} aria-label={t('category.manage')}>
    {resizable&&<button type="button" className="category-nav-resize-toggle" onClick={()=>onCollapsedChange?.(!collapsed)} aria-label={collapseLabel} title={collapseLabel}><Icon name={collapsed?'chevronRight':'chevronLeft'} size={14}/><span>{collapsed?'':locale==='en'?'Collapse':'收起'}</span></button>}
    <div className="category-nav-body" aria-hidden={collapsed||undefined}>
      <button className={active === 'all' ? 'active' : ''} onClick={() => onSelect('all')}>{selectable&&<CategorySelectionBox state={selectionStates.all} label={selectionLabel('all',t('category.all'))} disabled={selectionDisabled||!totalCount} onToggle={()=>onToggleSelection('all')}/>}<span className="cat-icon"><ContentIcon value="icon:grid" size={17} /></span><span className="category-nav-name" title={t('category.all')}>{t('category.all')}</span><span className="count">{totalCount}</span></button>
      <CategoryTree categories={categories} counts={counts} active={active} onSelect={onSelect} manageable={manageable} onCreate={onCreate} onRename={onRename} onDelete={onDelete} onDropItems={onDropItems} selectionStates={selectionStates} onToggleSelection={onToggleSelection} selectionDisabled={selectionDisabled}/>
      <button className={active === 'uncategorized' ? 'active' : ''} onClick={() => onSelect('uncategorized')} onDragOver={event=>{if(manageable){event.preventDefault();event.dataTransfer.dropEffect='move';event.currentTarget.classList.add('drop-target');}}} onDragLeave={event=>event.currentTarget.classList.remove('drop-target')} onDrop={event=>{event.currentTarget.classList.remove('drop-target');dropUncategorized(event);}}>{selectable&&<CategorySelectionBox state={selectionStates.uncategorized} label={selectionLabel('uncategorized',t('category.uncategorized'))} disabled={selectionDisabled||!(counts.uncategorized||0)} onToggle={()=>onToggleSelection('uncategorized')}/>}<span className="cat-icon"><ContentIcon value="📎" size={17} /></span><span className="category-nav-name" title={t('category.uncategorized')}>{t('category.uncategorized')}</span><span className="count">{counts.uncategorized || 0}</span></button>
    </div>
    {collapsePreview&&<div className="category-nav-collapse-hint" role="status"><Icon name="chevronLeft" size={14}/><span>{locale==='en'?'Release to collapse':'松开即可收起'}</span></div>}
    {resizable&&!collapsed&&<div className="category-nav-resizer" role="separator" tabIndex="0" aria-orientation="vertical" aria-label={locale==='en'?'Resize category sidebar':'调整分类栏宽度'} aria-valuemin={CATEGORY_SIDEBAR_MIN_WIDTH} aria-valuemax={CATEGORY_SIDEBAR_MAX_WIDTH} aria-valuenow={Math.round(navRef.current?.getBoundingClientRect().width||CATEGORY_SIDEBAR_MIN_WIDTH)} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerCancel} onKeyDown={keyResize} onDoubleClick={()=>onWidthReset?.()}/>}
  </nav>;
}
