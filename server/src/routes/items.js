const express=require('express');
const db=require('../db');
const {checkAndPersist,checkItems}=require('../services/healthCheck');
const {requireUser,requirePasswordChanged,authorizeRealm}=require('../middleware/auth');
const {auditWith,analytics}=require('../services/eventService');
const {createNavigationService,realm}=require('../services/navigationService');
const {createUrlMetadataService}=require('../services/urlMetadataService');
const {iconCacheUrl,presentItem}=require('../services/itemPresentation');
const {createIconCacheService}=require('../services/iconCacheService');
const {createAccessControlService}=require('../services/accessControlService');
const {availabilityForItems,clampDays}=require('../services/availabilityService');
const router=express.Router();const navigation=createNavigationService(db),urlMetadata=createUrlMetadataService(),access=createAccessControlService(db);
const iconCache=createIconCacheService();
const clickWindows=new Map(),CLICK_WINDOW_MS=60_000,CLICK_TOTAL_LIMIT=120,CLICK_ITEM_LIMIT=12;
const{scheduleIndex}=require('../services/ai/runtime');
router.use((req,res,next)=>{if(!['GET','HEAD'].includes(req.method))res.on('finish',()=>{if(res.statusCode<400){const scope=req.body?.scope||req.item?.scope;if(['public','personal'].includes(scope)&&req.auth?.user)scheduleIndex(req.auth.user,currentRealm(req,scope));}});next();});
function authorizeScope(req,res,scope,next){if(scope==='public')return authorizeRealm(req,res,realm('public'),'manage',()=>requirePasswordChanged(req,res,next));if(scope==='personal')return requireUser(req,res,()=>authorizeRealm(req,res,realm('personal',req.auth.user.id),'manage',()=>requirePasswordChanged(req,res,next)));return res.status(400).json({code:'INVALID_SCOPE',error:'无效空间范围'});}
function currentRealm(req,scope){return realm(scope,scope==='personal'?req.auth.user.id:null);}
function sendError(res,error,fallback){return res.status(error.status||500).json({code:error.code||fallback,error:error.status?error.message:'操作失败'});}
function visibleItem(req,id){return access.getVisibleItem(req.auth?.user, id);}
function allowClick(req,itemId){const now=Date.now(),identity=req.auth?.user?.id||String(req.ip||'anonymous'),totalKey=`${identity}:*`,itemKey=`${identity}:${itemId}`;if(clickWindows.size>5000)for(const[key,times]of clickWindows)if(!times.some(time=>now-time<CLICK_WINDOW_MS))clickWindows.delete(key);const recent=key=>(clickWindows.get(key)||[]).filter(time=>now-time<CLICK_WINDOW_MS),total=recent(totalKey),item=recent(itemKey);if(total.length>=CLICK_TOTAL_LIMIT||item.length>=CLICK_ITEM_LIMIT)return false;total.push(now);item.push(now);clickWindows.set(totalKey,total);clickWindows.set(itemKey,item);return true;}
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
router.get('/',(req,res)=>{const scope=req.query.scope||'public';if(scope==='personal'&&!req.auth?.user)return res.status(401).json({code:'AUTH_REQUIRED',error:'请先登录'});try{const items=access.filterVisibleItems(req.auth?.user,navigation.listItems(currentRealm(req,scope)));if(!req.auth?.user)return res.json(items.map(item=>presentItem({...item,is_favorite:false,favorite_at_ms:null})));const favorites=new Map(db.prepare('SELECT item_id,created_at_ms FROM user_favorites WHERE user_id=?').all(req.auth.user.id).map(row=>[row.item_id,row.created_at_ms]));return res.json(items.map(item=>presentItem({...item,is_favorite:favorites.has(item.id),favorite_at_ms:favorites.get(item.id)||null})));}catch(error){return sendError(res,error,'ITEM_LIST_FAILED');}});
router.post('/availability-summaries',(req,res)=>{try{const ids=[...new Set((Array.isArray(req.body?.ids)?req.body.ids:[]).map(Number))];if(!ids.length)return res.json({days:clampDays(req.body?.days),items:[]});if(ids.length>500||ids.some(id=>!Number.isInteger(id)||id<=0))return res.status(400).json({code:'ITEM_IDS_INVALID',error:'每次最多查询 500 个资源'});const placeholders=ids.map(()=>'?').join(','),visibility=access.sqlVisibility('i',req.auth?.user),rows=db.prepare(`SELECT i.*,c.name categoryName FROM items i LEFT JOIN categories c ON c.id=i.category_id WHERE i.id IN (${placeholders}) AND ${visibility.sql}`).all(...ids,...visibility.params);return res.json({days:clampDays(req.body?.days),items:availabilityForItems(db,rows,{days:req.body?.days})});}catch(error){return sendError(res,error,'AVAILABILITY_LOAD_FAILED');}});
router.get('/:id/availability',(req,res)=>{try{const item=visibleItem(req,req.params.id);if(!item)return res.status(404).json({code:'ITEM_NOT_FOUND',error:'条目不存在'});const category=item.category_id?db.prepare('SELECT name FROM categories WHERE id=?').get(item.category_id):null;const [value]=availabilityForItems(db,[{...item,categoryName:category?.name||null}],{days:req.query.days,includeDetails:true});return res.json(value);}catch(error){return sendError(res,error,'AVAILABILITY_LOAD_FAILED');}});
async function sendCachedIcon(res,item){
  try{
    const cached=await iconCache.resolve(item.icon);
    res.set({
      'Cache-Control':item.scope==='public'&&item.visibility==='public'?'public, max-age=86400, stale-while-revalidate=604800':'private, max-age=86400, stale-while-revalidate=604800',
      'Content-Type':cached.type,
      'Content-Security-Policy':"default-src 'none'; sandbox",
      'X-Content-Type-Options':'nosniff',
    });
    return res.sendFile(cached.path);
  }catch(error){
    return res.status(error.status||502).json({code:error.code||'ICON_FETCH_FAILED',error:error.status?error.message:'图标暂时无法获取'});
  }
}
router.get('/icon-cache/:digest',async(req,res)=>{
  const digest=String(req.params.digest||'');
  if(!/^[a-f0-9]{16}$/.test(digest))return res.status(404).json({code:'ITEM_ICON_NOT_FOUND',error:'图标不存在'});
  const rows=access.filterVisibleItems(req.auth?.user,db.prepare("SELECT id,icon,scope,owner_id,visibility FROM items WHERE icon LIKE 'http%' ORDER BY CASE scope WHEN 'public' THEN 0 ELSE 1 END").all()),item=rows.find(value=>iconCacheUrl(value)?.endsWith(`/${digest}`));
  if(!item)return res.status(404).json({code:'ITEM_ICON_NOT_FOUND',error:'图标不存在'});
  return sendCachedIcon(res,item);
});
router.get('/:id/icon',async(req,res)=>{const item=visibleItem(req,req.params.id);if(!item)return res.status(404).json({code:'ITEM_NOT_FOUND',error:'条目不存在'});if(!/^https?:\/\//i.test(String(item.icon||'')))return res.status(404).json({code:'ITEM_ICON_NOT_REMOTE',error:'该条目没有远程图标'});return sendCachedIcon(res,item);});
router.post('/metadata',(req,res)=>authorizeScope(req,res,req.body.scope,async()=>{try{return res.json(await urlMetadata.fetchPage(req.body.url,{allowPrivate:req.auth.user.role==='admin'}));}catch(error){return sendError(res,error,'URL_METADATA_FAILED');}}));
router.post('/bulk-metadata',(req,res)=>authorizeScope(req,res,req.body.scope,()=>bulkMetadata(req,res)));
router.post('/',(req,res)=>authorizeScope(req,res,req.body.scope,()=>{try{const current=currentRealm(req,req.body.scope);const result=db.transaction(()=>{const value=navigation.createItem(current,req.body);if(current.scope==='public'){const template=req.body.access||access.inheritedCategoryAccess(value.value.category_id);access.replaceItemAccess(value.value.id,template,req.auth.user,{incrementVersion:false});value.value=navigation.getItem(current,value.value.id);}auditWith(db,req,'item.created',{targetType:'item',targetId:value.value.id,metadata:{scope:current.scope,after:value.after,access:current.scope==='public'?access.itemAccess(value.value.id):null}});return value;})();res.status(201).json(result.value);if(result.value.check_enabled)checkAndPersist(result.value).catch(()=>{});}catch(error){return sendError(res,error,'ITEM_CREATE_FAILED');}}));
function update(req,res){try{const current=currentRealm(req,req.item.scope);const result=db.transaction(()=>{const value=navigation.updateItem(current,req.item.id,req.body);if(current.scope==='public'&&req.body.access){access.replaceItemAccess(req.item.id,{...req.body.access,expectedVersion:undefined},req.auth.user,{incrementVersion:false});value.value=navigation.getItem(current,req.item.id);}auditWith(db,req,value.moved?'item.moved':'item.updated',{targetType:'item',targetId:req.item.id,metadata:{scope:current.scope,changedFields:value.changedFields,before:value.before,after:value.after,access:req.body.access||undefined}});return value;})();
  // A newly enabled (or reconfigured) monitor should have a sample immediately;
  // otherwise the portal can legitimately show an empty timeline until cron's
  // next five-minute tick.
  const monitoringChanged = ['url','checkMethod','checkTarget','checkEnabled'].some((field)=>result.changedFields.includes(field));
  if(result.value.check_enabled && monitoringChanged) checkAndPersist(result.value).catch(()=>{});
  return res.json(result.value);}catch(error){return sendError(res,error,'INVALID_ITEM_UPDATE');}}
router.get('/:id/access',loadAndAuthorize,(req,res)=>{try{return res.json(access.itemAccess(req.item.id));}catch(error){return sendError(res,error,'ITEM_ACCESS_LOAD_FAILED');}});
router.put('/:id/access',loadAndAuthorize,(req,res)=>{try{const value=db.transaction(()=>{const result=access.replaceItemAccess(req.item.id,req.body,req.auth.user);auditWith(db,req,'item.access_updated',{targetType:'item',targetId:req.item.id,metadata:{visibility:result.visibility,grants:result.grants.map(({type,id,expiresAtMs})=>({type,id,expiresAtMs}))}});return result;})();return res.json(value);}catch(error){return sendError(res,error,'ITEM_ACCESS_UPDATE_FAILED');}});
router.put('/:id/favorite',requireUser,requirePasswordChanged,(req,res)=>{try{const item=visibleItem(req,req.params.id);if(!item)return res.status(404).json({code:'ITEM_NOT_FOUND',error:'条目不存在'});if(typeof req.body?.favorite!=='boolean')return res.status(400).json({code:'INVALID_FAVORITE_STATE',error:'收藏状态无效'});if(req.body.favorite)db.prepare('INSERT OR IGNORE INTO user_favorites(user_id,item_id,created_at_ms) VALUES(?,?,?)').run(req.auth.user.id,item.id,Date.now());else db.prepare('DELETE FROM user_favorites WHERE user_id=? AND item_id=?').run(req.auth.user.id,item.id);const favorite=db.prepare('SELECT created_at_ms FROM user_favorites WHERE user_id=? AND item_id=?').get(req.auth.user.id,item.id);return res.json({itemId:item.id,favorite:Boolean(favorite),favoriteAtMs:favorite?.created_at_ms||null});}catch(error){return sendError(res,error,'FAVORITE_UPDATE_FAILED');}});
router.patch('/:id',loadAndAuthorize,update);router.put('/:id',loadAndAuthorize,update);
router.delete('/:id',loadAndAuthorize,(req,res)=>{try{const current=currentRealm(req,req.item.scope);const result=db.transaction(()=>{const value=navigation.deleteItem(current,req.item.id,{expectedVersion:req.body?.expectedVersion});auditWith(db,req,'item.deleted',{targetType:'item',targetId:req.item.id,metadata:{scope:current.scope,before:value.before}});return value;})();return res.json(result.value);}catch(error){return sendError(res,error,'ITEM_DELETE_FAILED');}});
router.post('/bulk-delete',(req,res)=>authorizeScope(req,res,req.body.scope,()=>{try{const current=currentRealm(req,req.body.scope);const result=db.transaction(()=>{const value=navigation.bulkDeleteItems(current,req.body.ids);auditWith(db,req,'item.bulk_deleted',{targetType:'items',metadata:{scope:current.scope,affectedCount:value.value.deletedCount,affectedIds:value.value.deletedIds,before:value.before}});return value;})();return res.json(result.value);}catch(error){return sendError(res,error,'ITEM_BULK_DELETE_FAILED');}}));
router.post('/bulk-update',(req,res)=>authorizeScope(req,res,req.body.scope,()=>{try{const current=currentRealm(req,req.body.scope);const result=db.transaction(()=>{const values=navigation.bulkUpdateItems(current,req.body.ids,req.body.patch||{});auditWith(db,req,'item.bulk_updated',{targetType:'items',metadata:{scope:current.scope,affectedCount:values.length,affectedIds:values.map(v=>v.value.id),changes:values.map(v=>({id:v.value.id,before:v.before,after:v.after,changedFields:v.changedFields}))}});return values;})();return res.json({items:result.map(v=>v.value)});}catch(error){return sendError(res,error,'ITEM_BULK_UPDATE_FAILED');}}));
router.post('/bulk-access',(req,res)=>authorizeScope(req,res,req.body.scope,()=>{try{if(req.body.scope!=='public')return res.status(400).json({code:'PUBLIC_SCOPE_REQUIRED',error:'只有公共空间资源支持授权'});const ids=[...new Set((Array.isArray(req.body.ids)?req.body.ids:[]).map(Number))];if(!ids.length||ids.length>500)return res.status(400).json({code:'ITEM_IDS_INVALID',error:'请选择 1 到 500 个资源'});const result=db.transaction(()=>{ids.forEach(id=>navigation.getItem(realm('public'),id));ids.forEach(id=>access.replaceItemAccess(id,req.body.access,req.auth.user));auditWith(db,req,'item.access_bulk_updated',{targetType:'items',metadata:{affectedIds:ids,visibility:req.body.access?.visibility}});return{updatedCount:ids.length,ids};})();return res.json(result);}catch(error){return sendError(res,error,'ITEM_BULK_ACCESS_FAILED');}}));
router.post('/reorder',(req,res)=>authorizeScope(req,res,req.body.scope,()=>{try{const current=currentRealm(req,req.body.scope);const result=db.transaction(()=>{const value=navigation.reorderItems(current,req.body.categoryId??null,req.body.orderedIds);auditWith(db,req,'item.reordered',{targetType:'item_order',metadata:{scope:current.scope,before:value.before,after:value.after}});return value;})();return res.json(result.value);}catch(error){return sendError(res,error,'ITEM_REORDER_FAILED');}}));
router.post('/:id/click',(req,res)=>{const item=visibleItem(req,req.params.id);if(!item)return res.status(404).json({code:'ITEM_NOT_FOUND',error:'条目不存在'});if(!allowClick(req,item.id))return res.status(429).json({code:'CLICK_RATE_LIMITED',error:'访问过于频繁，请稍后再试'});const surface=['portal-card','portal-compact','portal-overview','portal-favorite','assistant-search','global-search','public-insights'].includes(req.body?.surface)?req.body.surface:'portal-card';const searchEventId=/^search-[a-f0-9-]{36}$/.test(String(req.body?.searchEventId||''))?String(req.body.searchEventId):null;const position=Number(req.body?.position)||null;const inserted=analytics(req,'item.clicked',{itemId:item.id,categoryId:item.category_id,scope:item.scope,surface,viewMode:req.body?.viewMode,eventId:req.body?.eventId,resource:item,properties:{position,searchEventId}});if(inserted){db.prepare('UPDATE items SET click_count=click_count+1 WHERE id=?').run(item.id);if(surface==='global-search'&&searchEventId){const search=db.prepare("SELECT properties_json FROM analytics_events WHERE id=? AND event_name='search.performed'").get(searchEventId);let term='';try{term=JSON.parse(search?.properties_json||'{}').term||'';}catch{/* ignore malformed analytics metadata */}analytics(req,'search.result_clicked',{itemId:item.id,categoryId:item.category_id,scope:item.scope,surface,resource:item,properties:{searchEventId,term,position,resultScope:item.scope,publicResultClicked:item.scope==='public',publicClickPosition:item.scope==='public'?position:null}});}}res.json({click_count:db.prepare('SELECT click_count FROM items WHERE id=?').get(item.id).click_count});});
router.post('/:id/check',loadAndAuthorize,async(req,res)=>res.json(await checkAndPersist(req.item,{force:true})));
router.post('/check-all',(req,res)=>authorizeScope(req,res,req.body.scope,async()=>res.json(await checkItems({scope:req.body.scope,ownerId:req.body.scope==='personal'?req.auth.user.id:null,force:true}))));
module.exports=router;
