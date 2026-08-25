import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { useI18n } from '../i18n/LocaleContext.jsx';

const EMPTY = { visibility:'public', grants:[] };

function localDateTime(value) {
  if (!value) return '';
  const date = new Date(value - new Date(value).getTimezoneOffset() * 60000);
  return date.toISOString().slice(0,16);
}

export function AccessEditor({ value = EMPTY, onChange, allowInherit = false, presentation = 'compact' }) {
  const { locale } = useI18n(), zh = locale !== 'en';
  const [query,setQuery]=useState(''),[principals,setPrincipals]=useState([]),[loading,setLoading]=useState(false);
  const visibility=value.inherit?'inherit':value.visibility||'public';
  useEffect(()=>{if(visibility!=='restricted')return;let active=true;setLoading(true);const timer=setTimeout(()=>api.searchAccessPrincipals(query).then(result=>{if(active)setPrincipals(result.principals||[]);}).catch(()=>{if(active)setPrincipals([]);}).finally(()=>{if(active)setLoading(false);}),180);return()=>{active=false;clearTimeout(timer);};},[query,visibility]);
  const selected=new Set((value.grants||[]).map(grant=>`${grant.type}:${grant.id}`));
  const noEffectiveGrant=visibility==='restricted'&&(value.grants||[]).length>0&&(value.grants||[]).every(grant=>grant.expiresAtMs&&grant.expiresAtMs<=Date.now());
  const available=principals.filter(principal=>!selected.has(`${principal.type}:${principal.id}`));
  function setVisibility(next){onChange(next==='inherit'?{inherit:true,visibility:'public',grants:[]}:{inherit:false,visibility:next,grants:next==='restricted'?(value.grants||[]):[]});}
  function add(key){const principal=principals.find(item=>`${item.type}:${item.id}`===key);if(principal)onChange({...value,inherit:false,visibility:'restricted',grants:[...(value.grants||[]),{type:principal.type,id:principal.id,displayName:principal.displayName||principal.name||principal.username,username:principal.username,expiresAtMs:null}]});}
  function updateGrant(index,patch){onChange({...value,grants:(value.grants||[]).map((grant,i)=>i===index?{...grant,...patch}:grant)});}
  function remove(index){onChange({...value,grants:(value.grants||[]).filter((_,i)=>i!==index)});}
  const permissionOptions=[['public','globe',zh?'完全公开':'Public',zh?'任何人都可以查看，包括未登录访客。适合公司官网、公开工具和通用资源。':'Visible to everyone, including signed-out visitors. Best for public sites and shared tools.'],['authenticated','user',zh?'登录可见':'Signed-in',zh?'所有有效账户登录后均可查看，不需要逐个添加授权对象。':'Available to every active account after sign-in, without assigning individual access.'],['restricted','lock',zh?'指定范围':'Restricted',zh?'仅选定用户或授权组成员可以查看，可为每项授权设置有效期。':'Only selected users and access-group members can view it; each grant can expire.']];
  const inheritOption=['inherit','layers',zh?'继承上级分类':'Inherit parent',zh?'不单独设置，继续使用最近上级分类的默认权限。':'Use the nearest parent category policy instead of defining one here.'];
  const options=allowInherit&&presentation!=='cards'?[inheritOption,...permissionOptions]:permissionOptions;
  const activeOption=options.find(([key])=>key===visibility)||options[0];
  return <div className={`access-editor ${presentation==='cards'?'access-editor-cards':''}`}>
    {allowInherit&&presentation==='cards'&&<button type="button" className={`access-inherit-option ${visibility==='inherit'?'active':''}`} aria-pressed={visibility==='inherit'} onClick={()=>setVisibility('inherit')}><span><Icon name="layers" size={15}/></span><span><strong>{inheritOption[2]}</strong><small>{inheritOption[3]}</small></span><Icon name={visibility==='inherit'?'check':'chevronRight'} size={15}/></button>}
    <div className="access-visibility-shell"><div className={`access-visibility-options ${presentation==='cards'?'card-options':''}`} role="radiogroup" aria-label={zh?'可见范围':'Visibility'}>{options.map(([key,icon,label,description])=><button key={key} type="button" role="radio" aria-checked={visibility===key} className={visibility===key?'active':''} onClick={()=>setVisibility(key)}><span className="access-option-icon"><Icon name={icon} size={presentation==='cards'?19:15}/></span><span className="access-option-copy"><strong>{label}</strong>{presentation==='cards'&&<small>{description}</small>}</span>{presentation==='cards'&&<span className="access-option-check"><Icon name={visibility===key?'check':'chevronRight'} size={14}/></span>}</button>)}</div>{presentation!=='cards'&&<p className="access-visibility-help"><Icon name={activeOption[1]} size={13}/><span>{activeOption[3]}</span></p>}</div>
    {visibility==='restricted'&&<div className="access-grants">
      <div className="access-section-heading"><span><strong>{zh?'授权对象':'Who can access'}</strong><small>{zh?'搜索后添加用户或授权组':'Search and add users or access groups'}</small></span><em>{zh?`${(value.grants||[]).length} 项授权`:`${(value.grants||[]).length} grants`}</em></div>
      <div className="access-principal-search"><input className="access-input" value={query} onChange={event=>setQuery(event.target.value)} placeholder={zh?'搜索用户或授权组…':'Search users or groups…'}/><select className="access-input" value="" onChange={event=>add(event.target.value)} disabled={loading||!available.length}><option value="">{loading?(zh?'加载中…':'Loading…'):(zh?'选择并添加':'Select and add')}</option>{available.map(item=><option key={`${item.type}:${item.id}`} value={`${item.type}:${item.id}`}>{item.type==='group'?(zh?'授权组 · ':'Group · '):(zh?'用户 · ':'User · ')}{item.displayName}{item.username?` (${item.username})`:''}</option>)}</select></div>
      <div className="access-grant-list">{!(value.grants||[]).length&&<p className="hint">{zh?'至少添加一个当前有效的用户或授权组。':'Add at least one currently valid user or group.'}</p>}{(value.grants||[]).map((grant,index)=><div className="access-grant-row" key={`${grant.type}:${grant.id}`}><span className={`access-principal-type ${grant.type}`}><Icon name={grant.type==='group'?'users':'user'} size={14}/></span><strong>{grant.displayName||grant.username||grant.id}</strong><select value={grant.expiresAtMs?'custom':'permanent'} onChange={event=>{const preset=event.target.value;updateGrant(index,{expiresAtMs:preset==='permanent'?null:Date.now()+Number(preset)*86400000});}}><option value="permanent">{zh?'永久':'Permanent'}</option><option value="7">{zh?'7 天':'7 days'}</option><option value="30">{zh?'30 天':'30 days'}</option><option value="custom">{zh?'自定义':'Custom'}</option></select>{grant.expiresAtMs&&<input type="datetime-local" value={localDateTime(grant.expiresAtMs)} onChange={event=>updateGrant(index,{expiresAtMs:event.target.value?new Date(event.target.value).getTime():null})}/>}<button type="button" className="mini-btn danger" onClick={()=>remove(index)} aria-label={zh?'移除授权':'Remove grant'}><Icon name="close" size={14}/></button></div>)}</div>
      {noEffectiveGrant&&<div className="error-text">{zh?'所有授权均已到期；当前资源将仅管理员可见。':'All grants have expired; this resource is visible only to administrators.'}</div>}
    </div>}
  </div>;
}

