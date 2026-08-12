const express = require('express');
const db = require('../db');
const { createNavigationService, realm } = require('../services/navigationService');
const { getPublicInsightsSettings } = require('../services/settingsService');

const router = express.Router();
const DAY_MS = 86400000;

function safeTags(value) {
  try { const parsed=JSON.parse(value||'[]'); return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []; }
  catch { return []; }
}
function dayKey(value) { return new Date(value).toISOString().slice(0,10); }
function series(from,days,map,fields) {
  return Array.from({length:days},(_,index)=>{
    const day=dayKey(from+index*DAY_MS),source=map.get(day)||{};
    return Object.fromEntries([['day',day],...fields.map(field=>[field,Number(source[field])||0])]);
  });
}
function parseProperties(row) { try { return JSON.parse(row.propertiesJson||'{}')||{}; } catch { return {}; } }
function publicTerm(value) {
  const term=String(value||'').replace(/\s+/g,' ').trim().slice(0,80);
  if (!term || term==='[sensitive]') return null;
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(term)) return null;
  if (/(?:\+?\d[\s().-]?){7,}/.test(term)) return null;
  if (/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(term)) return null;
  return term;
}

router.get('/',(req,res)=>{
  const settings=getPublicInsightsSettings();
  if (!settings.enabled) return res.status(404).json({code:'PUBLIC_INSIGHTS_DISABLED',error:'公共空间洞察暂未开放'});
  if (!settings.anonymousEnabled && !req.auth?.user) return res.status(401).json({code:'AUTH_REQUIRED',error:'登录后可查看公共空间洞察'});

  const days=[7,30,90].includes(Number(req.query.days))?Number(req.query.days):30;
  const to=Date.now(),from=to-(days-1)*DAY_MS;
  const navigation=createNavigationService(db),categories=navigation.listCategories(realm('public'));
  const categoryMap=new Map(categories.map(category=>[category.id,category]));
  const resources=db.prepare(`SELECT id,name,url,description,icon,category_id categoryId,tags_json tagsJson,status,latency_ms latencyMs,last_checked_at lastCheckedAt,created_at createdAt FROM items WHERE scope='public' ORDER BY id`).all().map(row=>({...row,tags:safeTags(row.tagsJson)}));
  const clicks=db.prepare(`SELECT occurred_at_ms occurredAt,item_id itemId,user_id userId,ip_prefix ipPrefix FROM analytics_events WHERE event_name='item.clicked' AND scope='public' AND occurred_at_ms>=? ORDER BY occurred_at_ms`).all(from);
  const visitsByItem=new Map(),visitorsByItem=new Map(),lastOpenByItem=new Map(),accessDays=new Map();
  for (const click of clicks) {
    visitsByItem.set(click.itemId,(visitsByItem.get(click.itemId)||0)+1);
    const identity=click.userId?`user:${click.userId}`:(click.ipPrefix?`network:${click.ipPrefix}`:null);
    if (identity) { if(!visitorsByItem.has(click.itemId))visitorsByItem.set(click.itemId,new Set()); visitorsByItem.get(click.itemId).add(identity); }
    lastOpenByItem.set(click.itemId,Math.max(lastOpenByItem.get(click.itemId)||0,click.occurredAt));
    const day=dayKey(click.occurredAt),entry=accessDays.get(day)||{opens:0,visitors:new Set(),resources:new Set()};
    entry.opens+=1;if(identity)entry.visitors.add(identity);entry.resources.add(click.itemId);accessDays.set(day,entry);
  }
  const accessTrendMap=new Map([...accessDays].map(([day,value])=>[day,{opens:value.opens,visitors:value.visitors.size,openedResources:value.resources.size}]));

  const createdDays=new Map();let baseline=0;
  resources.forEach((resource) => {
    const createdAt=String(resource.createdAt||'');
    const at=Date.parse(createdAt.includes('Z') ? createdAt : `${createdAt}Z`);
    if (Number.isFinite(at) && at < from) baseline+=1;
    else if (Number.isFinite(at) && at <= to) {
      const day=dayKey(at);
      createdDays.set(day,(createdDays.get(day)||0)+1);
    }
  });
  let running=baseline;
  const growthTrend=Array.from({length:days},(_,index)=>{const day=dayKey(from+index*DAY_MS),addedResources=createdDays.get(day)||0;running+=addedResources;return{day,addedResources,totalResources:running};});

  const searchEvents=db.prepare(`SELECT id,occurred_at_ms occurredAt,properties_json propertiesJson FROM analytics_events WHERE event_name='search.performed' AND occurred_at_ms>=? ORDER BY occurred_at_ms`).all(from).map(row=>({...row,properties:parseProperties(row)}));
  const publicSearches=searchEvents.filter(row=>Number(row.properties.publicResultCount)>0);
  const publicSearchIds=new Set(publicSearches.map(row=>row.id));
  const searchClicks=db.prepare(`SELECT occurred_at_ms occurredAt,properties_json propertiesJson,scope FROM analytics_events WHERE event_name='search.result_clicked' AND occurred_at_ms>=? ORDER BY occurred_at_ms`).all(from).map(row=>({...row,properties:parseProperties(row)})).filter(row=>row.scope==='public'&&publicSearchIds.has(row.properties.searchEventId));
  const clickedSearchIds=new Set(searchClicks.map(row=>row.properties.searchEventId));
  const clicksBySearch=new Map();searchClicks.forEach(row=>clicksBySearch.set(row.properties.searchEventId,(clicksBySearch.get(row.properties.searchEventId)||0)+1));
  const searchDays=new Map(),termMap=new Map();
  publicSearches.forEach(row=>{
    const day=dayKey(row.occurredAt),daily=searchDays.get(day)||{searches:0,publicClicks:0};daily.searches+=1;daily.publicClicks+=clickedSearchIds.has(row.id)?1:0;searchDays.set(day,daily);
    const term=publicTerm(row.properties.term);if(!term)return;
    const key=term.toLocaleLowerCase(),value=termMap.get(key)||{name:term,searches:0,publicClicks:0};value.searches+=1;value.publicClicks+=clicksBySearch.get(row.id)||0;termMap.set(key,value);
  });
  const terms=[...termMap.values()].filter(row=>row.searches>=settings.searchMinCount).sort((a,b)=>b.searches-a.searches||b.publicClicks-a.publicClicks||a.name.localeCompare(b.name)).slice(0,15);

  const topResources=resources.map(resource=>{const category=categoryMap.get(resource.categoryId);return{
    id:resource.id,name:resource.name,url:resource.url,description:resource.description,icon:resource.icon,categoryId:resource.categoryId,
    categoryName:category?.name||null,categoryPath:category?.path_label||category?.name||null,tags:resource.tags,status:resource.status,
    latencyMs:resource.latencyMs,visits:visitsByItem.get(resource.id)||0,uniqueVisitors:visitorsByItem.get(resource.id)?.size||0,lastOpenedAt:lastOpenByItem.get(resource.id)||null,
  };}).filter(row=>row.visits>0).sort((a,b)=>b.visits-a.visits||b.uniqueVisitors-a.uniqueVisitors||a.name.localeCompare(b.name)).slice(0,12);

  const categoryCounts=new Map(),tagCounts=new Map();
  resources.forEach(resource=>{
    if(resource.categoryId){const category=categoryMap.get(resource.categoryId);if(category){const rootId=category.path?.[0]?.id||category.id;categoryCounts.set(rootId,(categoryCounts.get(rootId)||0)+1);}}
    resource.tags.forEach(tag=>tagCounts.set(tag,(tagCounts.get(tag)||0)+1));
  });
  const categoriesResult=[...categoryCounts].map(([id,value])=>{const category=categoryMap.get(id);return{id,name:category?.name||'未分类',path:category?.path_label||category?.name||'',value};}).sort((a,b)=>b.value-a.value).slice(0,12);
  const tagResult=[...tagCounts].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name)).slice(0,18);
  const statuses=['online','offline','unknown'].map(name=>({name,value:resources.filter(row=>row.status===name).length}));
  const checked=resources.filter(row=>row.lastCheckedAt),online=checked.filter(row=>row.status==='online');
  const visitorKeys=new Set(clicks.map(click=>click.userId?`user:${click.userId}`:(click.ipPrefix?`network:${click.ipPrefix}`:null)).filter(Boolean));

  res.json({
    days,filters:{from,to},
    summary:{resources:resources.length,newResources:resources.length-baseline,opens:clicks.length,openedResources:new Set(clicks.map(row=>row.itemId)).size,visitors:visitorKeys.size,onlineRate:checked.length?Number((online.length/checked.length*100).toFixed(1)):null},
    accessTrend:series(from,days,accessTrendMap,['opens','visitors','openedResources']),growthTrend,
    search:{startedAt:publicSearches[0]?.occurredAt||null,searchesWithPublicResults:publicSearches.length,publicClicks:clickedSearchIds.size,clickThroughRate:publicSearches.length?Number((clickedSearchIds.size/publicSearches.length*100).toFixed(1)):0,trend:series(from,days,searchDays,['searches','publicClicks']),terms,minCount:settings.searchMinCount},
    topResources,categories:categoriesResult,tags:tagResult,statuses,
    meta:{growthDefinition:'current-resources-created',generatedAt:to},
  });
});

module.exports=router;
