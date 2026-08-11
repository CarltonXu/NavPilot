const test = require("node:test");
const assert = require("node:assert/strict");
process.env.NAVPILOT_DB_PATH = ":memory:";
const db = require("../src/db");
const axios = require('axios');
const { Readable } = require('node:stream');
const { extractJson, normalizeEnvelope, parseCommands, parsePlan, parseInstruction, requestCommandsWithConfig, requestInstructionWithConfig, requestDiscussionWithConfig, requestDiscussionStreamWithConfig } = require("../src/services/ai/openAiCompatibleProvider");

test("AI provider extracts embedded arrays and normalizes compatible envelopes", () => {
  assert.deepEqual(extractJson("<think>ignore</think> result: ```json\n[{\"op\":\"item.delete\",\"item\":\"Old\"}]\n```"), [{ op:"item.delete", item:"Old" }]);
  assert.deepEqual(normalizeEnvelope({ items:[{ title:"GitHub", link:"https://github.com", tags:["dev"] }] }), {
    operations:[{ op:"item.create", fields:{ name:"GitHub", url:"https://github.com", tags:["dev"] } }],
  });
});

test("AI provider accepts command aliases and content blocks", () => {
  const commands = parseCommands({ choices:[{ message:{ content:[{ type:"text", text:JSON.stringify({ commands:[{ action:"create_item", name:"GitHub", url:"https://github.com" }] }) }] } }] });
  assert.deepEqual(commands, [{ op:"item.create", fields:{ name:"GitHub", url:"https://github.com" } }]);
});

test("AI provider normalizes category names returned in common model fields", () => {
  const result = parseInstruction({ choices:[{ message:{ content:JSON.stringify({
    kind:"plan",
    summary:"创建内部分类",
    operations:[{ op:"category.create", fields:{ name:"OnePro/BeiJing Internal" } }],
  }) } }] });
  assert.equal(result.kind, "plan");
  assert.deepEqual(result.commands, [
    { op:"category.create", category:"OnePro/BeiJing Internal" },
  ]);
  assert.deepEqual(
    normalizeEnvelope({ operations:[{ action:"create_group", groupName:"Internal" }] }).operations,
    [{ op:"category.create", category:"Internal" }],
  );
  assert.deepEqual(
    normalizeEnvelope({ operations:[{ op:"item.move", selector:{ names:["BJ github"] }, category:"OnePro/BeiJing Internal" }] }).operations,
    [{ op:"item.move", items:["BJ github"], destinationCategory:"OnePro/BeiJing Internal" }],
  );
});

test("AI provider preserves advisory summary and suggestions with an executable category plan", () => {
  const result = parsePlan({ choices:[{ message:{ content:JSON.stringify({
    summary:"按使用范围建立企业导航，再按职能细分。",
    suggestions:["内部系统区分研发与办公", "外部资源按用途维护"],
    operations:[
      { op:"category.create", category:"公司资源" },
      { op:"category.create", category:"内部系统", parentCategory:"公司资源" },
      { op:"category.create", category:"研发平台", parentCategory:"公司资源 / 内部系统" },
    ],
  }) } }] });
  assert.equal(result.summary, "按使用范围建立企业导航，再按职能细分。");
  assert.deepEqual(result.suggestions, ["内部系统区分研发与办公", "外部资源按用途维护"]);
  assert.equal(result.commands.length, 3);
  assert.equal(result.commands[2].parentCategory, "公司资源 / 内部系统");
});

test("AI instruction parser separates deterministic queries from collection plans", () => {
  const query = parseInstruction({ choices:[{ message:{ content:JSON.stringify({
    kind:"query",
    title:"失联资源",
    query:{ filters:{ status:["offline"] }, groupBy:"category", view:"both", limit:50 },
  }) } }] });
  assert.equal(query.kind, "query");
  assert.deepEqual(query.query.filters, { status:["offline"] });
  const plan = parseInstruction({ choices:[{ message:{ content:JSON.stringify({
    kind:"plan",
    summary:"开启全部链接探测",
    suggestions:[],
    operations:[{ op:"item.bulkUpdate", selector:{ all:true }, fields:{ checkEnabled:true, checkMethod:"http" } }],
  }) } }] });
  assert.equal(plan.kind, "plan");
  assert.deepEqual(plan.commands[0].selector, { all:true });
  const report = parseInstruction({ choices:[{ message:{ content:JSON.stringify({
    kind:"report", title:"All spaces", report:{ spaces:"all_visible" },
  }) } }] });
  assert.deepEqual(report, { kind:"report", title:"All spaces", report:{ spaces:"all_visible" } });
});

