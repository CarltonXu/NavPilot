const express=require('express');
const db=require('../db');
const {checkAndPersist,checkItems}=require('../services/healthCheck');
const {requireUser,requireAdmin,requirePasswordChanged}=require('../middleware/auth');
const {auditWith,analytics}=require('../services/eventService');
const {createNavigationService,realm}=require('../services/navigationService');
const {createUrlMetadataService}=require('../services/urlMetadataService');
const router=express.Router();const navigation=createNavigationService(db),urlMetadata=createUrlMetadataService();
function authorizeScope(req,res,scope,next){if(scope==='public')return requireAdmin(req,res,()=>requirePasswordChanged(req,res,next));if(scope==='personal')return requireUser(req,res,()=>requirePasswordChanged(req,res,next));return res.status(400).json({code:'INVALID_SCOPE',error:'无效空间范围'});}
function currentRealm(req,scope){return realm(scope,scope==='personal'?req.auth.user.id:null);}
function sendError(res,error,fallback){return res.status(error.status||500).json({code:error.code||fallback,error:error.status?error.message:'操作失败'});}
function visibleItem(req,id){const item=db.prepare('SELECT * FROM items WHERE id=?').get(id);if(!item||item.scope==='personal'&&req.auth?.user?.id!==item.owner_id)return null;return item;}
function loadAndAuthorize(req,res,next){const item=db.prepare('SELECT * FROM items WHERE id=?').get(req.params.id);if(!item)return res.status(404).json({code:'ITEM_NOT_FOUND',error:'条目不存在'});req.item=item;return authorizeScope(req,res,item.scope,()=>{if(item.scope==='personal'&&item.owner_id!==req.auth.user.id)return res.status(404).json({code:'ITEM_NOT_FOUND',error:'条目不存在'});next();});}
async function bulkMetadata(req,res){
  try{
    const ids=[...new Set((Array.isArray(req.body.ids)?req.body.ids:[]).map(Number))];
    if(!ids.length)throw Object.assign(new Error('请选择至少一个资源'),{code:'ITEM_IDS_REQUIRED',status:400});
    if(ids.length>500||ids.some(id=>!Number.isInteger(id)||id<=0))throw Object.assign(new Error('每次最多识别 500 个资源'),{code:'ITEM_IDS_INVALID',status:400});
    const current=currentRealm(req,req.body.scope),items=ids.map(id=>navigation.getItem(current,id));
    const results=new Array(items.length);let cursor=0;
    async function worker(){
      while(true){
        const index=cursor++;
        if(index>=items.length)return;
        const item=items[index];
        try{results[index]={item,metadata:await urlMetadata.fetchPage(item.url,{allowPrivate:req.auth.user.role==='admin'})};}
        catch(error){results[index]={item,error};}
      }
    }
    await Promise.all(Array.from({length:Math.min(12,items.length)},worker));
    const successful=results.filter(result=>result.metadata),failures=results.filter(result=>result.error),updates=[];
    for(const {item,metadata} of successful){
      try{updates.push(db.transaction(()=>navigation.updateItem(current,item.id,{name:metadata.name||item.name,description:metadata.description||item.description,icon:metadata.icon||item.icon,expectedVersion:item.version}))());}
      catch(error){failures.push({item,error});}
    }
    db.transaction(()=>auditWith(db,req,'item.bulk_metadata_updated',{targetType:'items',metadata:{scope:current.scope,requestedCount:items.length,updatedCount:updates.length,failedCount:failures.length,affectedIds:updates.map(value=>value.value.id),changes:updates.map(value=>({id:value.value.id,before:value.before,after:value.after,changedFields:value.changedFields})),failures:failures.map(({item,error})=>({id:item.id,name:item.name,code:error.code||'URL_METADATA_FAILED'}))}}))();
    return res.json({totalCount:items.length,updatedCount:updates.length,failedCount:failures.length,items:updates.map(value=>value.value),failures:failures.map(({item,error})=>({id:item.id,name:item.name,code:error.code||'URL_METADATA_FAILED',error:error.status?error.message:'网站信息识别失败'}))});
  }catch(error){return sendError(res,error,'ITEM_BULK_METADATA_FAILED');}
}
router.get('/',(req,res)=>{const scope=req.query.scope||'public';if(scope==='personal'&&!req.auth?.user)return res.status(401).json({code:'AUTH_REQUIRED',error:'请先登录'});try{return res.json(navigation.listItems(currentRealm(req,scope)));}catch(error){return sendError(res,error,'ITEM_LIST_FAILED');}});
router.post('/metadata',(req,res)=>authorizeScope(req,res,req.body.scope,async()=>{try{return res.json(await urlMetadata.fetchPage(req.body.url,{allowPrivate:req.auth.user.role==='admin'}));}catch(error){return sendError(res,error,'URL_METADATA_FAILED');}}));
router.post('/bulk-metadata',(req,res)=>authorizeScope(req,res,req.body.scope,()=>bulkMetadata(req,res)));
router.post('/',(req,res)=>authorizeScope(req,res,req.body.scope,()=>{try{const current=currentRealm(req,req.body.scope);const result=db.transaction(()=>{const value=navigation.createItem(current,req.body);auditWith(db,req,'item.created',{targetType:'item',targetId:value.value.id,metadata:{scope:current.scope,after:value.after}});return value;})();res.status(201).json(result.value);if(result.value.check_enabled)checkAndPersist(result.value).catch(()=>{});}catch(error){return sendError(res,error,'ITEM_CREATE_FAILED');}}));
function update(req,res){try{const current=currentRealm(req,req.item.scope);const result=db.transaction(()=>{const value=navigation.updateItem(current,req.item.id,req.body);auditWith(db,req,value.moved?'item.moved':'item.updated',{targetType:'item',targetId:req.item.id,metadata:{scope:current.scope,changedFields:value.changedFields,before:value.before,after:value.after}});return value;})();return res.json(result.value);}catch(error){return sendError(res,error,'INVALID_ITEM_UPDATE');}}
router.patch('/:id',loadAndAuthorize,update);router.put('/:id',loadAndAuthorize,update);
router.delete('/:id',loadAndAuthorize,(req,res)=>{try{const current=currentRealm(req,req.item.scope);const result=db.transaction(()=>{const value=navigation.deleteItem(current,req.item.id,{expectedVersion:req.body?.expectedVersion});auditWith(db,req,'item.deleted',{targetType:'item',targetId:req.item.id,metadata:{scope:current.scope,before:value.before}});return value;})();return res.json(result.value);}catch(error){return sendError(res,error,'ITEM_DELETE_FAILED');}});
router.post('/bulk-delete',(req,res)=>authorizeScope(req,res,req.body.scope,()=>{try{const current=currentRealm(req,req.body.scope);const result=db.transaction(()=>{const value=navigation.bulkDeleteItems(current,req.body.ids);auditWith(db,req,'item.bulk_deleted',{targetType:'items',metadata:{scope:current.scope,affectedCount:value.value.deletedCount,affectedIds:value.value.deletedIds,before:value.before}});return value;})();return res.json(result.value);}catch(error){return sendError(res,error,'ITEM_BULK_DELETE_FAILED');}}));
router.post('/bulk-update',(req,res)=>authorizeScope(req,res,req.body.scope,()=>{try{const current=currentRealm(req,req.body.scope);const result=db.transaction(()=>{const values=navigation.bulkUpdateItems(current,req.body.ids,req.body.patch||{});auditWith(db,req,'item.bulk_updated',{targetType:'items',metadata:{scope:current.scope,affectedCount:values.length,affectedIds:values.map(v=>v.value.id),changes:values.map(v=>({id:v.value.id,before:v.before,after:v.after,changedFields:v.changedFields}))}});return values;})();return res.json({items:result.map(v=>v.value)});}catch(error){return sendError(res,error,'ITEM_BULK_UPDATE_FAILED');}}));
router.post('/reorder',(req,res)=>authorizeScope(req,res,req.body.scope,()=>{try{const current=currentRealm(req,req.body.scope);const result=db.transaction(()=>{const value=navigation.reorderItems(current,req.body.categoryId??null,req.body.orderedIds);auditWith(db,req,'item.reordered',{targetType:'item_order',metadata:{scope:current.scope,before:value.before,after:value.after}});return value;})();return res.json(result.value);}catch(error){return sendError(res,error,'ITEM_REORDER_FAILED');}}));
router.post('/:id/click',(req,res)=>{const item=visibleItem(req,req.params.id);if(!item)return res.status(404).json({code:'ITEM_NOT_FOUND',error:'条目不存在'});const surface=['portal-card','portal-compact','portal-dense','assistant-search','global-search'].includes(req.body?.surface)?req.body.surface:'portal-card';const inserted=analytics(req,'item.clicked',{itemId:item.id,categoryId:item.category_id,scope:item.scope,surface,viewMode:req.body?.viewMode,eventId:req.body?.eventId,resource:item,properties:{position:Number(req.body?.position)||null}});if(inserted)db.prepare('UPDATE items SET click_count=click_count+1 WHERE id=?').run(item.id);res.json({click_count:db.prepare('SELECT click_count FROM items WHERE id=?').get(item.id).click_count});});
router.post('/:id/check',loadAndAuthorize,async(req,res)=>res.json(await checkAndPersist(req.item)));
router.post('/check-all',(req,res)=>authorizeScope(req,res,req.body.scope,async()=>res.json(await checkItems({scope:req.body.scope,ownerId:req.body.scope==='personal'?req.auth.user.id:null}))));
module.exports=router;
