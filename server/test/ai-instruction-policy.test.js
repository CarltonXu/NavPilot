const test = require("node:test");
const assert = require("node:assert/strict");
const { mutationIntent, instructionPreflight } = require("../src/services/ai/instructionPolicy");

test("instruction preflight recognizes mutations without blocking read-only analysis", () => {
  assert.equal(mutationIntent("帮我删除公共空间下访问量最小的一个链接"), true);
  assert.equal(mutationIntent("帮我将所有链接开启探测模式"), true);
  assert.equal(mutationIntent("查询失联链接并按分类汇总"), false);
  assert.equal(mutationIntent("帮我看看有多少失联链接"), false);
  assert.equal(mutationIntent("帮我看看有多少链接没有开启探测"), false);
  assert.equal(mutationIntent("帮我看看已经删除了多少资源"), false);
  assert.equal(mutationIntent("查询失联链接并删除这些链接"), true);
});

test("instruction preflight rejects scope mismatch and non-admin public mutations", () => {
  assert.throws(
    () => instructionPreflight({ text:"删除公共空间的链接", scope:"personal", actor:{ id:"member", role:"user" } }),
    (error) => error.code === "AI_SCOPE_MISMATCH" && error.status === 400,
  );
  assert.throws(
    () => instructionPreflight({ text:"删除访问量最小的链接", scope:"public", actor:{ id:"member", role:"user" } }),
    (error) => error.code === "AI_PUBLIC_MANAGE_FORBIDDEN" && error.status === 403,
  );
  assert.deepEqual(
    instructionPreflight({ text:"汇总公共空间和个人空间的资源数量", scope:"personal", actor:{ id:"member", role:"user" } }),
    { mutation:false, referencesPublic:true, referencesPersonal:true },
  );
});
