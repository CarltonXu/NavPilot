const crypto=require('crypto');
const defaultDb=require('../../db');

function parse(value,fallback){try{return JSON.parse(value||'');}catch{return fallback;}}
function createConversationService(db=defaultDb){
  function modeFor(id){const row=db.prepare('SELECT metadata_json FROM ai_messages WHERE conversation_id=? ORDER BY created_at_ms,id LIMIT 1').get(id),mode=parse(row?.metadata_json,{}).mode;return mode==='instruction'?'instruction':'discussion';}
  function serialize(row){return row?{id:row.id,scope:row.realm_scope,title:row.title,mode:row.mode||modeFor(row.id),createdAt:row.created_at_ms,updatedAt:row.updated_at_ms}:null;}
  function get(id,actor){const row=db.prepare('SELECT * FROM ai_conversations WHERE id=? AND actor_user_id=?').get(id,actor.id);return row||null;}
  function create(actor,current,title='新对话'){const id=crypto.randomUUID(),now=Date.now();db.prepare('INSERT INTO ai_conversations(id,actor_user_id,realm_scope,realm_owner_id,title,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?,?,?)').run(id,actor.id,current.scope,current.ownerId,String(title||'新对话').trim().slice(0,80)||'新对话',now,now);return serialize(get(id,actor));}
  function list(actor){return db.prepare('SELECT * FROM ai_conversations WHERE actor_user_id=? ORDER BY updated_at_ms DESC LIMIT 50').all(actor.id).map(serialize);}
  function messages(id,actor){if(!get(id,actor))return null;return db.prepare('SELECT id,role,content,plan_id AS planId,metadata_json AS metadata,created_at_ms AS createdAt FROM ai_messages WHERE conversation_id=? ORDER BY created_at_ms,id').all(id).map(row=>({...row,metadata:parse(row.metadata,{})}));}
  function append(id,actor,{role,content,planId=null,metadata={}}){const conversation=get(id,actor);if(!conversation)throw Object.assign(new Error('对话不存在'),{code:'AI_CONVERSATION_NOT_FOUND',status:404});const now=Date.now();db.transaction(()=>{db.prepare('INSERT INTO ai_messages(id,conversation_id,role,content,plan_id,metadata_json,created_at_ms) VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),id,role,String(content||'').slice(0,10000),planId,JSON.stringify(metadata),now);db.prepare('UPDATE ai_conversations SET updated_at_ms=?,title=CASE WHEN title IN (\'新对话\',\'New conversation\') AND ?=\'user\' THEN substr(?,1,80) ELSE title END WHERE id=?').run(now,role,String(content||'').trim(),id);})();}
  return{create,list,get,messages,append,serialize};
}
module.exports={createConversationService};
