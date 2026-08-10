const db=require('../../db');
const {createJobService}=require('./jobService');
const {createEmbeddingService}=require('./embeddingService');
const {createIntelligenceService}=require('./intelligenceService');
const {createContentIntelligenceService}=require('./contentIntelligenceService');
const {getEmbeddingConfig,getSetting}=require('../settingsService');

const jobs=createJobService(db),embeddings=createEmbeddingService(db),intelligence=createIntelligenceService(db),contentIntelligence=createContentIntelligenceService(db);
jobs.register('embedding_index',({actor,realm,progress})=>embeddings.indexRealm(realm,{actorId:actor.id,progress}));
jobs.register('organize',async({actor,realm,input,progress})=>{if(input.mode==='content')return contentIntelligence.analyze(realm,{actor,progress});progress(0,1);const result=intelligence.scan(realm);progress(1,1);return result;});
jobs.register('report',async({actor,realm,progress})=>{progress(0,1);const result=intelligence.createReport({actor,current:realm,result:intelligence.scan(realm)});progress(1,1);return result;});
function scheduleIndex(actor,realm){if(!actor?.id||!getEmbeddingConfig().enabled||(realm.scope==='personal'&&getSetting('ai_personal_enabled','false')!=='true'))return null;try{return jobs.enqueue({actor,kind:'embedding_index',realm});}catch{return null;}}

module.exports={jobs,embeddings,intelligence,contentIntelligence,scheduleIndex};
