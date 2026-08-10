const test=require('node:test');
const assert=require('node:assert/strict');
process.env.NAVPILOT_DB_PATH=':memory:';
const db=require('../src/db');
const{createNavigationService,realm}=require('../src/services/navigationService');
const{createJobService}=require('../src/services/ai/jobService');
const{createConversationService}=require('../src/services/ai/conversationService');
const{cosine}=require('../src/services/ai/embeddingService');

function actor(id='ai-intelligence-user',role='user'){db.prepare("INSERT OR IGNORE INTO users(id,username,display_name,role,status,must_change_password,preferences_json) VALUES(?,?,?,?,'active',0,'{}')").run(id,id,id,role);return{id,role};}

test('AI infrastructure keeps durable jobs and conversations isolated by realm',async()=>{
  const user=actor(),current=realm('personal',user.id),navigation=createNavigationService(db),category=navigation.createCategory(current,{name:'Engineering'}).value;
  navigation.createItem(current,{name:'https://docs.example.com',url:'https://docs.example.com',category_id:category.id,description:'',tags:[]});
  navigation.createItem(current,{name:'Duplicate docs',url:'https://docs.example.com/',description:'',tags:[]});
  for(const table of['ai_jobs','resource_embeddings','ai_conversations','ai_messages','ai_reports','notifications','ai_usage_events','ai_domain_policies'])assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table),table);
  const jobs=createJobService(db);jobs.register('embedding_index',async({progress})=>{progress(1,1);return{resourceCount:2,indexedCount:2};});const queued=jobs.enqueue({actor:user,kind:'embedding_index',realm:current});await jobs.processQueue();const completed=jobs.get(queued.id,user);assert.equal(completed.status,'succeeded');assert.equal(completed.result.resourceCount,2);
  const conversations=createConversationService(db),conversation=conversations.create(user,current,'整理文档');conversations.append(conversation.id,user,{role:'user',content:'整理重复资源'});conversations.append(conversation.id,user,{role:'assistant',content:'已生成计划'});assert.equal(conversations.messages(conversation.id,user).length,2);assert.equal(conversations.messages(conversation.id,{id:'other'}),null);
});

test('cosine similarity ranks aligned vectors above unrelated vectors',()=>{assert.ok(cosine([1,0,0],[.9,.1,0])>cosine([1,0,0],[0,1,0]));});
