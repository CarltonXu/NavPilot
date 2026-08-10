const axios = require("axios");
const { getEffectiveAiConfig } = require("../settingsService");
const { validateEnvelope } = require("./commandSchema");
const PROMPTS = {
  "zh-CN": `你是 NavPilot 的资源规划顾问和命令规划器。用户既可以要求具体操作，也可以只描述一个模糊目标。遇到“帮我规划公司导航分类”这类咨询式请求时，先根据使用范围、业务职能和使用场景给出清晰的信息架构建议，再生成用户确认后可执行的分类操作。只返回一个合法 JSON 对象，不要 Markdown或思考过程。顶层格式必须为 {"summary":"一句话规划思路","suggestions":["建议1","建议2"],"operations":[...]}。summary 最多 300 字，suggestions 最多 8 条；具体操作请求也必须返回简短 summary，suggestions 可以为空。每个操作必须使用以下格式之一：
新增资源：{"op":"item.create","fields":{"name":"GitHub","url":"https://github.com","description":"代码托管","icon":"icon:code","tags":["开发"],"category":"研发"}}
修改资源：{"op":"item.update","item":"GitHub","fields":{"name":"新名称"}}
批量修改：{"op":"item.bulkUpdate","items":["资源A","资源B"],"fields":{"tags":["常用"]}}
移动资源：{"op":"item.move","items":["GitHub"],"destinationCategory":"研发 / 工具"}
删除资源：{"op":"item.delete","item":"GitHub"}
新增分类：{"op":"category.create","category":"工具","parentCategory":"研发"}
修改/删除分类：{"op":"category.update","category":"研发 / 工具","fields":{"name":"开发工具"}} 或 {"op":"category.delete","category":"研发 / 工具"}。
分类最多三级；分类规划应避免空泛的“其他”堆积，优先提供可长期维护的一级到三级结构，但不要为了凑层级强行创建。引用分类优先使用“一级 / 二级 / 三级”完整路径。只允许 op: item.create,item.update,item.delete,item.bulkUpdate,item.move,category.create,category.update,category.delete,category.reorder,category.move。fields 只允许 name,url,icon,description,tags,category,checkMethod,checkTarget,checkEnabled。创建多级分类时按父到子顺序输出。不要输出 ID、scope、owner、SQL。不能确定时在 suggestions 中说明假设，操作中保留用户原词。`,
  en: `You are NavPilot's resource information-architecture consultant and command planner. Users may request concrete operations or describe a broad goal. For advisory requests such as planning an enterprise navigation taxonomy, propose a maintainable information architecture based on audience, business function, and usage scenario, then emit the category operations that can be executed after user approval. Return one valid JSON object only, without Markdown or chain-of-thought. The top-level shape must be {"summary":"one-sentence rationale","suggestions":["suggestion 1"],"operations":[...]}. Keep summary under 300 characters and suggestions to at most 8. Concrete requests also need a short summary and may use an empty suggestions array. Examples:
Create item: {"op":"item.create","fields":{"name":"GitHub","url":"https://github.com","description":"Code hosting","icon":"icon:code","tags":["development"],"category":"Engineering"}}
Update item: {"op":"item.update","item":"GitHub","fields":{"name":"New name"}}
Bulk update: {"op":"item.bulkUpdate","items":["Item A","Item B"],"fields":{"tags":["frequent"]}}
Move item: {"op":"item.move","items":["GitHub"],"destinationCategory":"Engineering / Tools"}
Delete item: {"op":"item.delete","item":"GitHub"}
Create category: {"op":"category.create","category":"Tools","parentCategory":"Engineering"}.
Categories support up to three levels. Avoid dumping unrelated content into a generic Other category and do not force unnecessary depth. Allowed ops: item.create,item.update,item.delete,item.bulkUpdate,item.move,category.create,category.update,category.delete,category.reorder,category.move. fields may only contain name,url,icon,description,tags,category,checkMethod,checkTarget,checkEnabled. Emit parent categories before children. Never emit IDs, scope, owner, SQL, Markdown, or extra text. State assumptions in suggestions and preserve ambiguous user wording.`,
};
function aiError(code, message, status = 502) {
  return Object.assign(new Error(message), { code, status });
}
function extractJson(value) {
  if (value && typeof value === "object") return value;
  const cleaned = String(value || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
  try { return JSON.parse(cleaned); } catch { /* scan embedded JSON */ }
  for (let start = 0; start < cleaned.length; start += 1) {
    if (cleaned[start] !== "{" && cleaned[start] !== "[") continue;
    const stack = [], opener = cleaned[start];
    let quoted = false, escaped = false;
    for (let index = start; index < cleaned.length; index += 1) {
      const char = cleaned[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === "{" || char === "[") stack.push(char);
      else if (char === "}" || char === "]") {
        const expected = char === "}" ? "{" : "[";
        if (stack.pop() !== expected) break;
        if (!stack.length) {
          try { return JSON.parse(cleaned.slice(start, index + 1)); }
          catch { break; }
        }
      }
    }
  }
  throw aiError("AI_INVALID_RESPONSE", `AI 返回的 JSON 无法解析（${openerName(cleaned)}）`);
}
function openerName(value){return value.includes("{")||value.includes("[")?"结构不完整":"未找到 JSON";}
function normalizeOperation(raw = {}) {
  const input = raw && typeof raw === "object" ? raw : {};
  let op = String(input.op || input.operation || input.action || input.type || "").trim();
  const token = op.toLowerCase().replace(/[\s_-]+/g, ".");
  const aliases = {"add":"item.create","create":"item.create","add.item":"item.create","create.item":"item.create","item.add":"item.create","edit.item":"item.update","update.item":"item.update","delete.item":"item.delete","remove.item":"item.delete","move.item":"item.move","create.category":"category.create","add.category":"category.create","update.category":"category.update","edit.category":"category.update","delete.category":"category.delete","remove.category":"category.delete","move.category":"category.move"};
  op = aliases[token] || op;
  const fieldAliases = { title:"name", link:"url", website:"url", desc:"description", folder:"category" };
  const allowedFields = new Set(["name","url","icon","description","tags","category","checkMethod","checkTarget","checkEnabled"]);
  const source = input.fields || input.params || input.data || input.resource || {};
  const fields = {};
  for (const [key, fieldValue] of Object.entries(source)) {
    const normalizedKey = fieldAliases[key] || key;
    if (allowedFields.has(normalizedKey)) fields[normalizedKey] = fieldValue;
  }
  for (const key of ["name","url","icon","description","tags","category","checkMethod","checkTarget","checkEnabled","title","link","website","desc","folder"])
    if (input[key] !== undefined && fields[fieldAliases[key] || key] === undefined) fields[fieldAliases[key] || key] = input[key];
  const value = { op };
  for (const key of ["item","category","items","parentCategory","destinationCategory","beforeCategory","afterCategory"])
    if (input[key] !== undefined) value[key] = input[key];
  if (!value.item && input.target && op.startsWith("item.")) value.item = input.target;
  if (!value.category && input.target && op.startsWith("category.")) value.category = input.target;
  if (Object.keys(fields).length) value.fields = fields;
  return value;
}
function normalizeEnvelope(raw) {
  const source = raw?.plan || raw?.result || raw;
  let operations = Array.isArray(source) ? source : source?.operations || source?.commands || source?.actions;
  if (!operations && source?.operation) operations = [source.operation];
  if (!operations && Array.isArray(source?.items))
    operations = source.items.map((item) => ({ ...item, op:"item.create", fields:item.fields || item }));
  if (!Array.isArray(operations)) return source;
  const value = { operations: operations.map(normalizeOperation) };
  const summary = source?.summary || source?.rationale || source?.overview;
  const suggestions = source?.suggestions || source?.recommendations;
  if (summary !== undefined) value.summary = summary;
  if (suggestions !== undefined) value.suggestions = suggestions;
  return value;
}
function responseContent(data) {
  const message = data?.choices?.[0]?.message || {};
  const content = Array.isArray(message.content)
    ? message.content.map((part) => typeof part === "string" ? part : part?.text || part?.content || "").join("\n")
    : message.content;
  return content || message.tool_calls?.[0]?.function?.arguments || data?.choices?.[0]?.text || data?.output_text || data?.output?.flatMap((item)=>item?.content||[]).map((part)=>part?.text||part?.content||"").join("\n") || message.reasoning_content || "";
}
function parseCommands(data) {
  return parsePlan(data).commands;
}
function cleanPlanningText(value, max) {
  return String(value || "").trim().slice(0, max);
}
function parsePlan(data) {
  const normalized = normalizeEnvelope(extractJson(responseContent(data)));
  const commands = validateEnvelope(normalized).operations;
  const suggestions = (Array.isArray(normalized?.suggestions)
    ? normalized.suggestions
    : [normalized?.suggestions])
    .map((value) => cleanPlanningText(value, 240))
    .filter(Boolean)
    .slice(0, 8);
  return {
    commands,
    summary: cleanPlanningText(normalized?.summary, 300),
    suggestions,
  };
}
async function requestCommands(userText, { locale = "zh-CN" } = {}) {
  const { baseURL, apiKey, model } = getEffectiveAiConfig();
  if (!apiKey)
    throw aiError(
      "AI_NOT_CONFIGURED",
      "尚未配置 AI API Key，请在系统设置中配置",
      400,
    );
  const messages = [
    { role: "system", content: PROMPTS[locale === "en" ? "en" : "zh-CN"] },
    { role: "user", content: String(userText).slice(0, 10000) },
  ];
  async function request(currentMessages) {
    return axios.post(
      `${baseURL.replace(/\/$/, "")}/chat/completions`,
      {
        model,
        temperature: 0.2,
        messages: currentMessages,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
        maxContentLength: 512000,
      },
    );
  }
  try {
    const response = await request(messages);
    try {
      return { ...parsePlan(response.data), model };
    } catch (formatError) {
      if (formatError.code !== "AI_INVALID_RESPONSE") throw formatError;
      const invalid = String(responseContent(response.data)).slice(0, 8000);
      const repaired = await request([...messages,{role:"assistant",content:invalid},{role:"user",content:locale==="en"?"Your response did not match the required schema. Correct it and return only {\"summary\":\"...\",\"suggestions\":[],\"operations\":[...]} using the exact operation examples in the system instruction.":"上一个响应不符合规定格式。请严格按照系统消息中的操作示例修正，只返回 {\"summary\":\"...\",\"suggestions\":[],\"operations\":[...]} JSON。"}]);
      return { ...parsePlan(repaired.data), model };
    }
  } catch (error) {
    if (error.code?.startsWith("AI_")) throw error;
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT")
      throw aiError("AI_UPSTREAM_TIMEOUT", "AI 服务请求超时");
    if ([401, 403].includes(error.response?.status))
      throw aiError("AI_UPSTREAM_AUTH_FAILED", "AI 服务鉴权失败");
    throw aiError("AI_UPSTREAM_REQUEST_FAILED", "AI 服务请求失败");
  }
}
module.exports = { requestCommands, extractJson, normalizeEnvelope, responseContent, parseCommands, parsePlan, aiError };
