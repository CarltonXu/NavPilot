const express=require('express');
const crypto=require('crypto');
const {requestCommands}=require('../services/ai/openAiCompatibleProvider');
const {createPlan,serializePlan,loadPlan}=require('../services/ai/planService');
const {executePlan,undoPlan}=require('../services/ai/commandExecutor');
const {getSetting}=require('../services/settingsService');
const {requireAdmin,requireUser,requirePasswordChanged}=require('../middleware/auth');
const {realm}=require('../services/navigationService');
const {audit}=require('../services/eventService');
const router=express.Router();
function personalEnabled(){return getSetting('ai_personal_enabled','false')==='true';}
function sendError(res,error,fallback='AI_UPSTREAM_REQUEST_FAILED'){return res.status(error.status||502).json({code:error.code||fallback,error:error.message||'AI 操作失败'});}
async function plan(req,res,scope){const text=String(req.body.text||'').trim();if(!text)return res.status(400).json({code:'AI_TEXT_REQUIRED',error:'请输入描述内容'});try{const current=realm(scope,scope==='personal'?req.auth.user.id:null);const locale=req.body.locale==='en'?'en':'zh-CN';const result=await requestCommands(text,{locale});const value=createPlan({actor:req.auth.user,current,locale,text,commands:result.commands,model:result.model,summary:result.summary,suggestions:result.suggestions});audit(req,'ai.plan.created',{targetType:'ai_plan',targetId:value.id,metadata:{scope,operationTypes:value.operations.map(x=>x.op),operationCount:value.operations.length,inputHash:crypto.createHash('sha256').update(text).digest('hex')}});return res.status(201).json(value);}catch(error){audit(req,'ai.plan.failed',{outcome:'failure',targetType:'ai_plan',metadata:{scope,reason:error.code||'AI_PLAN_FAILED'}});return sendError(res,error,'AI_PLAN_FAILED');}}
router.post('/public/plans',requireAdmin,requirePasswordChanged,(req,res)=>plan(req,res,'public'));
router.post('/personal/plans',requireUser,requirePasswordChanged,(req,res)=>{if(!personalEnabled())return res.status(403).json({code:'AI_PERSONAL_DISABLED',error:'管理员尚未开启个人空间的 AI 资源操作'});return plan(req,res,'personal');});
router.get('/plans/:id',requireUser,requirePasswordChanged,(req,res)=>{try{return res.json(serializePlan(loadPlan(req.params.id,req.auth.user)));}catch(error){return sendError(res,error,'AI_PLAN_NOT_FOUND');}});
router.post('/plans/:id/execute',requireUser,requirePasswordChanged,(req,res)=>{try{return res.json(executePlan({id:req.params.id,actor:req.auth.user,req,idempotencyKey:req.body.idempotencyKey,confirmed:req.body.confirmed===true,confirmDestructive:Boolean(req.body.confirmDestructive)}));}catch(error){audit(req,'ai.plan.execution_failed',{outcome:'failure',targetType:'ai_plan',targetId:req.params.id,metadata:{reason:error.code||'AI_EXECUTION_FAILED'}});return sendError(res,error,'AI_EXECUTION_FAILED');}});
router.post('/plans/:id/undo',requireUser,requirePasswordChanged,(req,res)=>{try{return res.json(undoPlan({id:req.params.id,actor:req.auth.user,req,idempotencyKey:req.body.idempotencyKey}));}catch(error){audit(req,'ai.plan.undo_failed',{outcome:'failure',targetType:'ai_plan',targetId:req.params.id,metadata:{reason:error.code||'AI_UNDO_FAILED'}});return sendError(res,error,'AI_UNDO_FAILED');}});
router.get('/status',(req,res)=>{const {getEffectiveAiConfig}=require('../services/settingsService');res.json({configured:Boolean(getEffectiveAiConfig().apiKey),personalEnabled:personalEnabled()});});
module.exports=router;
