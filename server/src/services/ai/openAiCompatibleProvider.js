const axios = require("axios");
const { getEffectiveAiConfig } = require("../settingsService");
const { validateEnvelope } = require("./commandSchema");
const PROMPTS = {
  "zh-CN": `你是 NavPilot 的命令规划器。把用户请求转换为 JSON：{"operations":[...]}. 分类最多三级；分类引用必须优先使用“一级 / 二级 / 三级”完整路径。只允许 op: item.create,item.update,item.delete,item.bulkUpdate,item.move,category.create,category.update,category.delete,category.reorder,category.move。用 item/category/items/parentCategory/destinationCategory/beforeCategory/afterCategory 表达人类可读名称、完整分类路径或链接，用 fields 表达修改。fields 只允许 name,url,icon,description,tags,category,checkMethod,checkTarget,checkEnabled；tags 必须是标签字符串数组，可用于新增、替换或批量设置资源标签。创建多级分类时必须按父分类到子分类的顺序输出；后续操作可以引用前面刚创建的完整分类路径。不要输出 ID、scope、owner、SQL、Markdown 或额外文字。不能确定时仍按用户原词引用实体，不要猜测。`,
  en: `You plan commands for NavPilot. Return JSON only: {"operations":[...]}. Categories support up to three levels; reference categories by full paths such as "Engineering / Backend / Monitoring" whenever possible. Allowed ops: item.create,item.update,item.delete,item.bulkUpdate,item.move,category.create,category.update,category.delete,category.reorder,category.move. Use item/category/items/parentCategory/destinationCategory/beforeCategory/afterCategory for human-readable names, full category paths, or URLs, and fields for changes. Fields may only contain name,url,icon,description,tags,category,checkMethod,checkTarget,checkEnabled. Tags must be an array of strings and can be created or replaced on one or many resources. When creating nested categories, emit parents before children; later operations may reference the full path created earlier in the same plan. Never emit IDs, scope, owner, SQL, Markdown, or extra text. Preserve ambiguous references instead of guessing.`,
};
function aiError(code, message, status = 502) {
  return Object.assign(new Error(message), { code, status });
}
function extractJson(value) {
  const cleaned = String(value || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{"),
    end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start)
    throw aiError("AI_INVALID_RESPONSE", "AI 返回内容中未找到 JSON");
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw aiError("AI_INVALID_RESPONSE", "AI 返回的 JSON 无法解析");
  }
}
async function requestCommands(userText, { locale = "zh-CN" } = {}) {
  const { baseURL, apiKey, model } = getEffectiveAiConfig();
  if (!apiKey)
    throw aiError(
      "AI_NOT_CONFIGURED",
      "尚未配置 AI API Key，请在系统设置中配置",
      400,
    );
  try {
    const response = await axios.post(
      `${baseURL.replace(/\/$/, "")}/chat/completions`,
      {
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: PROMPTS[locale === "en" ? "en" : "zh-CN"],
          },
          { role: "user", content: String(userText).slice(0, 10000) },
        ],
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
    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) throw aiError("AI_INVALID_RESPONSE", "AI 未返回有效内容");
    return {
      commands: validateEnvelope(extractJson(content)).operations,
      model,
    };
  } catch (error) {
    if (error.code?.startsWith("AI_")) throw error;
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT")
      throw aiError("AI_UPSTREAM_TIMEOUT", "AI 服务请求超时");
    if ([401, 403].includes(error.response?.status))
      throw aiError("AI_UPSTREAM_AUTH_FAILED", "AI 服务鉴权失败");
    throw aiError("AI_UPSTREAM_REQUEST_FAILED", "AI 服务请求失败");
  }
}
module.exports = { requestCommands, extractJson, aiError };
