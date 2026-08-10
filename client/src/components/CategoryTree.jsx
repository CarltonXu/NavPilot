import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/LocaleContext.jsx';
import Icon, { ContentIcon } from './Icon.jsx';
import DropdownMenu from './DropdownMenu.jsx';
import CategorySelectionBox from './CategorySelectionBox.jsx';
import { buildCategoryTree } from '../utils/categoryTree.js';

const ICONS=['icon:folder','icon:code','icon:docs','icon:tools','icon:globe','📁','🧭','📚','💻','🛠️'];

function CategoryCreateDialog({ parent, onCreate, onCancel }) {
  const { t, errorMessage }=useI18n();
  const [name,setName]=useState(''); const [icon,setIcon]=useState('icon:folder'); const [saving,setSaving]=useState(false); const [error,setError]=useState('');
  async function submit(event){event?.preventDefault();if(!name.trim())return;setSaving(true);setError('');try{await onCreate({name:name.trim(),icon,parent_id:parent?.id??null});onCancel();}catch(e){setError(errorMessage(e));}finally{setSaving(false);}}
  useEffect(()=>{const close=event=>event.key==='Escape'&&!saving&&onCancel();window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[onCancel,saving]);
  return <div className="modal-mask category-create-mask" onMouseDown={event=>event.target===event.currentTarget&&!saving&&onCancel()}><div className="modal category-create-modal" role="dialog" aria-modal="true" aria-labelledby="category-create-title">
    <div className="category-create-heading"><span className="category-create-heading-icon"><Icon name="folder" size={20}/></span><div><h3 id="category-create-title">{t('category.createTitle')}</h3><p className="modal-sub">{t(parent?'category.createChildDesc':'category.createRootDesc',parent?{name:parent.name}:undefined)}</p></div><button type="button" className="mini-btn" aria-label={t('common.close')} disabled={saving} onClick={onCancel}><Icon name="close" size={15}/></button></div>
    <form onSubmit={submit}><div className="form-row"><label htmlFor="category-create-name">{t('category.newName')}</label><input id="category-create-name" autoFocus value={name} placeholder={t('category.newPlaceholder')} onChange={event=>setName(event.target.value)}/></div>
      <div className="form-row"><label>{t('category.icon')}</label><div className="category-create-icons">{ICONS.map(value=><button key={value} type="button" className={icon===value?'active':''} aria-pressed={icon===value} aria-label={`${t('category.icon')} ${value}`} onClick={()=>setIcon(value)}><ContentIcon value={value} size={19}/></button>)}</div></div>
      {error&&<div className="error-text">{error}</div>}<div className="modal-actions"><button type="button" className="icon-btn" disabled={saving} onClick={onCancel}>{t('common.cancel')}</button><button type="submit" className="icon-btn primary" disabled={saving||!name.trim()}><Icon name="plus" size={15}/>{t(saving?'common.saving':'category.createAction')}</button></div>
    </form>
  </div></div>;
}

function InlineRename({ category, onRename, onCancel }) {
  const { t,errorMessage }=useI18n(); const [name,setName]=useState(category.name); const [saving,setSaving]=useState(false); const [error,setError]=useState('');
  async function submit(){if(!name.trim()||name.trim()===category.name){onCancel();return;}setSaving(true);setError('');try{await onRename(category,name.trim());onCancel();}catch(e){setError(errorMessage(e));}finally{setSaving(false);}}
  return <div className="category-inline-create category-inline-rename"><div className="category-inline-fields"><input autoFocus value={name} aria-label={t('category.renameNamed',{name:category.name})} onFocus={event=>event.target.select()} onChange={event=>setName(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();submit();}if(event.key==='Escape')onCancel();}}/><span className="category-inline-actions"><button type="button" disabled={saving||!name.trim()} aria-label={t('common.confirm')} onClick={submit}><Icon name="check" size={15}/></button><button type="button" aria-label={t('common.cancel')} onClick={onCancel}><Icon name="close" size={15}/></button></span></div>{error&&<div className="error-text">{error}</div>}</div>;
}

