import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/LocaleContext.jsx';
import Icon, { ContentIcon } from './Icon.jsx';
import DropdownMenu from './DropdownMenu.jsx';
import CategorySelectionBox from './CategorySelectionBox.jsx';
import { buildCategoryTree } from '../utils/categoryTree.js';
import VectorIconPicker from './VectorIconPicker.jsx';

const CATEGORY_DRAG_TYPE='application/x-navpilot-category-id';

function categoryDropPosition(event) {
  const box=event.currentTarget.getBoundingClientRect(),ratio=(event.clientY-box.top)/Math.max(box.height,1);
  return ratio<.2?'before':ratio>.8?'after':'inside';
}

function categoryDragPreview(event,node) {
  const preview=document.createElement('div'); preview.className='category-drag-preview';
  const icon=event.currentTarget.closest('.category-tree-row')?.querySelector('.category-tree-select .ui-icon')?.cloneNode(true);
  if(icon)preview.append(icon); const label=document.createElement('strong');label.textContent=node.name;preview.append(label);
  const hint=document.createElement('span');hint.textContent=node.path_label||node.name;preview.append(hint);
  document.body.append(preview);event.dataTransfer.setDragImage?.(preview,20,20);setTimeout(()=>preview.remove(),0);
}

function CategoryIconGrid({ value, onChange }) {
  const { t }=useI18n();
  return <VectorIconPicker value={value} onChange={onChange} label={t('category.icon')}/>;
}

function CategoryCreateDialog({ parent, onCreate, onCancel }) {
  const { t, errorMessage }=useI18n();
  const [name,setName]=useState(''); const [icon,setIcon]=useState('icon:folder'); const [saving,setSaving]=useState(false); const [error,setError]=useState('');
  async function submit(event){event?.preventDefault();if(!name.trim())return;setSaving(true);setError('');try{await onCreate({name:name.trim(),icon,parent_id:parent?.id??null});onCancel();}catch(e){setError(errorMessage(e));}finally{setSaving(false);}}
  useEffect(()=>{const close=event=>event.key==='Escape'&&!saving&&onCancel();window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[onCancel,saving]);
  return <div className="modal-mask category-create-mask" onMouseDown={event=>event.target===event.currentTarget&&!saving&&onCancel()}><div className="modal category-create-modal" role="dialog" aria-modal="true" aria-labelledby="category-create-title">
    <div className="category-create-heading"><span className="category-create-heading-icon"><Icon name="folder" size={20}/></span><div><h3 id="category-create-title">{t('category.createTitle')}</h3><p className="modal-sub">{t(parent?'category.createChildDesc':'category.createRootDesc',parent?{name:parent.name}:undefined)}</p></div><button type="button" className="mini-btn" aria-label={t('common.close')} disabled={saving} onClick={onCancel}><Icon name="close" size={15}/></button></div>
    <form onSubmit={submit}><div className="form-row"><label htmlFor="category-create-name">{t('category.newName')}</label><input id="category-create-name" autoFocus value={name} placeholder={t('category.newPlaceholder')} onChange={event=>setName(event.target.value)}/></div>
      <div className="form-row"><label>{t('category.icon')}</label><CategoryIconGrid value={icon} onChange={setIcon}/></div>
      {error&&<div className="error-text">{error}</div>}<div className="modal-actions"><button type="button" className="icon-btn" disabled={saving} onClick={onCancel}>{t('common.cancel')}</button><button type="submit" className="icon-btn primary" disabled={saving||!name.trim()}><Icon name="plus" size={15}/>{t(saving?'common.saving':'category.createAction')}</button></div>
    </form>
  </div></div>;
}

function CategoryIconPicker({ category, onChange, onCancel }) {
  const { t }=useI18n();
  return <VectorIconPicker value={category.icon||'icon:folder'} onChange={icon=>onChange(category,icon)} label={t('category.icon')} autoOpen hideTrigger onDismiss={onCancel}/>;
}

function InlineRename({ category, onRename, onCancel }) {
  const { t,errorMessage }=useI18n(); const [name,setName]=useState(category.name); const [saving,setSaving]=useState(false); const [error,setError]=useState('');
  async function submit(){if(!name.trim()||name.trim()===category.name){onCancel();return;}setSaving(true);setError('');try{await onRename(category,name.trim());onCancel();}catch(e){setError(errorMessage(e));}finally{setSaving(false);}}
  return <div className="category-inline-create category-inline-rename"><div className="category-inline-fields"><input autoFocus value={name} aria-label={t('category.renameNamed',{name:category.name})} onFocus={event=>event.target.select()} onChange={event=>setName(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();submit();}if(event.key==='Escape')onCancel();}}/><span className="category-inline-actions"><button type="button" disabled={saving||!name.trim()} aria-label={t('common.confirm')} onClick={submit}><Icon name="check" size={15}/></button><button type="button" aria-label={t('common.cancel')} onClick={onCancel}><Icon name="close" size={15}/></button></span></div>{error&&<div className="error-text">{error}</div>}</div>;
}

