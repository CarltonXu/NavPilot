const test=require('node:test');
const assert=require('node:assert/strict');

process.env.NAVPILOT_DB_PATH=':memory:';
process.env.NODE_ENV='test';

const db=require('../src/db');
const{createApp}=require('../src/index');
const{createUser}=require('../src/services/authService');
const{createSession}=require('../src/services/sessionService');
const{createNavigationService,realm}=require('../src/services/navigationService');
const{setSetting}=require('../src/services/settingsService');

test('public insights enforces access and exposes only privacy-safe public aggregates',async(t)=>{
  const navigation=createNavigationService(db);
  const initialPublicResources=db.prepare("SELECT COUNT(*) count FROM items WHERE scope='public'").get().count;
  const category=navigation.createCategory(realm('public'),{name:'Public engineering'}).value;
  const item=navigation.createItem(realm('public'),{name:'Public Git',url:'https://git.example',category_id:category.id,tags:['engineering']}).value;
  const user=await createUser({username:'insights-user',displayName:'Insights User',password:'Strong-insights-password',mustChangePassword:false});
  const session=createSession(user.id);
  const personal=navigation.createItem(realm('personal',user.id),{name:'Private secret',url:'https://private.example',tags:['secret']}).value;
  const now=Date.now();
  db.prepare("INSERT INTO analytics_events(id,occurred_at_ms,event_name,user_id,item_id,category_id,scope,surface,properties_json) VALUES(?,?,?,?,?,?,?,?,?)").run('click-public',now-1000,'item.clicked',user.id,item.id,category.id,'public','portal-card','{}');
  db.prepare("INSERT INTO analytics_events(id,occurred_at_ms,event_name,user_id,item_id,scope,surface,properties_json) VALUES(?,?,?,?,?,?,?,?)").run('click-private',now-900,'item.clicked',user.id,personal.id,'personal','portal-card','{}');
  for(const [index,term] of ['engineering','engineering','person@example.com','person@example.com'].entries()){
    const id=`search-event-${index}`;
    db.prepare("INSERT INTO analytics_events(id,occurred_at_ms,event_name,user_id,scope,surface,properties_json) VALUES(?,?,?,?,?,?,?)").run(id,now-800+index,'search.performed',user.id,null,'global-search',JSON.stringify({term,resultCount:1,publicResultCount:1,personalResultCount:0}));
    db.prepare("INSERT INTO analytics_events(id,occurred_at_ms,event_name,user_id,item_id,category_id,scope,surface,properties_json) VALUES(?,?,?,?,?,?,?,?,?)").run(`search-click-${index}`,now-700+index,'search.result_clicked',user.id,item.id,category.id,'public','global-search',JSON.stringify({searchEventId:id,term,position:1,resultScope:'public',publicResultClicked:true,publicClickPosition:1}));
  }
  setSetting('public_insights_enabled','true');setSetting('public_insights_anonymous_enabled','false');setSetting('public_insights_search_min_count','2');
  const server=createApp().listen(0);await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  let response=await fetch(`${base}/api/insights/public?days=30`);assert.equal(response.status,401);
  response=await fetch(`${base}/api/insights/public?days=30`,{headers:{cookie:`navpilot_session=${session.rawToken}`}});assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.summary.resources,initialPublicResources+1);assert.equal(result.summary.opens,1);assert.equal(result.topResources.some(row=>row.id===personal.id),false);
  assert.deepEqual(result.search.terms.map(row=>row.name),['engineering']);
  assert.equal(JSON.stringify(result).includes('person@example.com'),false);assert.equal(JSON.stringify(result).includes(user.id),false);
  setSetting('public_insights_enabled','false');
  response=await fetch(`${base}/api/insights/public`,{headers:{cookie:`navpilot_session=${session.rawToken}`}});assert.equal(response.status,404);
});

test.after(()=>db.close());