function Node({ node, depth, active, expanded, setExpanded, counts, manageable, creating, setCreating, editing, setEditing, onSelect, onCreate, onRename, onDelete, onDropItems, selectionStates, onToggleSelection, selectionDisabled }) {
  const { t }=useI18n(); const [dragOver,setDragOver]=useState(false); const hasChildren=node.children.length>0; const open=expanded.has(node.id);
  const selectable=Boolean(selectionStates&&onToggleSelection),selectionState=selectionStates?.[node.id]||'none';
  const toggle=()=>setExpanded(current=>{const next=new Set(current);if(next.has(node.id))next.delete(node.id);else next.add(node.id);return next;});
  return <div className="category-tree-node" role="treeitem" aria-level={depth} aria-expanded={hasChildren?open:undefined} aria-selected={active===node.id}>
    <div className={`category-tree-row ${dragOver?'drop-target':''}`} style={{'--tree-depth':depth-1}} onDragOver={event=>{if(manageable&&onDropItems){event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';setDragOver(true);}}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget))setDragOver(false);}} onDrop={event=>{if(!manageable||!onDropItems)return;event.preventDefault();event.stopPropagation();setDragOver(false);onDropItems(event,node.id);}}>
      {hasChildren?<button className="category-tree-disclosure" onClick={toggle} aria-label={t(open?'category.collapse':'category.expand',{name:node.name})}><Icon name={open?'chevronDown':'chevronRight'} size={14}/></button>:<span className="category-tree-spacer"/>}
      <button className={`category-tree-select ${active===node.id?'active':''}`} aria-label={`${node.name} ${counts[node.id]||0}`} onClick={()=>onSelect(node.id)}>{selectable&&<CategorySelectionBox state={selectionState} label={t(selectionState==='all'?'batch.unselectCategory':'batch.selectCategory',{name:node.name})} disabled={selectionDisabled||!(counts[node.id]||0)} onToggle={()=>onToggleSelection(node.id)}/>}<ContentIcon value={node.icon} size={16}/><span className="category-tree-name" title={node.name}>{node.name}</span><span className="count">{counts[node.id]||0}</span></button>
      {manageable&&<><div className="category-tree-actions category-tree-actions-desktop">{depth<3&&<button aria-label={t('category.addChild',{name:node.name})} title={t('category.addChild',{name:node.name})} onClick={()=>{setExpanded(current=>new Set(current).add(node.id));setCreating(node.id);setEditing(undefined);}}><Icon name="plus" size={14}/></button>}<button aria-label={t('category.renameNamed',{name:node.name})} title={t('category.renameNamed',{name:node.name})} onClick={()=>{setEditing(node.id);setCreating(undefined);}}><Icon name="edit" size={14}/></button><button className="danger" aria-label={t('category.deleteNamed',{name:node.name})} title={t('category.deleteNamed',{name:node.name})} onClick={()=>onDelete(node)}><Icon name="minus" size={14}/></button></div><DropdownMenu className="category-tree-actions-mobile" menuClassName="category-tree-mobile-menu" trigger={<button className="category-more-trigger" aria-label={t('common.moreActions')} title={t('common.moreActions')}><Icon name="more" size={17}/></button>}>{depth<3&&<button role="menuitem" onClick={()=>{setExpanded(current=>new Set(current).add(node.id));setCreating(node.id);setEditing(undefined);}}><Icon name="plus" size={15}/>{t('category.addChild',{name:node.name})}</button>}<button role="menuitem" onClick={()=>{setEditing(node.id);setCreating(undefined);}}><Icon name="edit" size={15}/>{t('category.rename')}</button><button role="menuitem" className="danger" onClick={()=>onDelete(node)}><Icon name="minus" size={15}/>{t('category.deleteNamed',{name:node.name})}</button></DropdownMenu></>}
    </div>
    {manageable&&editing===node.id&&<div className="category-tree-child-editor" style={{'--tree-depth':depth}}><InlineRename category={node} onRename={onRename} onCancel={()=>setEditing(undefined)}/></div>}
    {hasChildren&&open&&<div role="group">{node.children.map(child=><Node key={child.id} node={child} depth={depth+1} active={active} expanded={expanded} setExpanded={setExpanded} counts={counts} manageable={manageable} creating={creating} setCreating={setCreating} editing={editing} setEditing={setEditing} onSelect={onSelect} onCreate={onCreate} onRename={onRename} onDelete={onDelete} onDropItems={onDropItems} selectionStates={selectionStates} onToggleSelection={onToggleSelection} selectionDisabled={selectionDisabled}/>)}</div>}
  </div>;
}

export default function CategoryTree({ categories, counts, active, onSelect, manageable=false, onCreate, onRename, onDelete, onDropItems, selectionStates, onToggleSelection, selectionDisabled=false }) {
  const { t }=useI18n(); const { roots }=useMemo(()=>buildCategoryTree(categories),[categories]);
  const [expanded,setExpanded]=useState(()=>new Set(categories.filter(category=>category.parent_id==null).map(category=>category.id))); const [creating,setCreating]=useState(undefined); const [editing,setEditing]=useState(undefined);
  useEffect(()=>{if(!manageable){setCreating(undefined);setEditing(undefined);}},[manageable]);
  useEffect(()=>{if(active==='all'||active==='uncategorized')return;const byId=new Map(categories.map(category=>[category.id,category]));setExpanded(current=>{const next=new Set(current);let node=byId.get(active);while(node?.parent_id!=null){next.add(node.parent_id);node=byId.get(node.parent_id);}return next;});},[active,categories]);
  const createParent=creating==null?null:categories.find(category=>category.id===creating);
  return <><div className="category-tree" role="tree" aria-label={t('category.manage')}>
    {manageable&&<div className="category-root-create"><button className="category-add-trigger" onClick={()=>{setCreating(null);setEditing(undefined);}}><span><Icon name="plus" size={15}/></span>{t('category.addRoot')}</button></div>}
    {roots.map(node=><Node key={node.id} node={node} depth={1} active={active} expanded={expanded} setExpanded={setExpanded} counts={counts} manageable={manageable} creating={creating} setCreating={setCreating} editing={editing} setEditing={setEditing} onSelect={onSelect} onCreate={onCreate} onRename={onRename} onDelete={onDelete} onDropItems={onDropItems} selectionStates={selectionStates} onToggleSelection={onToggleSelection} selectionDisabled={selectionDisabled}/>) }
  </div>{manageable&&creating!==undefined&&createPortal(<CategoryCreateDialog parent={createParent} onCreate={onCreate} onCancel={()=>setCreating(undefined)}/>,document.body)}</>;
}