function Node({ node, depth, active, expanded, setExpanded, counts, manageable, creating, setCreating, editing, setEditing, setIconEditing, onAccess, onSelect, onCreate, onRename, onDelete, onDropItems, onMoveCategory, draggingCategory, setDraggingCategory, selectionStates, onToggleSelection, selectionDisabled }) {
  const { t }=useI18n(); const expandTimer=useRef(null); const [itemDragOver,setItemDragOver]=useState(false); const hasChildren=node.children.length>0; const open=expanded.has(node.id);
  const selectable=Boolean(selectionStates&&onToggleSelection),selectionState=selectionStates?.[node.id]||'none';
  const draggedNode=draggingCategory?.node,dropPosition=draggingCategory?.targetId===node.id?draggingCategory.position:null;
  const destinationParent=dropPosition==='inside'?node.id:(node.parent_id??null),destinationDepth=dropPosition==='inside'?node.depth+1:node.depth;
  const cycleDrop=Boolean(draggedNode&&dropPosition&&(draggedNode.id===node.id||destinationParent===draggedNode.id||draggingCategory.descendants.has(destinationParent))),depthDrop=Boolean(draggedNode&&dropPosition&&destinationDepth+draggingCategory.height-1>3),invalidCategoryDrop=cycleDrop||depthDrop;
  const dropLabel=invalidCategoryDrop?(cycleDrop?t('category.dropCycle'):t('category.dropTooDeep')):dropPosition==='inside'?t('category.dropInside',{name:node.name}):dropPosition==='before'?t('category.dropBefore',{name:node.name}):dropPosition==='after'?t('category.dropAfter',{name:node.name}):'';
  const toggle=()=>setExpanded(current=>{const next=new Set(current);if(next.has(node.id))next.delete(node.id);else next.add(node.id);return next;});
  return <div className="category-tree-node" role="treeitem" aria-level={depth} aria-expanded={hasChildren?open:undefined} aria-selected={active===node.id}>
    <div className={`category-tree-row ${dropPosition?`category-drop-${dropPosition}`:''} ${itemDragOver?'drop-target':''} ${invalidCategoryDrop?'drop-invalid':''} ${draggedNode?.id===node.id?'drag-source':''}`} data-drop-label={dropLabel} style={{'--tree-depth':depth-1}} onDragOver={event=>{if(!manageable)return;event.preventDefault();event.stopPropagation();const categoryId=draggedNode?.id||Number(event.dataTransfer.getData(CATEGORY_DRAG_TYPE));if(categoryId){setItemDragOver(false);const position=categoryDropPosition(event);setDraggingCategory(categoryId,{targetId:node.id,position});event.dataTransfer.dropEffect=invalidCategoryDrop?'none':'move';if(position==='inside'&&hasChildren&&!open&&!expandTimer.current)expandTimer.current=setTimeout(()=>{setExpanded(current=>new Set(current).add(node.id));expandTimer.current=null;},520);else if(position!=='inside'&&expandTimer.current){clearTimeout(expandTimer.current);expandTimer.current=null;}return;}event.dataTransfer.dropEffect='move';setItemDragOver(true);}} onDragLeave={event=>{if(expandTimer.current){clearTimeout(expandTimer.current);expandTimer.current=null;}if(!event.currentTarget.contains(event.relatedTarget))setItemDragOver(false);}} onDrop={event=>{if(!manageable)return;event.preventDefault();event.stopPropagation();setItemDragOver(false);if(expandTimer.current){clearTimeout(expandTimer.current);expandTimer.current=null;}const categoryId=draggedNode?.id||Number(event.dataTransfer.getData(CATEGORY_DRAG_TYPE));if(categoryId){if(!invalidCategoryDrop&&dropPosition)onMoveCategory?.(categoryId,node.id,dropPosition);setDraggingCategory(null);return;}onDropItems?.(event,node.id);}}>
      {manageable&&<span className="category-drag-handle" draggable="true" role="button" tabIndex="0" aria-label={t('category.dragNamed',{name:node.name})} title={t('category.dragHint')} onDragStart={event=>{event.stopPropagation();event.dataTransfer.effectAllowed='move';event.dataTransfer.setData(CATEGORY_DRAG_TYPE,String(node.id));event.dataTransfer.setData('text/plain',node.name);categoryDragPreview(event,node);document.body.classList.add('category-is-dragging');setDraggingCategory(node.id);}} onDragEnd={()=>{document.body.classList.remove('category-is-dragging');setDraggingCategory(null);}}><Icon name="grip" size={14}/></span>}
      {hasChildren?<button className="category-tree-disclosure" onClick={toggle} aria-label={t(open?'category.collapse':'category.expand',{name:node.name})}><Icon name={open?'chevronDown':'chevronRight'} size={14}/></button>:<span className="category-tree-spacer"/>}
      <button className={`category-tree-select ${active===node.id?'active':''}`} aria-label={`${node.name} ${counts[node.id]||0}`} onClick={()=>onSelect(node.id)}>{selectable&&<CategorySelectionBox state={selectionState} label={t(selectionState==='all'?'batch.unselectCategory':'batch.selectCategory',{name:node.name})} disabled={selectionDisabled||!(counts[node.id]||0)} onToggle={()=>onToggleSelection(node.id)}/>}<ContentIcon value={node.icon} size={16}/><span className="category-tree-name" title={node.name}>{node.name}</span><span className="count">{counts[node.id]||0}</span></button>
      {manageable&&<><div className="category-tree-actions category-tree-actions-desktop">{depth<3&&<button aria-label={t('category.addChild',{name:node.name})} title={t('category.addChild',{name:node.name})} onClick={()=>{setExpanded(current=>new Set(current).add(node.id));setCreating(node.id);setEditing(undefined);}}><Icon name="plus" size={14}/></button>}{onAccess&&<button aria-label={`设置分类“${node.name}”权限`} title="默认权限" onClick={()=>onAccess(node)}><Icon name="shield" size={14}/></button>}<button aria-label={t('category.changeIconNamed',{name:node.name})} title={t('category.changeIconNamed',{name:node.name})} onClick={()=>setIconEditing(node.id)}><Icon name="palette" size={14}/></button><button aria-label={t('category.renameNamed',{name:node.name})} title={t('category.renameNamed',{name:node.name})} onClick={()=>{setEditing(node.id);setCreating(undefined);}}><Icon name="edit" size={14}/></button><button className="danger" aria-label={t('category.deleteNamed',{name:node.name})} title={t('category.deleteNamed',{name:node.name})} onClick={()=>onDelete(node)}><Icon name="minus" size={14}/></button></div><DropdownMenu className="category-tree-actions-mobile" menuClassName="category-tree-mobile-menu" trigger={<button className="category-more-trigger" aria-label={t('common.moreActions')} title={t('common.moreActions')}><Icon name="more" size={17}/></button>}>{depth<3&&<button role="menuitem" onClick={()=>{setExpanded(current=>new Set(current).add(node.id));setCreating(node.id);setEditing(undefined);}}><Icon name="plus" size={15}/>{t('category.addChild',{name:node.name})}</button>}{onAccess&&<button role="menuitem" onClick={()=>onAccess(node)}><Icon name="shield" size={15}/>默认权限</button>}<button role="menuitem" onClick={()=>setIconEditing(node.id)}><Icon name="palette" size={15}/>{t('category.changeIcon')}</button><button role="menuitem" onClick={()=>{setEditing(node.id);setCreating(undefined);}}><Icon name="edit" size={15}/>{t('category.rename')}</button><button role="menuitem" className="danger" onClick={()=>onDelete(node)}><Icon name="minus" size={15}/>{t('category.deleteNamed',{name:node.name})}</button></DropdownMenu></>}
    </div>
    {manageable&&editing===node.id&&<div className="category-tree-child-editor" style={{'--tree-depth':depth}}><InlineRename category={node} onRename={onRename} onCancel={()=>setEditing(undefined)}/></div>}
    {hasChildren&&open&&<div role="group">{node.children.map(child=><Node key={child.id} node={child} depth={depth+1} active={active} expanded={expanded} setExpanded={setExpanded} counts={counts} manageable={manageable} creating={creating} setCreating={setCreating} editing={editing} setEditing={setEditing} setIconEditing={setIconEditing} onAccess={onAccess} onSelect={onSelect} onCreate={onCreate} onRename={onRename} onDelete={onDelete} onDropItems={onDropItems} onMoveCategory={onMoveCategory} draggingCategory={draggingCategory} setDraggingCategory={setDraggingCategory} selectionStates={selectionStates} onToggleSelection={onToggleSelection} selectionDisabled={selectionDisabled}/>)}</div>}
  </div>;
}

