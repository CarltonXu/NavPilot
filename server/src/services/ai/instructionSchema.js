const { validateEnvelope, validateSelector } = require("./commandSchema");

const GROUPS = new Set([
  "none",
  "status",
  "category",
  "tag",
  "domain",
  "checkEnabled",
]);

function schemaError(message) {
  return Object.assign(new Error(message), {
    code: "AI_INVALID_RESPONSE",
    status: 502,
  });
}

function clean(value, max) {
  const result = String(value || "").trim();
  if (result.length > max) throw schemaError("AI 指令字段过长");
  return result;
}

function validateQuery(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw schemaError("AI 查询格式无效");
  const filters = validateSelector(raw.filters || raw.selector || {}, {
    allowEmpty: true,
  });
  const groupBy = clean(raw.groupBy || "none", 20);
  if (!GROUPS.has(groupBy)) throw schemaError("AI 查询分组维度无效");
  const view = clean(raw.view || "both", 20);
  if (!["summary", "table", "both"].includes(view))
    throw schemaError("AI 查询展示方式无效");
  return {
    filters,
    groupBy,
    view,
    limit: Math.min(200, Math.max(1, Number(raw.limit) || 100)),
  };
}

function validateInstruction(raw) {
  const source = raw?.result || raw;
  if (!source || typeof source !== "object" || Array.isArray(source))
    throw schemaError("AI 指令格式无效");
  const inferredKind = source.kind || source.mode ||
    (source.operations || source.commands || source.actions ? "plan" : "query");
  const kind = clean(inferredKind, 20).toLocaleLowerCase();
  if (["query", "read", "search", "report"].includes(kind)) {
    if (kind === "report") {
      const report = source.report && typeof source.report === "object" ? source.report : source;
      const spaces = clean(report.spaces || "current", 20);
      if (!["current", "all_visible"].includes(spaces))
        throw schemaError("AI 报告空间范围无效");
      return {
        kind:"report",
        title:clean(source.title || source.summary || "资源交互式报告", 120),
        report:{ spaces },
      };
    }
    return {
      kind: "query",
      title: clean(source.title || source.summary || "资源查询", 120),
      query: validateQuery(source.query || source),
    };
  }
  if (["plan", "command", "write", "action"].includes(kind)) {
    const envelope = validateEnvelope(source);
    return {
      kind: "plan",
      summary: clean(source.summary, 300),
      suggestions: (Array.isArray(source.suggestions)
        ? source.suggestions
        : [source.suggestions]
      )
        .map((item) => clean(item, 240))
        .filter(Boolean)
        .slice(0, 8),
      commands: envelope.operations,
    };
  }
  throw schemaError("AI 无法识别指令类型");
}

module.exports = { validateInstruction, validateQuery, GROUPS };