test('AI provider retries a timeout once with compressed context and uses the model timeout', async (t) => {
  const requests = [];
  t.mock.method(axios, 'post', async (_url, body, options) => {
    requests.push({ body, options });
    if (requests.length === 1) throw Object.assign(new Error('timeout'), { code:'ECONNABORTED' });
    return { data:{ choices:[{ message:{ content:JSON.stringify({ summary:'已规划', suggestions:[], operations:[{ op:'category.create', category:'研发' }] }) } }] } };
  });
  const context = {
    resourceCount:80,
    categories:[{ name:'研发', path:'研发', resourceCount:80 }],
    statistics:{ topTags:[{ name:'开发', count:80 }] },
    resources:Array.from({ length:60 }, (_, index) => ({ name:`Resource ${index}`, url:`https://${index}.example.com`, description:'x'.repeat(180), tags:['开发'], category:'研发' })),
  };
  const result = await requestCommandsWithConfig('规划研发分类', { context }, {
    baseURL:'https://ai.example/v1', apiKey:'secret', model:'model-one', requestTimeoutMs:120000,
  });
  assert.equal(result.commands.length, 1);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.timeout, 120000);
  assert.equal(requests[1].options.timeout, 120000);
  assert.ok(requests[1].body.messages[1].content.length < requests[0].body.messages[1].content.length);
});

test('AI discussion returns advisory text without requiring an executable command envelope', async (t) => {
  t.mock.method(axios, 'post', async (_url, body) => {
    assert.match(body.messages[0].content, /绝不生成或声称执行任何修改/);
    return { data:{ choices:[{ message:{ content:'建议先按使用范围建立一级分类，再按业务职能细分。\n\n建议下一步：确认部门边界后转成执行方案。' } }] } };
  });
  const result=await requestDiscussionWithConfig('先讨论公司导航如何分类', { context:{ resourceCount:20,resources:[],categories:[] } }, {
    baseURL:'https://ai.example/v1',apiKey:'secret',model:'advisor',requestTimeoutMs:60000,
  });
  assert.match(result.answer,/建议下一步/);
  assert.equal(result.model,'advisor');
});
test('AI instruction usage includes schema-repair model calls',async(t)=>{
  let calls=0;
  t.mock.method(axios,'post',async()=>{
    calls+=1;
    if(calls===1)return{data:{choices:[{message:{content:'invalid response'}}],usage:{prompt_tokens:10,completion_tokens:4,total_tokens:14}}};
    return{data:{choices:[{message:{content:JSON.stringify({kind:'query',title:'资源统计',query:{filters:{all:true},groupBy:'none',view:'summary',limit:100}})}}],usage:{prompt_tokens:6,completion_tokens:4,total_tokens:10}}};
  });
  const result=await requestInstructionWithConfig('统计所有资源',{context:{resourceCount:2,resources:[],categories:[]}},{baseURL:'https://ai.example/v1',apiKey:'secret',model:'repair-model',requestTimeoutMs:60000});
  assert.equal(result.kind,'query');assert.equal(result.modelCalls,2);
  assert.deepEqual(result.usage,{prompt_tokens:16,completion_tokens:8,total_tokens:24});
});
test('AI non-stream requests preserve cancellation semantics',async(t)=>{
  t.mock.method(axios,'post',async(_url,_body,options)=>{assert.ok(options.signal);throw Object.assign(new Error('cancelled'),{code:'ERR_CANCELED'});});
  const controller=new AbortController();controller.abort();
  await assert.rejects(()=>requestDiscussionWithConfig('讨论分类',{signal:controller.signal},{baseURL:'https://ai.example/v1',apiKey:'secret',model:'cancel-model',requestTimeoutMs:60000}),error=>error.code==='AI_REQUEST_CANCELLED'&&error.status===499);
});
test('AI discussion streams compatible SSE deltas as they arrive',async(t)=>{
  t.mock.method(axios,'post',async(_url,body,options)=>{
    assert.equal(body.stream,true);assert.equal(body.stream_options.include_usage,true);assert.equal(options.responseType,'stream');
    return{data:Readable.from([
      'data: {"choices":[{"delta":{"content":"建议先"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"统一分类。"}}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":8,"total_tokens":12}}\n\n',
      'data: [DONE]\n\n',
    ])};
  });
  const deltas=[];
  const result=await requestDiscussionStreamWithConfig('讨论分类',{context:{resourceCount:3,resources:[],categories:[]},onDelta:value=>deltas.push(value)}, {
    baseURL:'https://ai.example/v1',apiKey:'secret',model:'stream-model',requestTimeoutMs:60000,
  });
  assert.deepEqual(deltas,['建议先','统一分类。']);
  assert.equal(result.answer,'建议先统一分类。');
  assert.equal(result.model,'stream-model');
  const usage=db.prepare("SELECT input_tokens,output_tokens,first_token_ms FROM ai_usage_events WHERE provider_model='stream-model' ORDER BY created_at_ms DESC LIMIT 1").get();
  assert.deepEqual({inputTokens:usage.input_tokens,outputTokens:usage.output_tokens},{inputTokens:8,outputTokens:4});
  assert.ok(Number.isInteger(usage.first_token_ms)&&usage.first_token_ms>=0);
});
test.after(()=>db.close());
