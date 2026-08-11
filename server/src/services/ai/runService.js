const crypto = require("crypto");
const defaultDb = require("../../db");

function parse(value, fallback = {}) { try { return JSON.parse(value || ""); } catch { return fallback; } }
function tokenCounts(usage = {}) {
  const input = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) || 0;
  const output = Number(usage.completion_tokens ?? usage.output_tokens ?? (usage.total_tokens != null ? Math.max(0, Number(usage.total_tokens) - input) : 0)) || 0;
  return { input:Math.max(0, Math.round(input)), output:Math.max(0, Math.round(output)) };
}
function estimateTokens(value) {
  const text = String(value || ""), nonAscii = (text.match(/[^\x00-\x7F]/g) || []).length;
  return Math.max(1, Math.ceil(nonAscii * 0.85 + (text.length - nonAscii) / 4));
}

function createRunService(db = defaultDb) {
  function row(id) { return db.prepare("SELECT * FROM ai_runs WHERE id=?").get(id); }
  function serialize(value, includeEvents = false) {
    if (!value) return null;
    const result = {
      id:value.id, mode:value.mode, scope:value.realm_scope, status:value.status, stage:value.stage,
      model:value.provider_model || null, inputTokens:value.input_tokens, outputTokens:value.output_tokens,
      totalTokens:value.input_tokens + value.output_tokens, estimatedInputTokens:value.estimated_input_tokens,
      estimatedOutputTokens:value.estimated_output_tokens, modelCalls:value.model_calls, toolCalls:value.tool_calls,
      firstTokenMs:value.first_token_ms, estimatedCostMicros:value.estimated_cost_micros,
      resultKind:value.result_kind, errorCode:value.error_code, summary:parse(value.summary_json,{}),
      startedAt:value.started_at_ms, completedAt:value.completed_at_ms,
      durationMs:(value.completed_at_ms || Date.now()) - value.started_at_ms,
    };
    if (includeEvents) result.events = db.prepare("SELECT event_type AS type,payload_json AS payload,created_at_ms AS createdAt FROM ai_run_events WHERE run_id=? ORDER BY created_at_ms,id").all(value.id).map(event => ({...event,payload:parse(event.payload,{})}));
    return result;
  }
  function event(id, type, payload = {}) {
    const now = Date.now();
    db.prepare("INSERT INTO ai_run_events(id,run_id,event_type,payload_json,created_at_ms) VALUES(?,?,?,?,?)").run(crypto.randomUUID(),id,type,JSON.stringify(payload),now);
    if (type === "stage") db.prepare("UPDATE ai_runs SET stage=?,updated_at_ms=? WHERE id=? AND status='running'").run(String(payload.stage || "running").slice(0,60),now,id);
    return { type, runId:id, ...payload, at:now };
  }
  function create({ actor, current, mode, conversationId = null, estimatedInputTokens = 0 }) {
    const id = crypto.randomUUID(), now = Date.now();
    db.prepare("INSERT INTO ai_runs(id,actor_user_id,conversation_id,mode,realm_scope,realm_owner_id,status,stage,estimated_input_tokens,started_at_ms,updated_at_ms) VALUES(?,?,?,?,?,?,'running','started',?,?,?)").run(id,actor.id,conversationId,mode,current.scope,current.ownerId,Math.max(0,Math.round(estimatedInputTokens)),now,now);
    event(id,"started",{mode,scope:current.scope});
    return serialize(row(id));
  }
  function setConversation(id, conversationId) { db.prepare("UPDATE ai_runs SET conversation_id=?,updated_at_ms=? WHERE id=?").run(conversationId,Date.now(),id); }
  function estimate(id, { inputTokens, outputTokens } = {}) {
    const current = row(id); if (!current) return null;
    db.prepare("UPDATE ai_runs SET estimated_input_tokens=?,estimated_output_tokens=?,updated_at_ms=? WHERE id=?").run(inputTokens ?? current.estimated_input_tokens,outputTokens ?? current.estimated_output_tokens,Date.now(),id);
    return serialize(row(id));
  }
  function addUsage(id, { usage = {}, model = null, firstTokenMs = null, calls = 1 } = {}) {
    const counts = tokenCounts(usage), now = Date.now(), callCount=Math.max(1,Number(calls)||1);
    db.prepare("UPDATE ai_runs SET input_tokens=input_tokens+?,output_tokens=output_tokens+?,model_calls=model_calls+?,provider_model=COALESCE(?,provider_model),first_token_ms=CASE WHEN first_token_ms IS NULL THEN ? ELSE MIN(first_token_ms,COALESCE(?,first_token_ms)) END,updated_at_ms=? WHERE id=?").run(counts.input,counts.output,callCount,model,firstTokenMs,firstTokenMs,now,id);
    const value = serialize(row(id)); event(id,"usage",{exact:true,inputTokens:value.inputTokens,outputTokens:value.outputTokens,totalTokens:value.totalTokens,modelCalls:value.modelCalls,model:value.model}); return value;
  }
  function addTools(id, count, tools = []) { const value=Math.max(0,Number(count)||0);db.prepare("UPDATE ai_runs SET tool_calls=tool_calls+?,updated_at_ms=? WHERE id=?").run(value,Date.now(),id);event(id,"tools",{count:value,tools:tools.slice(0,20)});return serialize(row(id)); }
  function complete(id, { resultKind = null, summary = {} } = {}) { const now=Date.now();db.prepare("UPDATE ai_runs SET status='succeeded',stage='completed',result_kind=?,summary_json=?,completed_at_ms=?,updated_at_ms=? WHERE id=?").run(resultKind,JSON.stringify(summary),now,now,id);event(id,"completed",{resultKind});return serialize(row(id)); }
  function fail(id, error) { const now=Date.now(),status=error?.code==='AI_REQUEST_CANCELLED'?'cancelled':'failed';db.prepare("UPDATE ai_runs SET status=?,stage=?,error_code=?,completed_at_ms=?,updated_at_ms=? WHERE id=?").run(status,status,error?.code||'AI_RUN_FAILED',now,now,id);event(id,status,{code:error?.code||'AI_RUN_FAILED'});return serialize(row(id)); }
  function get(id, actor, includeEvents = false) { const value=row(id);return value&&value.actor_user_id===actor.id?serialize(value,includeEvents):null; }
  return { create,event,setConversation,estimate,addUsage,addTools,complete,fail,get,serialize,estimateTokens };
}

module.exports = { createRunService, estimateTokens, tokenCounts };
