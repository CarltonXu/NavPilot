const axios = require('axios');
const crypto = require('crypto');
const defaultDb = require('../../db');
const { getEmbeddingConfig } = require('../settingsService');
const { createNavigationService } = require('../navigationService');

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function cosine(a,b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot=0,left=0,right=0;
  for (let i=0;i<a.length;i+=1) { dot+=a[i]*b[i];left+=a[i]*a[i];right+=b[i]*b[i]; }
  return left && right ? dot/(Math.sqrt(left)*Math.sqrt(right)) : 0;
}
function usage(db,{actorId=null,feature,model,started,success,errorCode=null,tokens={},realmScope=null,realmOwnerId=null}) {
  db.prepare('INSERT INTO ai_usage_events(id,actor_user_id,feature,provider_model,success,latency_ms,input_tokens,output_tokens,realm_scope,realm_owner_id,error_code,created_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),actorId,feature,model,success?1:0,Date.now()-started,tokens.prompt_tokens??null,tokens.total_tokens!=null?Math.max(0,tokens.total_tokens-(tokens.prompt_tokens||0)):null,realmScope,realmOwnerId,errorCode,Date.now());
}
function createEmbeddingService(db = defaultDb) {
  const navigation = createNavigationService(db), queryCache = new Map();
  function sourceText(item,categories) {
    const category = categories.find((row)=>row.id===item.category_id);
    let host='';try{host=new URL(item.url).hostname;}catch{}
    return [item.name,host,item.url,item.description,item.ai_summary,(item.tags||[]).join(' '),category?.path_label||item.category_name||''].filter(Boolean).join('\n').slice(0,6000);
  }
  async function embed(inputs,{actorId=null,feature='semantic_index',realmScope=null,realmOwnerId=null}={}) {
    const config=getEmbeddingConfig();
    if (!config.enabled) throw Object.assign(new Error('尚未启用语义模型'),{code:'EMBEDDING_DISABLED',status:409});
    if (!config.apiKey) throw Object.assign(new Error('尚未配置 Embedding API Key'),{code:'AI_NOT_CONFIGURED',status:400});
    const started=Date.now();
    try {
      const response=await axios.post(`${config.baseURL.replace(/\/$/,'')}/embeddings`,{model:config.model,input:inputs},{headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},timeout:30000,maxContentLength:8*1024*1024});
      const vectors=(response.data?.data||[]).sort((a,b)=>(a.index||0)-(b.index||0)).map((row)=>row.embedding);
      if (vectors.length!==inputs.length || vectors.some((vector)=>!Array.isArray(vector)||!vector.length)) throw Object.assign(new Error('Embedding 服务返回格式无效'),{code:'AI_INVALID_RESPONSE',status:502});
      usage(db,{actorId,feature,model:config.model,started,success:true,tokens:response.data?.usage||{},realmScope,realmOwnerId});
      return {vectors,model:config.model};
    } catch (error) {
      usage(db,{actorId,feature,model:config.model,started,success:false,errorCode:error.code||'AI_UPSTREAM_REQUEST_FAILED',realmScope,realmOwnerId});
      if (error.status) throw error;
      if (error.code==='ECONNABORTED'||error.code==='ETIMEDOUT') throw Object.assign(new Error('Embedding 服务请求超时'),{code:'AI_UPSTREAM_TIMEOUT',status:504});
      if ([401,403].includes(error.response?.status)) throw Object.assign(new Error('Embedding 服务鉴权失败'),{code:'AI_UPSTREAM_AUTH_FAILED',status:502});
      throw Object.assign(new Error('Embedding 服务请求失败'),{code:'AI_UPSTREAM_REQUEST_FAILED',status:502});
    }
  }
  async function indexRealm(current,{actorId=null,progress=()=>{}}={}) {
    const items=navigation.listItems(current),categories=navigation.listCategories(current),pending=[];
    for (const item of items) {
      const source=sourceText(item,categories),sourceHash=hash(source),existing=db.prepare('SELECT source_hash,provider_model FROM resource_embeddings WHERE item_id=?').get(item.id),config=getEmbeddingConfig();
      if (!existing||existing.source_hash!==sourceHash||existing.provider_model!==config.model) pending.push({item,source,sourceHash});
    }
    let completed=0;progress(0,pending.length);
    for (let offset=0;offset<pending.length;offset+=32) {
      const batch=pending.slice(offset,offset+32),result=await embed(batch.map((row)=>row.source),{actorId,feature:'semantic_index',realmScope:current.scope,realmOwnerId:current.ownerId});
      db.transaction(()=>batch.forEach((row,index)=>db.prepare('INSERT INTO resource_embeddings(item_id,source_hash,provider_model,dimensions,vector_json,updated_at_ms) VALUES(?,?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET source_hash=excluded.source_hash,provider_model=excluded.provider_model,dimensions=excluded.dimensions,vector_json=excluded.vector_json,updated_at_ms=excluded.updated_at_ms').run(row.item.id,row.sourceHash,result.model,result.vectors[index].length,JSON.stringify(result.vectors[index]),Date.now())))();
      completed+=batch.length;progress(completed,pending.length);
    }
    return {resourceCount:items.length,indexedCount:pending.length,unchangedCount:items.length-pending.length};
  }
  async function queryVector(query,actorId,current=null) {
    const config=getEmbeddingConfig(),key=`${config.model}:${query.toLocaleLowerCase()}`,cached=queryCache.get(key);
    if (cached&&cached.expires>Date.now()) return cached.vector;
    const {vectors}=await embed([query.slice(0,1000)],{actorId,feature:'semantic_search',realmScope:current?.scope||null,realmOwnerId:current?.ownerId||null}),vector=vectors[0];
    queryCache.set(key,{vector,expires:Date.now()+10*60*1000});
    if (queryCache.size>100) queryCache.delete(queryCache.keys().next().value);
    return vector;
  }
  async function semanticScores(current,query,actorId) {
    const vector=await queryVector(query,actorId,current),rows=db.prepare("SELECT e.item_id,e.vector_json FROM resource_embeddings e JOIN items i ON i.id=e.item_id WHERE i.scope=? AND i.owner_id IS ?").all(current.scope,current.ownerId),scores=new Map();
    for (const row of rows) { const score=cosine(vector,JSON.parse(row.vector_json));if(Number.isFinite(score))scores.set(row.item_id,score); }
    return scores;
  }
  return {embed,indexRealm,semanticScores,sourceText,cosine};
}
module.exports={createEmbeddingService,cosine};
