const test = require("node:test");
const assert = require("node:assert/strict");
process.env.NAVPILOT_DB_PATH = ":memory:";
const db = require("../src/db");
const axios = require('axios');
const { extractJson, normalizeEnvelope, parseCommands, parsePlan, requestCommandsWithConfig } = require("../src/services/ai/openAiCompatibleProvider");

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
test.after(()=>db.close());
