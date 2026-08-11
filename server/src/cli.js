#!/usr/bin/env node
const db = require("./db");
const { createCapabilityBus } = require("./services/capabilities/navigationCapabilities");

function parseArgs(values) {
  const result = { _:[] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) { result._.push(value); continue; }
    const key = value.slice(2), next = values[index + 1];
    if (!next || next.startsWith("--")) result[key] = true;
    else { result[key] = next; index += 1; }
  }
  return result;
}

function actorFor(options) {
  const reference = options["actor-id"] || options.actor;
  if (!reference) throw Object.assign(new Error("请使用 --actor-id 指定调用用户"), { code:"AUTH_REQUIRED" });
  const row = db.prepare("SELECT id,username,role,status FROM users WHERE (id=? OR username=?) AND status='active'").get(reference, reference);
  if (!row) throw Object.assign(new Error("调用用户不存在或已禁用"), { code:"USER_NOT_FOUND" });
  return row;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv), [command, name] = options._, bus = createCapabilityBus(db);
  if (command === "tools" || command === "list") return { ok:true, tools:bus.catalog() };
  if (command !== "invoke" || !name) throw Object.assign(new Error("用法: navpilotctl tools | navpilotctl invoke <tool> --actor-id <user> --args '<json>'"), { code:"CLI_USAGE" });
  let args = {};
  try { args = JSON.parse(String(options.args || "{}")); }
  catch { throw Object.assign(new Error("--args 必须是合法 JSON"), { code:"CLI_ARGS_INVALID" }); }
  return bus.invoke(name, args, { actor:actorFor(options), currentScope:options.scope === "public" ? "public" : "personal", approved:options.approved === true });
}

if (require.main === module) main().then((value) => { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }).catch((error) => { process.stderr.write(`${JSON.stringify({ok:false,code:error.code||"CLI_FAILED",error:error.message})}\n`); process.exitCode=1; });

module.exports = { main, parseArgs };
