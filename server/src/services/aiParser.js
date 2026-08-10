const axios = require('axios');
const db = require('../db');
const { getEffectiveAiConfig } = require('./settingsService');

const PROMPTS = {
  'zh-CN': `你是 NavPilot 的导航助手。用户会用自然语言描述想要添加的一个或多个网站导航条目。
请只返回合法 JSON，不要输出多余文字或 Markdown。JSON 必须使用固定字段 items、name、url、description、category、icon：
{"items":[{"name":"简洁站点名称","url":"包含 http:// 或 https:// 的完整链接","description":"不超过30字的一句话描述","category":"简短分类，如常用工具/研发/办公/文档/监控","icon":"单个 emoji"}]}
如果用户提到多个网站，请拆分为多个 items。保留用户明确提供的名称和分类；需要推断的名称、描述和分类使用简体中文。分类尽量简短并复用常见分类。不要添加注释或尾随逗号。`,
  en: `You are the navigation assistant for NavPilot. The user will describe one or more websites to add.
Return valid JSON only, with no extra text or Markdown. Use exactly these keys: items, name, url, description, category, icon:
{"items":[{"name":"concise site name","url":"full URL including http:// or https://","description":"one short sentence","category":"short category such as Tools/Engineering/Office/Docs/Monitoring","icon":"one emoji"}]}
Split multiple websites into separate items. Preserve names and categories explicitly supplied by the user; write inferred names, descriptions, and categories in English. Reuse common concise categories. Do not include comments or trailing commas.`,
};

function normalizeLocale(locale) {
  return locale === 'en' ? 'en' : 'zh-CN';
}

function getAiConfig() {
  return getEffectiveAiConfig();
}

function aiError(code, message, status = 502) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function extractJson(text) {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw aiError('AI_INVALID_RESPONSE', 'AI 返回内容中未找到 JSON');
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw aiError('AI_INVALID_RESPONSE', 'AI 返回的 JSON 无法解析');
  }
}

async function parseDescription(userText, { locale = 'zh-CN' } = {}) {
  const { baseURL, apiKey, model } = getAiConfig();
  if (!apiKey) {
    throw aiError('AI_NOT_CONFIGURED', '尚未配置 AI API Key，请在系统设置或服务端环境变量中配置', 400);
  }

  try {
    const resp = await axios.post(
      `${baseURL.replace(/\/$/, '')}/chat/completions`,
      {
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: PROMPTS[normalizeLocale(locale)] },
          { role: 'user', content: userText },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const content = resp.data?.choices?.[0]?.message?.content;
    if (!content) throw aiError('AI_INVALID_RESPONSE', 'AI 未返回有效内容');
    const parsed = extractJson(content);
    if (!Array.isArray(parsed.items)) throw aiError('AI_INVALID_RESPONSE', 'AI 返回格式不符合预期');
    return parsed.items;
  } catch (error) {
    if (error.code?.startsWith('AI_')) throw error;
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      throw aiError('AI_UPSTREAM_TIMEOUT', 'AI 服务请求超时');
    }
    if (error.response?.status === 401 || error.response?.status === 403) {
      throw aiError('AI_UPSTREAM_AUTH_FAILED', 'AI 服务鉴权失败');
    }
    throw aiError('AI_UPSTREAM_REQUEST_FAILED', 'AI 服务请求失败');
  }
}

function persistItems(items, opts = {}) {
  const scope = opts.scope === 'personal' ? 'personal' : 'public';
  const ownerId = scope === 'personal' ? opts.ownerUserId : null;
  if (scope === 'personal' && !ownerId) throw aiError('AUTH_REQUIRED', '请先登录', 401);
  const findCategory = db.prepare("SELECT id FROM categories WHERE scope=? AND owner_id IS ? AND name=? COLLATE NOCASE");
  const insertCategory = db.prepare("INSERT INTO categories(name,icon,scope,owner_id,sort_order) VALUES(?,?,?,?,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM categories WHERE scope=? AND owner_id IS ?))");
  const insertItem = db.prepare(`INSERT INTO items(name,url,icon,description,category_id,sort_order,check_method,check_enabled,scope,owner_id)
    VALUES(?,?,?,?,?,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM items WHERE scope=? AND owner_id IS ? AND category_id IS ?),'http',0,?,?)`);
  const created = [];
  db.transaction(() => {
    for (const raw of items) {
      const name = String(raw.name || '').trim();
      const categoryName = String(raw.category || '').trim();
      if (!name || !raw.url) throw aiError('AI_INVALID_RESPONSE', 'AI 返回的条目缺少名称或链接', 400);
      let parsed;
      try { parsed = new URL(/^https?:\/\//i.test(raw.url) ? raw.url : `https://${raw.url}`); } catch { throw aiError('AI_INVALID_RESPONSE', 'AI 返回的链接无效', 400); }
      let categoryId = null;
      if (categoryName) {
        let category = findCategory.get(scope, ownerId, categoryName);
        if (!category) category = { id: Number(insertCategory.run(categoryName, 'icon:folder', scope, ownerId, scope, ownerId).lastInsertRowid) };
        categoryId = category.id;
      }
      const id = Number(insertItem.run(name, parsed.toString(), String(raw.icon || 'icon:link').slice(0,80), String(raw.description || '').slice(0,500), categoryId, scope, ownerId, categoryId, scope, ownerId).lastInsertRowid);
      created.push(id);
    }
  })();
  return db.prepare(`SELECT items.*,categories.name AS category_name,categories.icon AS category_icon FROM items LEFT JOIN categories ON categories.id=items.category_id WHERE items.id IN (${created.map(() => '?').join(',') || 'NULL'})`).all(...created);
}

module.exports = { parseDescription, persistItems, getAiConfig, normalizeLocale, extractJson };