export default function CategoryTree({ categories, counts, active, onSelect, manageable=false, onCreate, onRename, onChangeIcon, onAccess, onDelete, onDropItems, onMoveCategory, selectionStates, onToggleSelection, selectionDisabled=false }) {
  const { t }=useI18n(); const { roots }=useMemo(()=>buildCategoryTree(categories),[categories]);
  const [expanded,setExpanded]=useState(()=>new Set(categories.filter(category=>category.parent_id==null).map(category=>category.id))); const [creating,setCreating]=useState(undefined); const [editing,setEditing]=useState(undefined); const [iconEditing,setIconEditing]=useState(undefined); const [dragState,setDragState]=useState(null);
  useEffect(()=>{if(!manageable){setCreating(undefined);setEditing(undefined);}},[manageable]);
  useEffect(()=>{if(active==='all'||active==='uncategorized')return;const byId=new Map(categories.map(category=>[category.id,category]));setExpanded(current=>{const next=new Set(current);let node=byId.get(active);while(node?.parent_id!=null){next.add(node.parent_id);node=byId.get(node.parent_id);}return next;});},[active,categories]);
  const createParent=creating==null?null:categories.find(category=>category.id===creating);
  const iconCategory=categories.find(category=>category.id===iconEditing);
  const setDraggingCategory=(id,target)=>setDragState(current=>id==null?null:{id,...(target||{}),targetId:target?.targetId??current?.targetId,position:target?.position??current?.position});
  const draggingCategory=useMemo(()=>{if(!dragState?.id)return null;const node=categories.find(category=>category.id===dragState.id);if(!node)return null;const descendants=new Set(),queue=[dragState.id];while(queue.length){const id=queue.pop();categories.filter(category=>category.parent_id===id).forEach(category=>{descendants.add(category.id);queue.push(category.id);});}const branch=categories.filter(category=>category.id===dragState.id||descendants.has(category.id));const height=Math.max(...branch.map(category=>(category.depth||1)-(node.depth||1)+1),1);return{...dragState,node,descendants,height};},[categories,dragState]);
  const moveCategory=(categoryId,targetId,position)=>{const target=categories.find(category=>category.id===targetId);if(!target)return;const parentId=position==='inside'?target.id:(target.parent_id??null),siblings=categories.filter(category=>(category.parent_id??null)===parentId&&category.id!==categoryId).sort((a,b)=>a.sort_order-b.sort_order||a.id-b.id);let index=siblings.length;if(position!=='inside'){const targetIndex=siblings.findIndex(category=>category.id===target.id);index=Math.max(0,targetIndex+(position==='after'?1:0));}onMoveCategory?.(categoryId,parentId,index);if(position==='inside')setExpanded(current=>new Set(current).add(target.id));};
  return <><div className="category-tree" role="tree" aria-label={t('category.manage')}>
    {manageable&&<div className="category-root-create"><button className="category-add-trigger" onClick={()=>{setCreating(null);setEditing(undefined);}}><span><Icon name="plus" size={15}/></span>{t('category.addRoot')}</button></div>}
    {roots.map(node=><Node key={node.id} node={node} depth={1} active={active} expanded={expanded} setExpanded={setExpanded} counts={counts} manageable={manageable} creating={creating} setCreating={setCreating} editing={editing} setEditing={setEditing} setIconEditing={setIconEditing} onAccess={onAccess} onSelect={onSelect} onCreate={onCreate} onRename={onRename} onDelete={onDelete} onDropItems={onDropItems} onMoveCategory={moveCategory} draggingCategory={draggingCategory} setDraggingCategory={setDraggingCategory} selectionStates={selectionStates} onToggleSelection={onToggleSelection} selectionDisabled={selectionDisabled}/>) }
    {manageable&&draggingCategory&&<div className="category-root-drop" onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect='move';}} onDrop={event=>{event.preventDefault();const id=draggingCategory.node.id||Number(event.dataTransfer.getData(CATEGORY_DRAG_TYPE));const rootSiblings=categories.filter(category=>category.parent_id==null&&category.id!==id);if(id)onMoveCategory?.(id,null,rootSiblings.length);setDraggingCategory(null);}}><Icon name="move" size={15}/><span>{t('category.moveToRoot')}</span></div>}
  </div>{manageable&&creating!==undefined&&createPortal(<CategoryCreateDialog parent={createParent} onCreate={onCreate} onCancel={()=>setCreating(undefined)}/>,document.body)}{manageable&&iconCategory&&<CategoryIconPicker category={iconCategory} onChange={onChangeIcon} onCancel={()=>setIconEditing(undefined)}/>}</>;
}
