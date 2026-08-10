const express=require('express');
const db=require('../db');
const {embeddings}=require('../services/ai/runtime');
const {getEmbeddingConfig,getSetting}=require('../services/settingsService');

const router=express.Router();
const semanticRequests=new Map();
function allowSemantic(userId){const now=Date.now(),recent=(semanticRequests.get(userId)||[]).filter(time=>now-time<60000);if(recent.length>=30)return false;recent.push(now);semanticRequests.set(userId,recent);return true;}
function tags(value){try{const parsed=JSON.parse(value||'[]');return Array.isArray(parsed)?parsed:[];}catch{return[];}}
function lexicalScore(item,query){
  const q=query.toLocaleLowerCase(),name=item.name.toLocaleLowerCase(),url=item.url.toLocaleLowerCase(),description=String(item.description||'').toLocaleLowerCase(),category=String(item.categoryName||'').toLocaleLowerCase(),tagText=item.tags.join(' ').toLocaleLowerCase();
  if(name===q)return 1;if(name.startsWith(q))return .9;if(name.includes(q))return .78;if(url.includes(q))return .7;if(tagText.includes(q))return .66;if(category.includes(q))return .62;if(description.includes(q))return .56;return 0;
}
function visibleItems(userId){return db.prepare(`SELECT items.id,items.scope,items.owner_id AS ownerId,items.name,items.url,items.description,items.icon,items.tags_json AS tagsJson,items.status,items.latency_ms AS latencyMs,categories.id AS categoryId,categories.name AS categoryName,categories.icon AS categoryIcon FROM items LEFT JOIN categories ON categories.id=items.category_id WHERE items.scope='public' OR (items.scope='personal' AND items.owner_id=?)`).all(userId).map(row=>{const value={...row,tags:tags(row.tagsJson)};delete value.tagsJson;return value;});}
router.get('/',async(req,res)=>{
  const query=String(req.query.q||'').trim().slice(0,120);if(!query)return res.json([]);
  const userId=req.auth?.user?.id||null,items=visibleItems(userId),semantic=new Map(),config=getEmbeddingConfig();let semanticAvailable=false;
  if(config.enabled&&req.auth?.user&&req.query.semantic!=='0'&&allowSemantic(req.auth.user.id)){
    try{
      const publicScores=await embeddings.semanticScores({scope:'public',ownerId:null},query,userId),personalScores=userId&&getSetting('ai_personal_enabled','false')==='true'?await embeddings.semanticScores({scope:'personal',ownerId:userId},query,userId):new Map();
      for(const [id,score] of [...publicScores,...personalScores])semantic.set(id,score);semanticAvailable=semantic.size>0;
    }catch{/* lexical search remains available when the model is unavailable */}
  }
  const threshold=semanticAvailable ? 0.23 : 0.01;
  const results=items.map(item=>{const lexical=lexicalScore(item,query),semanticRaw=semantic.get(item.id)||0,semanticScore=Math.max(0,Math.min(1,(semanticRaw-.15)/.75)),score=semanticAvailable?(lexical*.58+semanticScore*.42):lexical;return{...item,score,matchType:semanticScore>lexical?'semantic':'lexical'};}).filter(item=>item.score>=threshold).sort((a,b)=>b.score-a.score||a.scope.localeCompare(b.scope)||a.name.localeCompare(b.name)).slice(0,50).map(({ownerId,score,...item})=>({...item,relevance:Number(score.toFixed(4))}));
  res.json(results);
});
module.exports=router;
