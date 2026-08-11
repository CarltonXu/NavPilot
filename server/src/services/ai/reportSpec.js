const WIDGET_TYPES = new Set(["kpi", "bar", "donut", "table", "tagCloud"]);
const DIMENSIONS = new Set(["space", "category", "status", "tag", "domain", "monitoring"]);
const METRICS = new Set(["resourceCount", "categoryCount", "onlineCount", "offlineCount", "unknownCount", "monitoringRate", "averageLatency", "clickCount"]);
const COLUMNS = new Set(["space", "name", "url", "description", "category", "status", "monitoring", "latency", "tags", "domain", "clicks"]);
const FILTERS = new Set(["space", "category", "status", "tag", "monitoring", "domain", "text"]);

function specError(message) {
  return Object.assign(new Error(message), { code:"AI_REPORT_SPEC_INVALID", status:502 });
}

function clean(value, max = 160) {
  const result = String(value || "").trim();
  if (!result || result.length > max) throw specError("报告字段为空或过长");
  return result;
}

function validateWidget(raw, index) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw specError("报告组件格式无效");
  const type = String(raw.type || "").trim(), value = {
    id:String(raw.id || `widget-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 60),
    type,
    title:clean(raw.title || type, 120),
    width:["third", "half", "full"].includes(raw.width) ? raw.width : "half",
  };
  if (!WIDGET_TYPES.has(type)) throw specError(`不支持的报告组件: ${type}`);
  if (type === "kpi") {
    value.metric = String(raw.metric || "");
    if (!METRICS.has(value.metric)) throw specError("KPI 指标无效");
  } else if (["bar", "donut", "tagCloud"].includes(type)) {
    value.dimension = String(raw.dimension || (type === "tagCloud" ? "tag" : ""));
    value.metric = String(raw.metric || "resourceCount");
    if (!DIMENSIONS.has(value.dimension) || !METRICS.has(value.metric)) throw specError("图表维度或指标无效");
    value.limit = Math.min(30, Math.max(3, Number(raw.limit) || 12));
    value.drilldown = raw.drilldown !== false;
  } else if (type === "table") {
    value.columns = [...new Set((Array.isArray(raw.columns) ? raw.columns : ["space","name","url","category","status"]).map(String))].filter((column) => COLUMNS.has(column)).slice(0, 10);
    if (!value.columns.length) throw specError("报告表格缺少有效列");
    value.limit = Math.min(500, Math.max(20, Number(raw.limit) || 200));
  }
  return value;
}

function validateReportSpec(raw, locale = "zh-CN") {
  const source = raw?.spec || raw?.report || raw;
  if (!source || typeof source !== "object" || Array.isArray(source)) throw specError("AI 未返回报告设计方案");
  const spaces = String(source.spaces || "current");
  if (!["current", "all_visible", "public", "personal"].includes(spaces)) throw specError("报告空间范围无效");
  const widgets = (Array.isArray(source.widgets) ? source.widgets : []).map(validateWidget).slice(0, 20);
  if (!widgets.length) throw specError("报告至少需要一个组件");
  const filters = [...new Set((Array.isArray(source.filters) ? source.filters : []).map(String))].filter((filter) => FILTERS.has(filter));
  return {
    version:1,
    title:clean(source.title || (locale === "en" ? "AI report" : "AI 动态报告"), 120),
    description:String(source.description || "").trim().slice(0, 500),
    spaces,
    filters,
    widgets,
    theme:["dark", "light", "auto"].includes(source.theme) ? source.theme : "dark",
  };
}

function reportDesignerContract() {
  return {
    spaces:["current","all_visible","public","personal"],
    filters:[...FILTERS],
    widgetTypes:{
      kpi:{metrics:[...METRICS]},
      bar:{dimensions:[...DIMENSIONS],metrics:[...METRICS]},
      donut:{dimensions:[...DIMENSIONS],metrics:[...METRICS]},
      tagCloud:{dimensions:[...DIMENSIONS],metrics:[...METRICS]},
      table:{columns:[...COLUMNS]},
    },
    widths:["third","half","full"],
  };
}

module.exports = { validateReportSpec, reportDesignerContract, WIDGET_TYPES, DIMENSIONS, METRICS, COLUMNS, FILTERS };
