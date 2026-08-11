const express=require('express');
const crypto=require('crypto');
const {requestCommands,requestInstruction,requestReportDesign,requestReportNarrative,requestDiscussion,requestDiscussionStream}=require('../services/ai/openAiCompatibleProvider');
const {createPlan,serializePlan,loadPlan}=require('../services/ai/planService');
const {executePlan,undoPlan}=require('../services/ai/commandExecutor');
const {getSetting}=require('../services/settingsService');
const {requireAdmin,requireUser,requirePasswordChanged,authorizePermission}=require('../middleware/auth');
const {realm,createNavigationService}=require('../services/navigationService');
const {audit}=require('../services/eventService');
const {createConversationService}=require('../services/ai/conversationService');
const {buildPlannerContext}=require('../services/ai/plannerContext');
const {executeResourceQuery}=require('../services/ai/instructionService');
const {buildInteractiveReportData,saveInteractiveReport,getInteractiveReport,renderInteractiveReport}=require('../services/ai/interactiveReportService');
const {PERMISSIONS,assertRealmPermission}=require('../services/authorizationService');
const {instructionPreflight}=require('../services/ai/instructionPolicy');
const {createRunService}=require('../services/ai/runService');
const db=require('../db'),navigation=createNavigationService(db),conversations=createConversationService(db),runs=createRunService(db);
const router=express.Router();
function personalEnabled(){return getSetting('ai_personal_enabled','false')==='true';}
function requirePublicAnalyze(req,res,next){return authorizePermission(req,res,PERMISSIONS.PUBLIC_ANALYZE,{scope:'public'},next);}
function sendError(res,error,fallback='AI_UPSTREAM_REQUEST_FAILED'){return res.status(error.status||502).json({code:error.code||fallback,error:error.message||'AI 操作失败'});}
function plannerContext(current,text){return buildPlannerContext({categories:navigation.listCategories(current),items:navigation.listItems(current),text});}
async function plan(req,res,scope){const text=String(req.body.text||'').trim();if(!text)return res.status(400).json({code:'AI_TEXT_REQUIRED',error:'请输入描述内容'});try{const current=realm(scope,scope==='personal'?req.auth.user.id:null),locale=req.body.locale==='en'?'en':'zh-CN',conversationId=req.body.conversationId||null;let history=[];if(conversationId){const conversation=conversations.get(conversationId,req.auth.user);if(!conversation||conversation.realm_scope!==scope)throw Object.assign(new Error('对话不存在或空间不匹配'),{code:'AI_CONVERSATION_NOT_FOUND',status:404});history=conversations.messages(conversationId,req.auth.user)||[];conversations.append(conversationId,req.auth.user,{role:'user',content:text});}const result=await requestCommands(text,{locale,context:plannerContext(current,text),history,actorId:req.auth.user.id,realmScope:current.scope,realmOwnerId:current.ownerId}),value=createPlan({actor:req.auth.user,current,locale,text,commands:result.commands,model:result.model,summary:result.summary,suggestions:result.suggestions});if(conversationId)conversations.append(conversationId,req.auth.user,{role:'assistant',content:result.summary||`${value.operations.length} 项操作计划`,planId:value.id,metadata:{suggestions:result.suggestions,operationCount:value.operations.length}});audit(req,'ai.plan.created',{targetType:'ai_plan',targetId:value.id,metadata:{scope,conversationId,operationTypes:value.operations.map(x=>x.op),operationCount:value.operations.length,inputHash:crypto.createHash('sha256').update(text).digest('hex')}});return res.status(201).json({...value,conversationId});}catch(error){audit(req,'ai.plan.failed',{outcome:'failure',targetType:'ai_plan',metadata:{scope,reason:error.code||'AI_PLAN_FAILED'}});return sendError(res,error,'AI_PLAN_FAILED');}}
async function performInstruction(req,scope,{emit=()=>{},signal}={}){
  const text=String(req.body.text||'').trim();
  if(!text)throw Object.assign(new Error('请输入自然语言指令'),{code:'AI_TEXT_REQUIRED',status:400});
  let conversationId=req.body.conversationId||null;
  let run=null;
  try{
    const current=realm(scope,scope==='personal'?req.auth.user.id:null),locale=req.body.locale==='en'?'en':'zh-CN';
    emit({type:'stage',stage:'permission'});
    instructionPreflight({text,scope,actor:req.auth.user,locale});
    if(conversationId){
      const conversation=conversations.get(conversationId,req.auth.user);
      if(!conversation||conversation.realm_scope!==scope)throw Object.assign(new Error('指令记录不存在或空间不匹配'),{code:'AI_CONVERSATION_NOT_FOUND',status:404});
    }else conversationId=conversations.create(req.auth.user,current,text.slice(0,80)).id;
    conversations.append(conversationId,req.auth.user,{role:'user',content:text,metadata:{mode:'instruction'}});
    run=runs.create({actor:req.auth.user,current,mode:'instruction',conversationId,estimatedInputTokens:runs.estimateTokens(text)});
    emit({type:'meta',conversationId,runId:run.id});
    const stage=(value,detail='')=>{runs.event(run.id,'stage',{stage:value,detail});emit({type:'stage',stage:value,detail,runId:run.id});};
    const usage=result=>{const value=runs.addUsage(run.id,{usage:result.usage,model:result.model,calls:result.modelCalls});emit({type:'usage',run:value,exact:value.totalTokens>0});return value;};
    stage('context');
    const context=plannerContext(current,text);
    const estimatedInputTokens=runs.estimateTokens(`${text}\n${JSON.stringify(context)}`);runs.estimate(run.id,{inputTokens:estimatedInputTokens});emit({type:'usage',run:runs.get(run.id,req.auth.user),exact:false});
    stage('classify');
    const result=await requestInstruction(text,{locale,context,actorId:req.auth.user.id,realmScope:current.scope,realmOwnerId:current.ownerId,runId:run.id,signal});usage(result);
    if(result.kind==='report'){
      stage('report_design');
      const design=await requestReportDesign(text,{locale,context,actorId:req.auth.user.id,realmScope:current.scope,realmOwnerId:current.ownerId,runId:run.id,signal});usage(design);
      if(result.report.spaces==='all_visible')design.spec.spaces='all_visible';
      stage('tools');
      const data=await buildInteractiveReportData(db,{actor:req.auth.user,spec:design.spec,currentScope:scope});
      const toolRun=runs.addTools(run.id,data.toolTrace.length,data.toolTrace);emit({type:'tools',run:toolRun,tools:data.toolTrace});
      stage('insight');
      const narrative=await requestReportNarrative(text,{locale,spec:design.spec,facts:data.facts,actorId:req.auth.user.id,realmScope:current.scope,realmOwnerId:current.ownerId,runId:run.id,signal});usage(narrative);
      const report=saveInteractiveReport(db,{actor:req.auth.user,spec:design.spec,data,narrative,model:design.model,currentScope:scope});
      const finalRun=runs.complete(run.id,{resultKind:'report',summary:{reportId:report.id}});
      conversations.append(conversationId,req.auth.user,{role:'assistant',content:`${report.title} · ${report.metrics.resources||0} 个资源`,metadata:{mode:'instruction',kind:'report',model:design.model,reportId:report.id,runId:run.id,usage:finalRun}});
      audit(req,'ai.instruction.reported',{targetType:'ai_report',targetId:report.id,metadata:{scope,spaces:design.spec.spaces,resourceCount:report.metrics.resources||0,widgets:design.spec.widgets.map(widget=>widget.type),tools:data.toolTrace,inputHash:crypto.createHash('sha256').update(text).digest('hex')}});
      return{kind:'report',report,model:design.model,conversationId,run:finalRun};
    }
    if(result.kind==='query'){
      stage('tools');
      const value=executeResourceQuery(db,current,{...result.query,title:result.title},locale);
      const toolRun=runs.addTools(run.id,1,['resources.query']);emit({type:'tools',run:toolRun,tools:['resources.query']});
      const finalRun=runs.complete(run.id,{resultKind:'query',summary:{matched:value.summary.matched}});
      conversations.append(conversationId,req.auth.user,{role:'assistant',content:value.answer,metadata:{mode:'instruction',kind:'query',model:result.model,result:value,runId:run.id,usage:finalRun}});
      audit(req,'ai.instruction.queried',{targetType:'navigation_realm',metadata:{scope,matched:value.summary.matched,groupBy:result.query.groupBy,inputHash:crypto.createHash('sha256').update(text).digest('hex'),model:result.model}});
      return{...value,model:result.model,conversationId,run:finalRun};
    }
    stage('plan');
    assertRealmPermission(req.auth.user,current,'manage');
    const value=createPlan({actor:req.auth.user,current,locale,text,commands:result.commands,model:result.model,summary:result.summary,suggestions:result.suggestions});
    const toolRun=runs.addTools(run.id,1,['plans.create']);emit({type:'tools',run:toolRun,tools:['plans.create']});
    const finalRun=runs.complete(run.id,{resultKind:'plan',summary:{planId:value.id,operationCount:value.operations.length}});
    conversations.append(conversationId,req.auth.user,{role:'assistant',content:result.summary||`${value.operations.length} 项待授权操作`,planId:value.id,metadata:{mode:'instruction',kind:'plan',model:result.model,operationCount:value.operations.length,runId:run.id,usage:finalRun}});
    audit(req,'ai.instruction.planned',{targetType:'ai_plan',targetId:value.id,metadata:{scope,operationTypes:value.operations.map(item=>item.op),operationCount:value.operations.length,inputHash:crypto.createHash('sha256').update(text).digest('hex'),model:result.model}});
    return{kind:'plan',plan:value,model:result.model,conversationId,run:finalRun};
  }catch(error){
    const failedRun=run?runs.fail(run.id,error):null;
    if(conversationId&&conversations.get(conversationId,req.auth.user))conversations.append(conversationId,req.auth.user,{role:'assistant',content:error.message||'指令执行失败',metadata:{mode:'instruction',kind:'error',code:error.code||'AI_INSTRUCTION_FAILED',runId:run?.id||null,usage:failedRun}});
    audit(req,'ai.instruction.failed',{outcome:'failure',targetType:'navigation_realm',metadata:{scope,reason:error.code||'AI_INSTRUCTION_FAILED'}});
    throw error;
  }
}
async function instruct(req,res,scope){try{return res.status(201).json(await performInstruction(req,scope));}catch(error){return sendError(res,error,'AI_INSTRUCTION_FAILED');}}
async function streamInstruct(req,res,scope){res.status(200).set({'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no','Connection':'keep-alive'});res.flushHeaders?.();const write=value=>{if(!res.writableEnded&&!res.destroyed){res.write(`${JSON.stringify(value)}\n`);res.flush?.();}},controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});try{const result=await performInstruction(req,scope,{emit:write,signal:controller.signal});write({type:'result',result});write({type:'done',conversationId:result.conversationId,run:result.run});}catch(error){write({type:'error',code:error.code||'AI_INSTRUCTION_FAILED',message:error.message||'指令执行失败',status:error.status||502});}finally{if(!res.writableEnded)res.end();}}
async function discuss(req,res,scope){const text=String(req.body.text||'').trim();if(!text)return res.status(400).json({code:'AI_TEXT_REQUIRED',error:'请输入讨论内容'});try{const current=realm(scope,scope==='personal'?req.auth.user.id:null),locale=req.body.locale==='en'?'en':'zh-CN';let conversationId=req.body.conversationId||null,history=[];if(conversationId){const conversation=conversations.get(conversationId,req.auth.user);if(!conversation||conversation.realm_scope!==scope)throw Object.assign(new Error('对话不存在或空间不匹配'),{code:'AI_CONVERSATION_NOT_FOUND',status:404});history=conversations.messages(conversationId,req.auth.user)||[];}else conversationId=conversations.create(req.auth.user,current,text.slice(0,80)).id;conversations.append(conversationId,req.auth.user,{role:'user',content:text,metadata:{mode:'discussion'}});const result=await requestDiscussion(text,{locale,context:plannerContext(current,text),history,actorId:req.auth.user.id,realmScope:current.scope,realmOwnerId:current.ownerId});conversations.append(conversationId,req.auth.user,{role:'assistant',content:result.answer,metadata:{mode:'discussion',model:result.model}});audit(req,'ai.discussion.created',{targetType:'ai_conversation',targetId:conversationId,metadata:{scope,inputHash:crypto.createHash('sha256').update(text).digest('hex'),model:result.model}});return res.status(201).json({conversationId,answer:result.answer,model:result.model});}catch(error){audit(req,'ai.discussion.failed',{outcome:'failure',targetType:'ai_conversation',targetId:req.body.conversationId||null,metadata:{scope,reason:error.code||'AI_DISCUSSION_FAILED'}});return sendError(res,error,'AI_DISCUSSION_FAILED');}}
async function streamDiscuss(req,res,scope){
  const text=String(req.body.text||'').trim();
  if(!text)return res.status(400).json({code:'AI_TEXT_REQUIRED',error:'请输入讨论内容'});
  const current=realm(scope,scope==='personal'?req.auth.user.id:null),locale=req.body.locale==='en'?'en':'zh-CN';
  let conversationId=req.body.conversationId||null,history=[],run=null,context=null;
  try{
    if(conversationId){
      const conversation=conversations.get(conversationId,req.auth.user);
      if(!conversation||conversation.realm_scope!==scope)throw Object.assign(new Error('对话不存在或空间不匹配'),{code:'AI_CONVERSATION_NOT_FOUND',status:404});
      history=conversations.messages(conversationId,req.auth.user)||[];
    }else conversationId=conversations.create(req.auth.user,current,text.slice(0,80)).id;
    conversations.append(conversationId,req.auth.user,{role:'user',content:text,metadata:{mode:'discussion'}});
    context=plannerContext(current,text);
    run=runs.create({actor:req.auth.user,current,mode:'discussion',conversationId,estimatedInputTokens:runs.estimateTokens(`${text}\n${JSON.stringify(history)}\n${JSON.stringify(context)}`)});
  }catch(error){return sendError(res,error,'AI_DISCUSSION_FAILED');}
  res.status(200).set({'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no','Connection':'keep-alive'});
  res.flushHeaders?.();
  const write=value=>{if(!res.writableEnded&&!res.destroyed){res.write(`${JSON.stringify(value)}\n`);res.flush?.();}};
  const controller=new AbortController();
  res.on('close',()=>{if(!res.writableEnded)controller.abort();});
  write({type:'meta',conversationId,runId:run.id});
  runs.event(run.id,'stage',{stage:'model',detail:'discussion'});write({type:'stage',stage:'model',runId:run.id});
  write({type:'usage',run:runs.get(run.id,req.auth.user),exact:false});
  try{
    let outputText='',lastUsageAt=0;
    const result=await requestDiscussionStream(text,{locale,context,history,actorId:req.auth.user.id,realmScope:current.scope,realmOwnerId:current.ownerId,runId:run.id,signal:controller.signal,onDelta:content=>{outputText+=content;write({type:'delta',content});if(Date.now()-lastUsageAt>500){lastUsageAt=Date.now();const value=runs.estimate(run.id,{outputTokens:runs.estimateTokens(outputText)});write({type:'usage',run:value,exact:false});}}});
    const usageRun=runs.addUsage(run.id,{usage:result.usage,model:result.model,firstTokenMs:result.firstTokenMs,calls:result.modelCalls});write({type:'usage',run:usageRun,exact:usageRun.totalTokens>0});
    const finalRun=runs.complete(run.id,{resultKind:'discussion',summary:{answerLength:result.answer.length}});
    conversations.append(conversationId,req.auth.user,{role:'assistant',content:result.answer,metadata:{mode:'discussion',model:result.model,streamed:true,runId:run.id,usage:finalRun}});
    audit(req,'ai.discussion.created',{targetType:'ai_conversation',targetId:conversationId,metadata:{scope,inputHash:crypto.createHash('sha256').update(text).digest('hex'),model:result.model,streamed:true}});
    write({type:'done',conversationId,model:result.model,run:finalRun});
  }catch(error){
    const failedRun=run?runs.fail(run.id,error):null;
    if(conversationId&&conversations.get(conversationId,req.auth.user))conversations.append(conversationId,req.auth.user,{role:'assistant',content:error.code==='AI_REQUEST_CANCELLED'?'AI 请求已取消':error.message||'AI 讨论失败',metadata:{mode:'discussion',kind:'error',code:error.code||'AI_DISCUSSION_FAILED',runId:run?.id||null,usage:failedRun}});
    audit(req,'ai.discussion.failed',{outcome:'failure',targetType:'ai_conversation',targetId:conversationId,metadata:{scope,reason:error.code||'AI_DISCUSSION_FAILED',streamed:true}});
    write({type:'error',code:error.code||'AI_DISCUSSION_FAILED',message:error.message||'AI 流式请求失败'});
  }finally{if(!res.writableEnded)res.end();}
}
router.post('/public/plans',requireAdmin,requirePasswordChanged,(req,res)=>plan(req,res,'public'));
router.post('/personal/plans',requireAdmin,requirePasswordChanged,(req,res)=>{if(!personalEnabled())return res.status(403).json({code:'AI_PERSONAL_DISABLED',error:'管理员尚未开启个人空间的 AI 资源操作'});return plan(req,res,'personal');});
router.post('/public/quick-instructions/stream',requirePublicAnalyze,requirePasswordChanged,(req,res)=>streamInstruct(req,res,'public'));
router.post('/personal/quick-instructions/stream',requireUser,requirePasswordChanged,(req,res)=>{if(!personalEnabled())return res.status(403).json({code:'AI_PERSONAL_DISABLED',error:'管理员尚未开启个人空间的 AI 能力'});return streamInstruct(req,res,'personal');});
router.post('/public/instructions',requireAdmin,requirePasswordChanged,(req,res)=>instruct(req,res,'public'));
router.post('/personal/instructions',requireAdmin,requirePasswordChanged,(req,res)=>{if(!personalEnabled())return res.status(403).json({code:'AI_PERSONAL_DISABLED',error:'管理员尚未开启个人空间的 AI 能力'});return instruct(req,res,'personal');});
router.post('/public/instructions/stream',requireAdmin,requirePasswordChanged,(req,res)=>streamInstruct(req,res,'public'));
router.post('/personal/instructions/stream',requireAdmin,requirePasswordChanged,(req,res)=>{if(!personalEnabled())return res.status(403).json({code:'AI_PERSONAL_DISABLED',error:'管理员尚未开启个人空间的 AI 能力'});return streamInstruct(req,res,'personal');});
router.post('/public/discussions',requireAdmin,requirePasswordChanged,(req,res)=>discuss(req,res,'public'));
router.post('/personal/discussions',requireAdmin,requirePasswordChanged,(req,res)=>{if(!personalEnabled())return res.status(403).json({code:'AI_PERSONAL_DISABLED',error:'管理员尚未开启个人空间的 AI 能力'});return discuss(req,res,'personal');});
router.post('/public/discussions/stream',requireAdmin,requirePasswordChanged,(req,res)=>streamDiscuss(req,res,'public'));
router.post('/personal/discussions/stream',requireAdmin,requirePasswordChanged,(req,res)=>{if(!personalEnabled())return res.status(403).json({code:'AI_PERSONAL_DISABLED',error:'管理员尚未开启个人空间的 AI 能力'});return streamDiscuss(req,res,'personal');});
router.get('/reports/:id',requireUser,requirePasswordChanged,(req,res)=>{try{return res.json({kind:'report',report:getInteractiveReport(db,req.params.id,req.auth.user)});}catch(error){return sendError(res,error,'AI_REPORT_NOT_FOUND');}});
router.get('/runs/:id',requireUser,requirePasswordChanged,(req,res)=>{const run=runs.get(req.params.id,req.auth.user,true);return run?res.json(run):res.status(404).json({code:'AI_RUN_NOT_FOUND',error:'AI 执行记录不存在'});});
router.get('/reports/:id/html',requireUser,requirePasswordChanged,(req,res)=>{try{const html=renderInteractiveReport(db,req.params.id,req.auth.user,req.query.locale==='en'?'en':'zh-CN');res.set({'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'});if(req.query.download==='1')res.set('Content-Disposition',`attachment; filename="navpilot-report-${req.params.id}.html"`);return res.send(html);}catch(error){return sendError(res,error,'AI_REPORT_NOT_FOUND');}});
router.get('/plans/:id',requireUser,requirePasswordChanged,(req,res)=>{try{return res.json(serializePlan(loadPlan(req.params.id,req.auth.user)));}catch(error){return sendError(res,error,'AI_PLAN_NOT_FOUND');}});
router.post('/plans/:id/execute',requireUser,requirePasswordChanged,(req,res)=>{try{return res.json(executePlan({id:req.params.id,actor:req.auth.user,req,idempotencyKey:req.body.idempotencyKey,confirmed:req.body.confirmed===true,confirmDestructive:Boolean(req.body.confirmDestructive)}));}catch(error){audit(req,'ai.plan.execution_failed',{outcome:'failure',targetType:'ai_plan',targetId:req.params.id,metadata:{reason:error.code||'AI_EXECUTION_FAILED'}});return sendError(res,error,'AI_EXECUTION_FAILED');}});
router.post('/plans/:id/undo',requireUser,requirePasswordChanged,(req,res)=>{try{return res.json(undoPlan({id:req.params.id,actor:req.auth.user,req,idempotencyKey:req.body.idempotencyKey}));}catch(error){audit(req,'ai.plan.undo_failed',{outcome:'failure',targetType:'ai_plan',targetId:req.params.id,metadata:{reason:error.code||'AI_UNDO_FAILED'}});return sendError(res,error,'AI_UNDO_FAILED');}});
router.get('/status',(req,res)=>{const {getEffectiveAiConfig}=require('../services/settingsService');res.json({configured:Boolean(getEffectiveAiConfig().apiKey),personalEnabled:personalEnabled(),canAccessWorkspace:req.auth?.user?.role==='admin'});});
router.get('/conversations',requireAdmin,requirePasswordChanged,(req,res)=>res.json(conversations.list(req.auth.user)));
router.post('/conversations',requireAdmin,requirePasswordChanged,(req,res)=>{try{const scope=req.body.scope==='public'?'public':'personal';return res.status(201).json(conversations.create(req.auth.user,realm(scope,scope==='personal'?req.auth.user.id:null),req.body.title));}catch(error){return sendError(res,error,'AI_CONVERSATION_FAILED');}});
router.get('/conversations/:id',requireAdmin,requirePasswordChanged,(req,res)=>{const conversation=conversations.get(req.params.id,req.auth.user),messages=conversations.messages(req.params.id,req.auth.user);return conversation&&messages?res.json({...conversations.serialize(conversation),messages}):res.status(404).json({code:'AI_CONVERSATION_NOT_FOUND',error:'对话不存在'});});
module.exports=router;
