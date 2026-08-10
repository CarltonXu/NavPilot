const test = require("node:test");
const assert = require("node:assert/strict");
process.env.NAVPILOT_DB_PATH = ":memory:";
const db = require("../src/db");
const { extractJson, normalizeEnvelope, parseCommands, parsePlan } = require("../src/services/ai/openAiCompatibleProvider");

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
test.after(()=>db.close());
