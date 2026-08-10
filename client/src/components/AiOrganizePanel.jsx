import React,{useEffect,useRef,useState}from'react';
import{api}from'../api.js';
import{useI18n}from'../i18n/LocaleContext.jsx';
import Icon from'./Icon.jsx';
import AiCommandPanel from'./AiCommandPanel.jsx';

const copy={
  'zh-CN':{title:'AI 智能整理中心',desc:'扫描重复、未分类、信息缺失、无标签和失效资源，确认后再执行修改。',scan:'开始智能扫描',index:'更新语义索引',content:'理解授权网页',report:'生成整理报告',working:'后台任务执行中',empty:'尚未执行扫描',plan:'生成 AI 整理方案',reports:'最近整理报告',noReports:'暂无整理报告',failed:'任务执行失败',done:'任务已完成'},
  en:{title:'AI organization center',desc:'Find duplicates, uncategorized, incomplete, untagged, and unavailable resources. Changes still require approval.',scan:'Scan resources',index:'Update semantic index',content:'Analyze allowed pages',report:'Create report',working:'Background task running',empty:'No scan has been run',plan:'Generate organization plan',reports:'Recent reports',noReports:'No reports yet',failed:'Task failed',done:'Task completed'},
};
export default function AiOrganizePanel({initialScope='personal',isAdmin=false,personalEnabled=false,onResourcesChanged}){
  const{locale,errorMessage}=useI18n(),c=copy[locale]||copy['zh-CN'];
  const[scope,setScope]=useState(isAdmin&&initialScope==='public'?'public':'personal'),[job,setJob]=useState(null),[result,setResult]=useState(null),[error,setError]=useState(''),[reports,setReports]=useState([]),[planVersion,setPlanVersion]=useState(0);const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;api.listAiReports().then(setReports).catch(()=>{});return()=>{mounted.current=false;};},[]);
  async function watch(id){for(let attempt=0;attempt<600&&mounted.current;attempt+=1){const value=await api.getAiJob(id);if(!mounted.current)return;setJob(value);if(value.status==='succeeded'){setResult(value.result);if(value.kind==='report'){api.listAiReports().then(setReports).catch(()=>{});window.dispatchEvent(new Event('navpilot:notifications-updated'));}return;}if(value.status==='failed'){setError(value.error?.message||c.failed);return;}await new Promise(resolve=>setTimeout(resolve,700));}}
  async function start(kind){setError('');setResult(null);try{const value=kind==='organize'?await api.startAiOrganize(scope):kind==='embedding_index'?await api.startEmbeddingIndex(scope):kind==='content'?await api.startContentAnalysis(scope):await api.startAiReport(scope);setJob(value);await watch(value.id);}catch(e){setError(errorMessage(e));}}
  const findings=result?.findings||[],prompt=locale==='en'?`Review the current ${scope} space using these scan findings and create a safe cleanup plan. Prefer adding useful tags, categorizing uncategorized resources, and flagging duplicates without deleting anything unless I explicitly approve: ${findings.map(x=>x.title).join('; ')}`:`请根据当前${scope==='public'?'公共':'个人'}空间的扫描结果生成安全的整理计划。优先补充有用标签、整理未分类资源；重复资源先给出建议，除非我明确授权否则不要删除：${findings.map(x=>x.title).join('；')}`;
  return <div className="ai-organize-panel">
    <div className="organize-heading"><span><Icon name="assistant" size={18}/></span><div><strong>{c.title}</strong><p>{c.desc}</p></div></div>
    <div className="assistant-scope-switch"><span>{locale==='en'?'Target space':'目标空间'}</span><div>{isAdmin&&<button className={scope==='public'?'active':''} onClick={()=>{setScope('public');setResult(null);}}>{locale==='en'?'Public':'公共空间'}</button>}<button className={scope==='personal'?'active':''} onClick={()=>{setScope('personal');setResult(null);}}>{locale==='en'?'Personal':'个人空间'}</button></div></div>
    <div className="organize-actions"><button className="icon-btn primary" disabled={job&&['queued','running'].includes(job.status)} onClick={()=>start('organize')}><Icon name="search" size={14}/>{c.scan}</button><button className="icon-btn" disabled={(scope==='personal'&&!personalEnabled)||(job&&['queued','running'].includes(job.status))} onClick={()=>start('embedding_index')}><Icon name="refresh" size={14}/>{c.index}</button><button className="icon-btn" disabled={(scope==='personal'&&!personalEnabled)||(job&&['queued','running'].includes(job.status))} onClick={()=>start('content')}><Icon name="globe" size={14}/>{c.content}</button><button className="icon-btn" disabled={job&&['queued','running'].includes(job.status)} onClick={()=>start('report')}><Icon name="docs" size={14}/>{c.report}</button></div>
    {error&&<div className="error-text">{error}</div>}
    {job&&<div className={`organize-progress ${job.status}`}><div><strong>{['queued','running'].includes(job.status)?c.working:job.status==='failed'?c.failed:c.done}</strong><span>{job.total?`${job.progress}/${job.total}`:job.status}</span></div><progress max={Math.max(1,job.total||1)} value={job.status==='succeeded'?Math.max(1,job.total||1):job.progress||0}/></div>}
    {!result&&!job&&<div className="assistant-empty">{c.empty}</div>}
    {findings.length>0&&<div className="organize-findings">{findings.map((finding,index)=><article className={finding.severity} key={`${finding.type}-${index}`}><span>{finding.severity==='high'?'!':finding.severity==='medium'?'·':'i'}</span><div><strong>{finding.title}</strong><small>{finding.type}</small></div></article>)}<button className="icon-btn primary" disabled={scope==='personal'&&!personalEnabled} onClick={()=>setPlanVersion(value=>value+1)}>{c.plan}</button></div>}
    {planVersion>0&&<AiCommandPanel key={`${scope}-${planVersion}`} scope={scope} initialText={prompt} compact onExecuted={result=>onResourcesChanged?.(scope,result)}/>} 
    <section className="organize-reports"><h4>{c.reports}</h4>{!reports.length?<div className="assistant-empty">{c.noReports}</div>:reports.slice(0,5).map(report=><article key={report.id}><strong>{report.summary}</strong><small>{new Date(report.createdAt).toLocaleString(locale)}</small></article>)}</section>
  </div>;
}
