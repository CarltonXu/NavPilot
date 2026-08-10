const db=require('../../db');
const {createJobService}=require('./jobService');
const {createEmbeddingService}=require('./embeddingService');
const {getEmbeddingConfig,getSetting}=require('../settingsService');

const jobs=createJobService(db),embeddings=createEmbeddingService(db);
jobs.register('embedding_index',({actor,realm,progress})=>embeddings.indexRealm(realm,{actorId:actor.id,progress}));
function scheduleIndex(actor,realm){if(!actor?.id||!getEmbeddingConfig().enabled||(realm.scope==='personal'&&getSetting('ai_personal_enabled','false')!=='true'))return null;try{return jobs.enqueue({actor,kind:'embedding_index',realm});}catch{return null;}}

module.exports={jobs,embeddings,scheduleIndex};
