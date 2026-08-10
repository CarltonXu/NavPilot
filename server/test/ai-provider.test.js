const test = require("node:test");
const assert = require("node:assert/strict");
const { extractJson, normalizeEnvelope, parseCommands } = require("../src/services/ai/openAiCompatibleProvider");

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
