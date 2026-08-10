const crypto = require('crypto');
const defaultDb = require('../../db');

function parse(value, fallback = null) {
  try { return value == null ? fallback : JSON.parse(value); } catch { return fallback; }
}

function createJobService(db = defaultDb) {
  const handlers = new Map();
  let processing = false;

  function serialize(row) {
    if (!row) return null;
    return {
      id:row.id,kind:row.kind,scope:row.realm_scope,status:row.status,
      progress:row.progress,total:row.total,input:parse(row.input_json,{}),
      result:parse(row.result_json,null),error:row.error_code ? {code:row.error_code,message:row.error_message} : null,
      createdAt:row.created_at_ms,startedAt:row.started_at_ms,completedAt:row.completed_at_ms,updatedAt:row.updated_at_ms,
    };
  }

  function get(id, actor) {
    const row = db.prepare('SELECT * FROM ai_jobs WHERE id=?').get(id);
    if (!row || row.actor_user_id !== actor.id) return null;
    return serialize(row);
  }

  function list(actor, limit = 30) {
    return db.prepare('SELECT * FROM ai_jobs WHERE actor_user_id=? ORDER BY created_at_ms DESC LIMIT ?').all(actor.id,Math.min(100,Math.max(1,Number(limit)||30))).map(serialize);
  }

  function setProgress(id, progress, total) {
    db.prepare('UPDATE ai_jobs SET progress=?,total=?,updated_at_ms=? WHERE id=?').run(Math.max(0,Number(progress)||0),Math.max(0,Number(total)||0),Date.now(),id);
  }

  async function processQueue() {
    if (processing) return;
    processing = true;
    try {
      while (true) {
        const row = db.prepare("SELECT * FROM ai_jobs WHERE status='queued' ORDER BY created_at_ms LIMIT 1").get();
        if (!row) break;
        const handler = handlers.get(row.kind);
        if (!handler) break;
        const started = Date.now();
        db.prepare("UPDATE ai_jobs SET status='running',started_at_ms=?,updated_at_ms=? WHERE id=? AND status='queued'").run(started,started,row.id);
        try {
          const result = await handler({
            job:serialize({...row,status:'running',started_at_ms:started,updated_at_ms:started}),
            actor:db.prepare('SELECT * FROM users WHERE id=?').get(row.actor_user_id),
            realm:{scope:row.realm_scope,ownerId:row.realm_owner_id},
            input:parse(row.input_json,{}),
            progress:(value,total)=>setProgress(row.id,value,total),
          });
          const completed = Date.now();
          db.prepare("UPDATE ai_jobs SET status='succeeded',progress=CASE WHEN total>0 THEN total ELSE progress END,result_json=?,completed_at_ms=?,updated_at_ms=? WHERE id=?").run(JSON.stringify(result ?? {}),completed,completed,row.id);
        } catch (error) {
          const completed = Date.now();
          db.prepare("UPDATE ai_jobs SET status='failed',error_code=?,error_message=?,completed_at_ms=?,updated_at_ms=? WHERE id=?").run(error.code || 'AI_JOB_FAILED',String(error.status ? error.message : '后台任务执行失败').slice(0,500),completed,completed,row.id);
        }
      }
    } finally { processing = false; }
  }

  function register(kind, handler) { handlers.set(kind,handler); setImmediate(processQueue); }

  function enqueue({ actor, kind, realm, input = {} }) {
    if (!handlers.has(kind)) throw Object.assign(new Error('不支持的后台任务'),{code:'AI_JOB_KIND_INVALID',status:400});
    if (kind === 'embedding_index') {
      const existing = db.prepare("SELECT * FROM ai_jobs WHERE actor_user_id=? AND kind='embedding_index' AND realm_scope=? AND realm_owner_id IS ? AND status IN ('queued','running') ORDER BY created_at_ms DESC LIMIT 1").get(actor.id,realm.scope,realm.ownerId);
      if (existing) return serialize(existing);
    }
    const id = crypto.randomUUID(), now = Date.now();
    db.prepare("INSERT INTO ai_jobs(id,actor_user_id,kind,realm_scope,realm_owner_id,status,input_json,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?,'queued',?,?,?)").run(id,actor.id,kind,realm.scope,realm.ownerId,JSON.stringify(input),now,now);
    setImmediate(processQueue);
    return get(id,actor);
  }

  db.prepare("UPDATE ai_jobs SET status='queued',started_at_ms=NULL,updated_at_ms=? WHERE status='running'").run(Date.now());
  return { register,enqueue,get,list,processQueue,serialize };
}

module.exports = { createJobService };
