const test=require('node:test');
const assert=require('node:assert/strict');
const axios=require('axios');
const{Readable}=require('node:stream');
process.env.NAVPILOT_DB_PATH=':memory:';
process.env.NODE_ENV='test';
const db=require('../src/db');
const{createApp}=require('../src/index');
const{createUser}=require('../src/services/authService');
const{createSession}=require('../src/services/sessionService');
const{setSetting}=require('../src/services/settingsService');
const{createNavigationService,realm}=require('../src/services/navigationService');

test('AI advisory discussions are separate from approval-gated public plans',async(t)=>{
  const member=await createUser({username:'advisor-admin',displayName:'Advisor Admin',password:'Strong-admin-password',role:'admin',mustChangePassword:false}),session=createSession(member.id);
  const regular=await createUser({username:'advisor-member',displayName:'Advisor Member',password:'Strong-member-password',mustChangePassword:false}),regularSession=createSession(regular.id);
  setSetting('ai_base_url','https://ai.example/v1');setSetting('ai_model','advisor');setSetting('ai_api_key','secret');
  let upstreamCalls=0;
  t.mock.method(axios,'post',async(_url,body)=>{
    upstreamCalls+=1;
    const system=body.messages[0].content;
    if(body.stream&&body.messages.at(-1)?.content==='测试上游中断'){
      async function* interrupted(){yield 'data: {"choices":[{"delta":{"content":"已生成但未完成"}}]}\n\n';throw Object.assign(new Error('stream has been aborted'),{code:'ERR_BAD_RESPONSE'});}
      return{data:Readable.from(interrupted())};
    }
    if(/自然语言指令解析器/.test(system))return{data:{choices:[{message:{content:JSON.stringify({kind:'report',title:'空间分类分析',report:{spaces:'all_visible'}})}}]}};
    if(/报告架构师/.test(system))return{data:{choices:[{message:{content:JSON.stringify({spec:{title:'AI 空间分类分析',description:'按空间、分类和可用状态分析资源。',spaces:'all_visible',filters:['space','category','status','text'],widgets:[{id:'resources',type:'kpi',title:'资源总数',metric:'resourceCount',width:'third'},{id:'categories',type:'kpi',title:'分类总数',metric:'categoryCount',width:'third'},{id:'category-bars',type:'bar',title:'分类资源分布',dimension:'category',metric:'resourceCount',width:'half',drilldown:true},{id:'status-donut',type:'donut',title:'可用状态',dimension:'status',metric:'resourceCount',width:'half'},{id:'details',type:'table',title:'资源明细',columns:['space','name','url','category','status'],width:'full'}]}})}}]}};
    if(/数据分析师/.test(system))return{data:{choices:[{message:{content:JSON.stringify({summary:'报告基于当前用户可见的真实资源生成。',findings:['公共空间和个人空间已分开统计。']})}}]}};
    assert.match(system,/资源管理顾问/);return{data:{choices:[{message:{content:'建议先讨论分类边界。\n\n建议下一步：确认后再转成执行方案。'}}]}};
  });
  const server=createApp().listen(0);await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`,request=async(path,body={})=>{const response=await fetch(`${base}${path}`,{method:'POST',headers:{'Content-Type':'application/json',cookie:`navpilot_session=${session.rawToken}`},body:JSON.stringify(body)});return{response,body:await response.json()};};
  const requestRegular=async(path,body={})=>{const response=await fetch(`${base}${path}`,{method:'POST',headers:{'Content-Type':'application/json',cookie:`navpilot_session=${regularSession.rawToken}`},body:JSON.stringify(body)});return{response,body:await response.json()};};
  const get=async(path)=>{const response=await fetch(`${base}${path}`,{headers:{cookie:`navpilot_session=${session.rawToken}`}});return response;};

  let result=await requestRegular('/api/ai/public/discussions',{text:'先讨论公共空间如何分类',locale:'zh-CN'});
  assert.equal(result.response.status,403);assert.equal(result.body.code,'FORBIDDEN');assert.equal(upstreamCalls,0);
  let quickResponse=await fetch(`${base}/api/ai/public/quick-instructions/stream`,{method:'POST',headers:{'Content-Type':'application/json',cookie:`navpilot_session=${regularSession.rawToken}`},body:JSON.stringify({text:'帮我删除公共空间下访问量最小的一个链接',locale:'zh-CN'})});
  assert.equal(quickResponse.status,200);let quickEvents=(await quickResponse.text()).trim().split('\n').map(line=>JSON.parse(line));assert.equal(quickEvents.at(-1).code,'AI_PUBLIC_MANAGE_FORBIDDEN');assert.equal(upstreamCalls,0);
  result=await request('/api/ai/public/discussions',{text:'先讨论公共空间如何分类',locale:'zh-CN'});
  assert.equal(result.response.status,201);assert.match(result.body.answer,/建议下一步/);assert.ok(result.body.conversationId);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ai_messages WHERE conversation_id=?').get(result.body.conversationId).n,2);

  const streamedResponse=await fetch(`${base}/api/ai/public/discussions/stream`,{method:'POST',headers:{'Content-Type':'application/json',cookie:`navpilot_session=${session.rawToken}`},body:JSON.stringify({text:'流式讨论分类',locale:'zh-CN'})});
  assert.equal(streamedResponse.status,200);assert.match(streamedResponse.headers.get('content-type'),/application\/x-ndjson/);
  const events=(await streamedResponse.text()).trim().split('\n').map(line=>JSON.parse(line));
  const eventTypes=events.map(event=>event.type);
  for(const expected of ['meta','stage','usage','delta','done'])assert.ok(eventTypes.includes(expected),`missing ${expected} event`);
  assert.match(events.find(event=>event.type==='delta').content,/建议下一步/);
  const discussionDone=events.find(event=>event.type==='done');
  assert.ok(discussionDone.run.id);assert.equal(discussionDone.run.status,'succeeded');assert.equal(discussionDone.run.modelCalls,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ai_messages WHERE conversation_id=?').get(events[0].conversationId).n,2);

  const interruptedResponse=await fetch(`${base}/api/ai/public/discussions/stream`,{method:'POST',headers:{'Content-Type':'application/json',cookie:`navpilot_session=${session.rawToken}`},body:JSON.stringify({text:'测试上游中断',locale:'zh-CN'})});
  const interruptedEvents=(await interruptedResponse.text()).trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(interruptedEvents.at(-1).type,'error');assert.equal(interruptedEvents.at(-1).code,'AI_STREAM_INTERRUPTED');assert.equal(interruptedEvents.at(-1).partial,true);assert.equal(interruptedEvents.at(-1).retryable,true);
  const partialMessage=db.prepare('SELECT content,metadata_json FROM ai_messages WHERE conversation_id=? ORDER BY created_at_ms DESC,id DESC LIMIT 1').get(interruptedEvents[0].conversationId),partialMetadata=JSON.parse(partialMessage.metadata_json);
  assert.equal(partialMessage.content,'已生成但未完成');assert.equal(partialMetadata.kind,'partial');assert.equal(partialMetadata.retryable,true);

  result=await requestRegular('/api/ai/public/plans',{text:'创建分类'});
  assert.equal(result.response.status,403);
  result=await request('/api/ai/personal/discussions',{text:'讨论个人分类'});
  assert.equal(result.response.status,403);assert.equal(result.body.code,'AI_PERSONAL_DISABLED');
  setSetting('ai_personal_enabled','true');
  result=await request('/api/ai/personal/discussions',{text:'讨论个人分类'});
  assert.equal(result.response.status,201);

  const navigation=createNavigationService(db),foreign=await createUser({username:'report-foreign',displayName:'Report Foreign',password:'Strong-foreign-password',mustChangePassword:false});
  navigation.createItem(realm('public'),{name:'Public report item',url:'https://public-report.example'});
  navigation.createItem(realm('personal',member.id),{name:'Own report item',url:'https://own-report.example'});
  navigation.createItem(realm('personal',foreign.id),{name:'Private foreign report item',url:'https://private-report.example'});
  const expectedVisible=navigation.listItems(realm('public')).length+navigation.listItems(realm('personal',member.id)).length;
  const instructionStream=await fetch(`${base}/api/ai/public/instructions/stream`,{method:'POST',headers:{'Content-Type':'application/json',cookie:`navpilot_session=${session.rawToken}`},body:JSON.stringify({text:'帮我将所有空间汇总成交互式 HTML 报告',locale:'zh-CN'})});
  assert.equal(instructionStream.status,200);assert.match(instructionStream.headers.get('content-type'),/application\/x-ndjson/);
  const instructionEvents=(await instructionStream.text()).trim().split('\n').map(line=>JSON.parse(line));
  const instructionTypes=instructionEvents.map(event=>event.type);
  for(const expected of ['meta','stage','usage','tools','result','done'])assert.ok(instructionTypes.includes(expected),`missing instruction ${expected} event`);
  const instructionDone=instructionEvents.find(event=>event.type==='done');
  assert.ok(instructionDone.run.id);assert.equal(instructionDone.run.status,'succeeded');assert.ok(instructionDone.run.modelCalls>=3);assert.ok(instructionDone.run.toolCalls>=1);
  let response=await get(`/api/ai/runs/${instructionDone.run.id}`);assert.equal(response.status,200);
  const storedRun=await response.json();assert.equal(storedRun.id,instructionDone.run.id);assert.ok(storedRun.events.some(event=>event.type==='stage'));assert.ok(storedRun.events.some(event=>event.type==='tools'));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ai_usage_events WHERE run_id=?').get(instructionDone.run.id).n,3);
  const foreignSession=createSession(foreign.id);
  response=await fetch(`${base}/api/ai/runs/${instructionDone.run.id}`,{headers:{cookie:`navpilot_session=${foreignSession.rawToken}`}});assert.equal(response.status,404);

  result=await request('/api/ai/public/instructions',{text:'帮我将所有空间各分类汇总成一个html网页，可以支持动态图表形式进行交互查看。',locale:'zh-CN'});
  assert.equal(result.response.status,201);assert.equal(result.body.kind,'report');assert.equal(result.body.report.metrics.resources,expectedVisible);assert.ok(result.body.conversationId);
  response=await get(`/api/ai/reports/${result.body.report.id}/html`);assert.equal(response.status,200);const html=await response.text();assert.match(html,/AI 空间分类分析/);assert.match(html,/category-bars/);assert.match(html,/Public report item/);assert.match(html,/Own report item/);assert.doesNotMatch(html,/Private foreign report item/);assert.match(response.headers.get('content-security-policy'),/default-src 'none'/);assert.doesNotThrow(()=>new Function(html.match(/<script>([\s\S]*)<\/script>/)[1]));
  response=await get('/api/ai/conversations');const history=await response.json();assert.equal(history.find(item=>item.id===result.body.conversationId).mode,'instruction');
});

test.after(()=>db.close());
