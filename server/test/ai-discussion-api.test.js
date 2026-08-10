const test=require('node:test');
const assert=require('node:assert/strict');
const axios=require('axios');
process.env.NAVPILOT_DB_PATH=':memory:';
process.env.NODE_ENV='test';
const db=require('../src/db');
const{createApp}=require('../src/index');
const{createUser}=require('../src/services/authService');
const{createSession}=require('../src/services/sessionService');
const{setSetting}=require('../src/services/settingsService');

test('AI advisory discussions are separate from approval-gated public plans',async(t)=>{
  const member=await createUser({username:'advisor-member',displayName:'Advisor Member',password:'Strong-member-password',mustChangePassword:false}),session=createSession(member.id);
  setSetting('ai_base_url','https://ai.example/v1');setSetting('ai_model','advisor');setSetting('ai_api_key','secret');
  t.mock.method(axios,'post',async(_url,body)=>{assert.match(body.messages[0].content,/资源管理顾问/);return{data:{choices:[{message:{content:'建议先讨论分类边界。\n\n建议下一步：确认后再转成执行方案。'}}]}};});
  const server=createApp().listen(0);await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`,request=async(path,body={})=>{const response=await fetch(`${base}${path}`,{method:'POST',headers:{'Content-Type':'application/json',cookie:`navpilot_session=${session.rawToken}`},body:JSON.stringify(body)});return{response,body:await response.json()};};

  let result=await request('/api/ai/public/discussions',{text:'先讨论公共空间如何分类',locale:'zh-CN'});
  assert.equal(result.response.status,201);assert.match(result.body.answer,/建议下一步/);assert.ok(result.body.conversationId);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ai_messages WHERE conversation_id=?').get(result.body.conversationId).n,2);

  const streamedResponse=await fetch(`${base}/api/ai/public/discussions/stream`,{method:'POST',headers:{'Content-Type':'application/json',cookie:`navpilot_session=${session.rawToken}`},body:JSON.stringify({text:'流式讨论分类',locale:'zh-CN'})});
  assert.equal(streamedResponse.status,200);assert.match(streamedResponse.headers.get('content-type'),/application\/x-ndjson/);
  const events=(await streamedResponse.text()).trim().split('\n').map(line=>JSON.parse(line));
  assert.deepEqual(events.map(event=>event.type),['meta','delta','done']);
  assert.match(events.find(event=>event.type==='delta').content,/建议下一步/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ai_messages WHERE conversation_id=?').get(events[0].conversationId).n,2);

  result=await request('/api/ai/public/plans',{text:'创建分类'});
  assert.equal(result.response.status,403);
  result=await request('/api/ai/personal/discussions',{text:'讨论个人分类'});
  assert.equal(result.response.status,403);assert.equal(result.body.code,'AI_PERSONAL_DISABLED');
  setSetting('ai_personal_enabled','true');
  result=await request('/api/ai/personal/discussions',{text:'讨论个人分类'});
  assert.equal(result.response.status,201);
});

test.after(()=>db.close());