export function BulkAccessDialog({ ids, onClose, onSaved }) {
  const { locale,errorMessage }=useI18n(),zh=locale!=='en';
  const [value,setValue]=useState(EMPTY),[saving,setSaving]=useState(false),[error,setError]=useState('');
  async function save(){setSaving(true);setError('');try{await api.bulkUpdateAccess('public',ids,value);await onSaved?.();onClose();}catch(e){setError(errorMessage(e));}finally{setSaving(false);}}
  return <div className="modal-mask" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><div className="modal access-modal"><h3>{zh?'批量设置资源权限':'Bulk resource access'}</h3><p className="modal-sub">{zh?`将同一权限覆盖到已选择的 ${ids.length} 个资源。`:`Apply the same access policy to ${ids.length} selected resources.`}</p><AccessEditor value={value} onChange={setValue}/>{error&&<div className="error-text">{error}</div>}<div className="modal-actions"><button className="icon-btn" onClick={onClose}>{zh?'取消':'Cancel'}</button><button className="icon-btn primary" disabled={saving||value.visibility==='restricted'&&!value.grants.length} onClick={save}>{saving?(zh?'保存中…':'Saving…'):(zh?'应用权限':'Apply access')}</button></div></div></div>;
}

export function CategoryAccessDialog({ category, onClose, onSaved }) {
  const { locale,errorMessage }=useI18n(),zh=locale!=='en';
  const [value,setValue]=useState(null),[includeDescendants,setIncludeDescendants]=useState(false),[applyDefaults,setApplyDefaults]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
  useEffect(()=>{api.getCategoryAccess(category.id).then(result=>setValue({...result,inherit:!result.explicit})).catch(e=>setError(errorMessage(e)));},[category.id,errorMessage]);
  async function save(apply){if(!value)return;setSaving(true);setError('');try{const saved=await api.updateCategoryAccess(category.id,{...value,expectedVersion:value.categoryVersion});if(apply){const options={includeDescendants,applyCategoryDefaults:applyDefaults};const impact=await api.previewCategoryAccess(category.id,options);const message=zh?`将覆盖 ${impact.itemCount} 个资源${applyDefaults?`和 ${impact.categoryCount} 个分类模板`:''}，确认继续？`:`This will overwrite ${impact.itemCount} resources${applyDefaults?` and ${impact.categoryCount} category templates`:''}. Continue?`;if(!window.confirm(message)){setValue(saved);return;}await api.applyCategoryAccess(category.id,options);}await onSaved?.();onClose();}catch(e){setError(errorMessage(e));}finally{setSaving(false);}}
  return <div className="modal-mask" onMouseDown={event=>event.target===event.currentTarget&&!saving&&onClose()}><div className="modal access-modal category-access-modal"><h3>{zh?`“${category.name}”默认权限`:`Default access for “${category.name}”`}</h3><p className="modal-sub">{value?.inherited&&value?.sourceCategoryId?(zh?`当前继承自分类 #${value.sourceCategoryId}`:`Currently inherited from category #${value.sourceCategoryId}`):(zh?'此设置用于之后创建的新资源。':'This policy is used for newly created resources.')}</p>{value?<AccessEditor value={value} onChange={setValue} allowInherit presentation="cards"/>:<div className="hint">{zh?'加载中…':'Loading…'}</div>}<div className="access-apply-options"><label><input type="checkbox" checked={includeDescendants} onChange={e=>setIncludeDescendants(e.target.checked)}/>{zh?'包含下级分类资源':'Include descendant resources'}</label><label><input type="checkbox" checked={applyDefaults} disabled={!includeDescendants} onChange={e=>setApplyDefaults(e.target.checked)}/>{zh?'同时覆盖下级分类默认模板':'Also overwrite descendant defaults'}</label></div>{error&&<div className="error-text">{error}</div>}<div className="modal-actions"><button className="icon-btn" onClick={onClose}>{zh?'取消':'Cancel'}</button><button className="icon-btn" disabled={!value||saving} onClick={()=>save(false)}>{zh?'仅保存默认值':'Save default only'}</button><button className="icon-btn primary" disabled={!value||saving||value.visibility==='restricted'&&!value.grants.length} onClick={()=>save(true)}>{zh?'保存并应用':'Save and apply'}</button></div></div></div>;
}
