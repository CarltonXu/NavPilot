const crypto=require('crypto');
const defaultDb=require('../../db');
const {createNavigationService}=require('../navigationService');

function normalizedUrl(value){try{const url=new URL(value);url.hash='';for(const key of [...url.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(key))url.searchParams.delete(key);return url.toString().replace(/\/$/,'').toLocaleLowerCase();}catch{return String(value||'').trim().toLocaleLowerCase();}}
function createIntelligenceService(db=defaultDb){
  const navigation=createNavigationService(db);
  function scan(current){
    const items=navigation.listItems(current),categories=navigation.listCategories(current),findings=[];
    const urls=new Map();
    for(const item of items){const key=normalizedUrl(item.url);if(!urls.has(key))urls.set(key,[]);urls.get(key).push(item);}
    for(const group of urls.values())if(group.length>1)findings.push({type:'duplicate',severity:'high',title:`发现 ${group.length} 个重复地址`,itemIds:group.map(x=>x.id),items:group.map(x=>x.name)});
    const uncategorized=items.filter(x=>x.category_id==null);if(uncategorized.length)findings.push({type:'uncategorized',severity:'medium',title:`${uncategorized.length} 个资源尚未分类`,itemIds:uncategorized.map(x=>x.id)});
    const missingMetadata=items.filter(x=>!x.description||['icon:link','🔗'].includes(x.icon)||/^https?:\/\//i.test(x.name));if(missingMetadata.length)findings.push({type:'metadata_missing',severity:'medium',title:`${missingMetadata.length} 个资源信息不完整`,itemIds:missingMetadata.map(x=>x.id)});
    const missingTags=items.filter(x=>!(x.tags||[]).length);if(missingTags.length)findings.push({type:'tags_missing',severity:'low',title:`${missingTags.length} 个资源没有标签`,itemIds:missingTags.map(x=>x.id)});
    const unhealthy=items.filter(x=>x.status==='offline');if(unhealthy.length)findings.push({type:'offline',severity:'high',title:`${unhealthy.length} 个资源当前不可用`,itemIds:unhealthy.map(x=>x.id)});
    for(const category of categories){const count=items.filter(x=>x.category_id===category.id).length;if(count>30)findings.push({type:'category_oversized',severity:'low',title:`“${category.path_label}”包含 ${count} 个直属资源`,categoryId:category.id,count});}
    return {summary:findings.length?`扫描 ${items.length} 个资源，发现 ${findings.length} 类待整理问题`:`扫描 ${items.length} 个资源，当前未发现明显整理问题`,resourceCount:items.length,categoryCount:categories.length,findings};
  }
  function createReport({actor,current,result}){
    const id=crypto.randomUUID(),now=Date.now();
    db.transaction(()=>{db.prepare('INSERT INTO ai_reports(id,recipient_user_id,realm_scope,realm_owner_id,summary,findings_json,created_at_ms) VALUES(?,?,?,?,?,?,?)').run(id,actor.id,current.scope,current.ownerId,result.summary,JSON.stringify(result.findings),now);db.prepare('INSERT INTO notifications(id,user_id,kind,title,body,payload_json,created_at_ms) VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),actor.id,'ai_report','AI 整理报告',result.summary,JSON.stringify({reportId:id,scope:current.scope}),now);})();
    return {id,...result,createdAt:now};
  }
  return {scan,createReport};
}
module.exports={createIntelligenceService,normalizedUrl};
