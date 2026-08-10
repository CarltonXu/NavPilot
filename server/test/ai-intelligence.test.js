const test=require('node:test');
const assert=require('node:assert/strict');
process.env.NAVPILOT_DB_PATH=':memory:';
const db=require('../src/db');
const{createNavigationService,realm}=require('../src/services/navigationService');
const{createIntelligenceService}=require('../src/services/ai/intelligenceService');
const{createJobService}=require('../src/services/ai/jobService');
const{createConversationService}=require('../src/services/ai/conversationService');
const{createContentIntelligenceService}=require('../src/services/ai/contentIntelligenceService');
const{cosine}=require('../src/services/ai/embeddingService');
const{setSetting}=require('../src/services/settingsService');
const{runProactiveReports}=require('../src/services/ai/proactiveReportService');

function actor(id='ai-intelligence-user',role='user'){db.prepare("INSERT OR IGNORE INTO users(id,username,display_name,role,status,must_change_password,preferences_json) VALUES(?,?,?,?,'active',0,'{}')").run(id,id,id,role);return{id,role};}

test('AI intelligence schema, scan, durable jobs, and conversations share realm isolation',async()=>{
  const user=actor(),current=realm('personal',user.id),navigation=createNavigationService(db),category=navigation.createCategory(current,{name:'Engineering'}).value;
  navigation.createItem(current,{name:'https://docs.example.com',url:'https://docs.example.com',category_id:category.id,description:'',tags:[]});
  navigation.createItem(current,{name:'Duplicate docs',url:'https://docs.example.com/',description:'',tags:[]});
  for(const table of['ai_jobs','resource_embeddings','ai_conversations','ai_messages','ai_reports','notifications','ai_usage_events','ai_domain_policies'])assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table),table);
  const scan=createIntelligenceService(db).scan(current);
  assert.equal(scan.resourceCount,2);assert.ok(scan.findings.some(row=>row.type==='duplicate'));assert.ok(scan.findings.some(row=>row.type==='uncategorized'));assert.ok(scan.findings.some(row=>row.type==='tags_missing'));
  const jobs=createJobService(db);jobs.register('organize',async({progress})=>{progress(1,1);return scan;});const queued=jobs.enqueue({actor:user,kind:'organize',realm:current});await jobs.processQueue();const completed=jobs.get(queued.id,user);assert.equal(completed.status,'succeeded');assert.equal(completed.result.resourceCount,2);
  const conversations=createConversationService(db),conversation=conversations.create(user,current,'整理文档');conversations.append(conversation.id,user,{role:'user',content:'整理重复资源'});conversations.append(conversation.id,user,{role:'assistant',content:'已生成计划'});assert.equal(conversations.messages(conversation.id,user).length,2);assert.equal(conversations.messages(conversation.id,{id:'other'}),null);
});

test('content permissions are opt-in and proactive reports are deduplicated',()=>{
  const user=actor('report-user'),admin=actor('report-admin','admin'),navigation=createNavigationService(db),personal=realm('personal',user.id);
  navigation.createItem(personal,{name:'Report resource',url:'https://private.example.net/docs',description:'Docs'});
  const content=createContentIntelligenceService(db),before=content.policies().find(row=>row.hostname==='private.example.net');assert.equal(Boolean(before.allowContent),false);assert.equal(Boolean(content.setPolicy(admin,'private.example.net',true).allowContent),true);
  setSetting('ai_proactive_reports_enabled','true');const first=runProactiveReports(Date.UTC(2026,7,10,9)),second=runProactiveReports(Date.UTC(2026,7,10,10));assert.ok(first.created>=1);assert.equal(second.created,0);assert.equal(db.prepare('SELECT COUNT(*) count FROM notifications WHERE user_id=?').get(user.id).count,1);
});

test('cosine similarity ranks aligned vectors above unrelated vectors',()=>{assert.ok(cosine([1,0,0],[.9,.1,0])>cosine([1,0,0],[0,1,0]));});
