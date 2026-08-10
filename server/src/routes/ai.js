const express=require('express');
const crypto=require('crypto');
const {requestCommands,requestDiscussion,requestDiscussionStream}=require('../services/ai/openAiCompatibleProvider');
const {createPlan,serializePlan,loadPlan}=require('../services/ai/planService');
const {executePlan,undoPlan}=require('../services/ai/commandExecutor');
const {getSetting}=require('../services/settingsService');
const {requireAdmin,requireUser,requirePasswordChanged}=require('../middleware/auth');
const {realm,createNavigationService}=require('../services/navigationService');
const {audit}=require('../services/eventService');
const {createConversationService}=require('../services/ai/conversationService');
const {buildPlannerContext}=require('../services/ai/plannerContext');
const db=require('../db'),navigation=createNavigationService(db),conversations=createConversationService(db);
const router=express.Router();
function personalEnabled(){return getSetting('ai_personal_enabled','false')==='true';}
function sendError(res,error,fallback='AI_UPSTREAM_REQUEST_FAILED'){return res.status(error.status||502).json({code:error.code||fallback,error:error.message||'AI 操作失败'});}
function plannerContext(current,text){return buildPlannerContext({categories:navigation.listCategories(current),items:navigation.listItems(current),text});}
async function plan(req,res,scope){const text=String(req.body.text||'').trim();if(!text)return res.status(400).json({code:'AI_TEXT_REQUIRED',error:'请输入描述内容'});try{const current=realm(scope,scope==='personal'?req.auth.user.id:null),locale=req.body.locale==='en'?'en':'zh-CN',conversationId=req.body.conversationId||null;let history=[];if(conversationId){const conversation=conversations.get(conversationId,req.auth.user);if(!conversation||conversation.realm_scope!==scope)throw Object.assign(new Error('对话不存在或空间不匹配'),{code:'AI_CONVERSATION_NOT_FOUND',status:404});history=conversations.messages(conversationId,req.auth.user)||[];conversations.append(conversationId,req.auth.user,{role:'user',content:text});}const result=await requestCommands(text,{locale,context:plannerContext(current,text),history,actorId:req.auth.user.id}),value=createPlan({actor:req.auth.user,current,locale,text,commands:result.commands,model:result.model,summary:result.summary,suggestions:result.suggestions});if(conversationId)conversations.append(conversationId,req.auth.user,{role:'assistant',content:result.summary||`${value.operations.length} 项操作计划`,planId:value.id,metadata:{suggestions:result.suggestions,operationCount:value.operations.length}});audit(req,'ai.plan.created',{targetType:'ai_plan',targetId:value.id,metadata:{scope,conversationId,operationTypes:value.operations.map(x=>x.op),operationCount:value.operations.length,inputHash:crypto.createHash('sha256').update(text).digest('hex')}});return res.status(201).json({...value,conversationId});}catch(error){audit(req,'ai.plan.failed',{outcome:'failure',targetType:'ai_plan',metadata:{scope,reason:error.code||'AI_PLAN_FAILED'}});return sendError(res,error,'AI_PLAN_FAILED');}}
async function discuss(req,res,scope){const text=String(req.body.text||'').trim();if(!text)return res.status(400).json({code:'AI_TEXT_REQUIRED',error:'请输入讨论内容'});try{const current=realm(scope,scope==='personal'?req.auth.user.id:null),locale=req.body.locale==='en'?'en':'zh-CN';let conversationId=req.body.conversationId||null,history=[];if(conversationId){const conversation=conversations.get(conversationId,req.auth.user);if(!conversation||conversation.realm_scope!==scope)throw Object.assign(new Error('对话不存在或空间不匹配'),{code:'AI_CONVERSATION_NOT_FOUND',status:404});history=conversations.messages(conversationId,req.auth.user)||[];}else conversationId=conversations.create(req.auth.user,current,text.slice(0,80)).id;conversations.append(conversationId,req.auth.user,{role:'user',content:text,metadata:{mode:'discussion'}});const result=await requestDiscussion(text,{locale,context:plannerContext(current,text),history,actorId:req.auth.user.id});conversations.append(conversationId,req.auth.user,{role:'assistant',content:result.answer,metadata:{mode:'discussion',model:result.model}});audit(req,'ai.discussion.created',{targetType:'ai_conversation',targetId:conversationId,metadata:{scope,inputHash:crypto.createHash('sha256').update(text).digest('hex'),model:result.model}});return res.status(201).json({conversationId,answer:result.answer,model:result.model});}catch(error){audit(req,'ai.discussion.failed',{outcome:'failure',targetType:'ai_conversation',targetId:req.body.conversationId||null,metadata:{scope,reason:error.code||'AI_DISCUSSION_FAILED'}});return sendError(res,error,'AI_DISCUSSION_FAILED');}}
async function streamDiscuss(req,res,scope){
  const text=String(req.body.text||'').trim();
  if(!text)return res.status(400).json({code:'AI_TEXT_REQUIRED',error:'请输入讨论内容'});
  const current=realm(scope,scope==='personal'?req.auth.user.id:null),locale=req.body.locale==='en'?'en':'zh-CN';
  let conversationId=req.body.conversationId||null,history=[];
  try{
    if(conversationId){
      const conversation=conversations.get(conversationId,req.auth.user);
      if(!conversation||conversation.realm_scope!==scope)throw Object.assign(new Error('对话不存在或空间不匹配'),{code:'AI_CONVERSATION_NOT_FOUND',status:404});
      history=conversations.messages(conversationId,req.auth.user)||[];
    }else conversationId=conversations.create(req.auth.user,current,text.slice(0,80)).id;
    conversations.append(conversationId,req.auth.user,{role:'user',content:text,metadata:{mode:'discussion'}});
  }catch(error){return sendError(res,error,'AI_DISCUSSION_FAILED');}
  res.status(200).set({'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no','Connection':'keep-alive'});
  res.flushHeaders?.();
  const write=value=>{if(!res.writableEnded&&!res.destroyed){res.write(`${JSON.stringify(value)}\n`);res.flush?.();}};
  const controller=new AbortController();
  res.on('close',()=>{if(!res.writableEnded)controller.abort();});
  write({type:'meta',conversationId});
  try{
    const result=await requestDiscussionStream(text,{locale,context:plannerContext(current,text),history,actorId:req.auth.user.id,signal:controller.signal,onDelta:content=>write({type:'delta',content})});
    conversations.append(conversationId,req.auth.user,{role:'assistant',content:result.answer,metadata:{mode:'discussion',model:result.model,streamed:true}});
    audit(req,'ai.discussion.created',{targetType:'ai_conversation',targetId:conversationId,metadata:{scope,inputHash:crypto.createHash('sha256').update(text).digest('hex'),model:result.model,streamed:true}});
    write({type:'done',conversationId,model:result.model});
  }catch(error){
    audit(req,'ai.discussion.failed',{outcome:'failure',targetType:'ai_conversation',targetId:conversationId,metadata:{scope,reason:error.code||'AI_DISCUSSION_FAILED',streamed:true}});
    write({type:'error',code:error.code||'AI_DISCUSSION_FAILED',message:error.message||'AI 流式请求失败'});
  }finally{if(!res.writableEnded)res.end();}
}
router.post('/public/plans',requireAdmin,requirePasswordChanged,(req,res)=>plan(req,res,'public'));
router.post('/personal/plans',requireUser,requirePasswordChanged,(req,res)=>{if(!personalEnabled())return res.status(403).json({code:'AI_PERSONAL_DISABLED',error:'管理员尚未开启个人空间的 AI 资源操作'});return plan(req,res,'personal');});
router.post('/public/discussions',requireUser,requirePasswordChanged,(req,res)=>discuss(req,res,'public'));
router.post('/personal/discussions',requireUser,requirePasswordChanged,(req,res)=>{if(!personalEnabled())return res.status(403).json({code:'AI_PERSONAL_DISABLED',error:'管理员尚未开启个人空间的 AI 能力'});return discuss(req,res,'personal');});
router.post('/public/discussions/stream',requireUser,requirePasswordChanged,(req,res)=>streamDiscuss(req,res,'public'));
router.post('/personal/discussions/stream',requireUser,requirePasswordChanged,(req,res)=>{if(!personalEnabled())return res.status(403).json({code:'AI_PERSONAL_DISABLED',error:'管理员尚未开启个人空间的 AI 能力'});return streamDiscuss(req,res,'personal');});
router.get('/plans/:id',requireUser,requirePasswordChanged,(req,res)=>{try{return res.json(serializePlan(loadPlan(req.params.id,req.auth.user)));}catch(error){return sendError(res,error,'AI_PLAN_NOT_FOUND');}});
router.post('/plans/:id/execute',requireUser,requirePasswordChanged,(req,res)=>{try{return res.json(executePlan({id:req.params.id,actor:req.auth.user,req,idempotencyKey:req.body.idempotencyKey,confirmed:req.body.confirmed===true,confirmDestructive:Boolean(req.body.confirmDestructive)}));}catch(error){audit(req,'ai.plan.execution_failed',{outcome:'failure',targetType:'ai_plan',targetId:req.params.id,metadata:{reason:error.code||'AI_EXECUTION_FAILED'}});return sendError(res,error,'AI_EXECUTION_FAILED');}});
router.post('/plans/:id/undo',requireUser,requirePasswordChanged,(req,res)=>{try{return res.json(undoPlan({id:req.params.id,actor:req.auth.user,req,idempotencyKey:req.body.idempotencyKey}));}catch(error){audit(req,'ai.plan.undo_failed',{outcome:'failure',targetType:'ai_plan',targetId:req.params.id,metadata:{reason:error.code||'AI_UNDO_FAILED'}});return sendError(res,error,'AI_UNDO_FAILED');}});
router.get('/status',(req,res)=>{const {getEffectiveAiConfig}=require('../services/settingsService');res.json({configured:Boolean(getEffectiveAiConfig().apiKey),personalEnabled:personalEnabled()});});
router.get('/conversations',requireUser,requirePasswordChanged,(req,res)=>res.json(conversations.list(req.auth.user)));
router.post('/conversations',requireUser,requirePasswordChanged,(req,res)=>{try{const scope=req.body.scope==='public'?'public':'personal';return res.status(201).json(conversations.create(req.auth.user,realm(scope,scope==='personal'?req.auth.user.id:null),req.body.title));}catch(error){return sendError(res,error,'AI_CONVERSATION_FAILED');}});
router.get('/conversations/:id',requireUser,requirePasswordChanged,(req,res)=>{const conversation=conversations.get(req.params.id,req.auth.user),messages=conversations.messages(req.params.id,req.auth.user);return conversation&&messages?res.json({...conversations.serialize(conversation),messages}):res.status(404).json({code:'AI_CONVERSATION_NOT_FOUND',error:'对话不存在'});});
module.exports=router;
