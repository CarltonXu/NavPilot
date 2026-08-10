import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { useI18n } from "../i18n/LocaleContext.jsx";
import Icon, { ContentIcon } from "./Icon.jsx";

function localizedDimension(t, group, value) {
  const key = `analytics.dimensions.${group}.${String(value || "other").replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const translated = t(key);
  return translated === key ? value || t("analytics.unknown") : translated;
}

function Bars({ data, group }) {
  const { t } = useI18n();
  const max = Math.max(...data.map((item) => item.value), 1);
  if (!data.length)
    return <div className="chart-empty">{t("analytics.noData")}</div>;
  return (
    <div className="chart-bars">
      {data.map((item) => {
        const label = localizedDimension(t, group, item.name);
        return (
          <div className="chart-bar-row" key={`${item.name}-${item.value}`}>
            <span title={label}>{label}</span>
            <div className="chart-bar-track">
              <i style={{ width: `${(item.value / max) * 100}%` }} />
            </div>
            <strong>{item.value}</strong>
          </div>
        );
      })}
    </div>
  );
}

function TopResources({ data }) {
  const { locale } = useI18n();
  const text =
    locale === "en"
      ? {
          deleted: "Deleted",
          public: "Public",
          personal: "Personal",
          empty: "No description",
        }
      : {
          deleted: "已删除",
          public: "公共空间",
          personal: "个人空间",
          empty: "暂无描述",
        };
  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <div className="top-resource-list">
      {data.map((item, index) => (
        <div
          className="top-resource-row"
          key={`${item.id}-${index}`}
          tabIndex="0"
        >
          <span className="top-resource-rank">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="top-resource-main">
            <strong>
              {item.name}
              {Boolean(item.deleted) && (
                <i className="deleted-resource-badge">
                  <Icon name="minus" size={10} />
                  {text.deleted}
                </i>
              )}
            </strong>
            <small>{item.url || text.empty}</small>
            <span>
              <i style={{ width: `${(item.value / max) * 100}%` }} />
            </span>
          </span>
          <b>{item.value}</b>
          <div className="resource-hover-card">
            <header>
              <span>
                <ContentIcon value={item.icon} size={19} />
              </span>
              <div>
                <strong>{item.name}</strong>
                <small>
                  {item.scope === "personal" ? text.personal : text.public}
                </small>
              </div>
              {Boolean(item.deleted) && <i>{text.deleted}</i>}
            </header>
            <dl>
              <dt>URL</dt>
              <dd>{item.url || "—"}</dd>
              <dt>{locale === "en" ? "Description" : "描述"}</dt>
              <dd>{item.description || text.empty}</dd>
            </dl>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityHeatmap({ data }) {
  const { locale } = useI18n();
  const days =
    locale === "en"
      ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      : ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const map = new Map(
    data.map((row) => [`${row.weekday}:${row.hour}`, row.value]),
  );
  const max = Math.max(...data.map((row) => row.value), 1);
  return (
    <div className="activity-heatmap">
      <div className="heatmap-hours">
        <span />
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
      {days.map((day, weekday) => (
        <div className="heatmap-row" key={day}>
          <span>{day}</span>
          <div>
            {Array.from({ length: 24 }, (_, hour) => {
              const value = map.get(`${weekday}:${hour}`) || 0;
              return (
                <i
                  key={hour}
                  title={`${day} ${String(hour).padStart(2, "0")}:00 · ${value}`}
                  style={{
                    opacity: value ? 0.18 + (value / max) * 0.82 : 0.06,
                  }}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const regionPoints = {
  CN: [72, 43],
  US: [20, 43],
  CA: [18, 30],
  GB: [45, 32],
  DE: [49, 34],
  FR: [46, 37],
  JP: [84, 42],
  SG: [75, 68],
  AU: [83, 78],
  IN: [68, 55],
  BR: [31, 70],
  RU: [65, 25],
};
function RegionMap({ data, networks }) {
  const { locale } = useI18n();
  const known = data.filter(
    (item) => item.name !== "unknown" && regionPoints[item.name],
  );
  const max = Math.max(...known.map((item) => item.value), 1);
  return (
    <div className="region-map-wrap">
      <div
        className="region-map"
        aria-label={locale === "en" ? "Visitor source map" : "访问来源地图"}
      >
        <div className="map-land land-a" />
        <div className="map-land land-b" />
        <div className="map-land land-c" />
        {known.map((item) => (
          <span
            key={item.name}
            style={{
              left: `${regionPoints[item.name][0]}%`,
              top: `${regionPoints[item.name][1]}%`,
              "--point-size": `${9 + (item.value / max) * 14}px`,
            }}
            title={`${item.name} · ${item.value}`}
          >
            <i />
            {item.name}
          </span>
        ))}
      </div>
      <div className="region-legend">
        {known.length ? (
          known.slice(0, 6).map((item) => (
            <span key={item.name}>
              <i />
              {item.name}
              <b>{item.value}</b>
            </span>
          ))
        ) : (
          <p>
            {locale === "en"
              ? "No country data yet. Configure a reverse-proxy country header to enable map markers."
              : "暂无国家/地区数据。反向代理传入国家代码后，地图会自动显示来源标记。"}
          </p>
        )}
        <small>
          {locale === "en"
            ? `${networks.length} network sources (privacy-reduced)`
            : `${networks.length} 个来源网段（已隐私化）`}
        </small>
      </div>
    </div>
  );
}

function OwnershipCard({ value }) {
  const { locale } = useI18n();
  const c =
    locale === "en"
      ? {
          public: "Public resources",
          personal: "Personal resources",
          owners: "Users with resources",
          average: "Average per user",
        }
      : {
          public: "公共资源",
          personal: "个人资源",
          owners: "拥有资源的用户",
          average: "个人用户平均资源",
        };
  return (
    <div className="ownership-grid">
      <div>
        <span>{c.public}</span>
        <strong>{value.publicResources || 0}</strong>
      </div>
      <div>
        <span>{c.personal}</span>
        <strong>{value.personalResources || 0}</strong>
      </div>
      <div>
        <span>{c.owners}</span>
        <strong>{value.usersWithResources || 0}</strong>
      </div>
      <div>
        <span>{c.average}</span>
        <strong>{value.averagePersonalResources || 0}</strong>
      </div>
    </div>
  );
}

function TrendChart({ data }) {
  const { t, locale } = useI18n();
  const gradientId = useId().replace(/:/g, "");
  const wrapRef = useRef(null);
  const [active, setActive] = useState(null);
  const max = Math.max(...data.map((item) => item.opens), 1);
  const points = useMemo(
    () =>
      data.map((item, index) => ({
        ...item,
        x: data.length === 1 ? 50 : (index / (data.length - 1)) * 100,
        y: 88 - (item.opens / max) * 74,
      })),
    [data, max],
  );
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = points.length
    ? `M ${points[0].x} 88 L ${points.map((point) => `${point.x} ${point.y}`).join(" L ")} L ${points.at(-1).x} 88 Z`
    : "";
  function update(event) {
    if (!points.length) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / rect.width),
    );
    setActive(points[Math.round(ratio * (points.length - 1))]);
  }
  if (!points.length)
    return <div className="chart-empty">{t("analytics.noData")}</div>;
  return (
    <div
      className="line-chart"
      ref={wrapRef}
      onPointerMove={update}
      onPointerLeave={() => setActive(null)}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={t("analytics.trend")}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity=".42" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity=".02" />
          </linearGradient>
        </defs>
        {[14, 32.5, 51, 69.5, 88].map((y) => (
          <line
            className="chart-grid-line"
            key={y}
            x1="0"
            y1={y}
            x2="100"
            y2={y}
          />
        ))}
        <path className="trend-area" d={area} fill={`url(#${gradientId})`} />
        <polyline className="trend-line" points={line} />
        {active && (
          <line
            className="trend-reference"
            x1={active.x}
            y1="8"
            x2={active.x}
            y2="88"
          />
        )}
      </svg>
      <div className="trend-markers" aria-hidden="true">
        {points.map((point) => (
          <i
            key={point.day}
            className={`trend-point ${active?.day === point.day ? "active" : ""}`}
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
          />
        ))}
      </div>
      {active && (
        <div className="trend-tooltip" style={{ left: `${active.x}%` }}>
          <span>
            {new Intl.DateTimeFormat(locale, {
              month: "short",
              day: "numeric",
            }).format(new Date(`${active.day}T00:00:00`))}
          </span>
          <strong>
            <i />
            {t("analytics.opens")} <b>{active.opens}</b>
          </strong>
          <strong>
            <i className="secondary" />
            {t("analytics.activeUsers")} <b>{active.activeUsers}</b>
          </strong>
          <strong>
            <i className="growth" />
            {locale === "en" ? "New users" : "新增用户"}{" "}
            <b>{active.newUsers}</b>
          </strong>
          <strong>
            <i className="resources" />
            {locale === "en" ? "New resources" : "新增资源"}{" "}
            <b>{active.newResources}</b>
          </strong>
          <strong>
            <i className="ai" />
            {locale === "en" ? "AI usage" : "AI 使用"} <b>{active.aiUses}</b>
          </strong>
        </div>
      )}
      <div className="chart-axis">
        <span>{points[0]?.day}</span>
        <span>{points.at(-1)?.day}</span>
      </div>
    </div>
  );
}

const chartDefinitions = [
  ["sources", "sources", "sources", "grid"],
  ["devices", "devices", "devices", "user"],
  ["spaces", "spaces", "spaces", "building"],
  ["分类资源", "categories", "resources", "folder"],
  ["浏览器", "browsers", "resources", "globe"],
  ["操作系统", "systems", "resources", "tools"],
  ["资源状态", "statuses", "resources", "shield"],
];

export default function AdminAnalytics() {
  const { t, errorMessage, locale } = useI18n();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setError("");
    api
      .getAnalytics(days)
      .then((result) => live && setData(result))
      .catch((err) => live && setError(errorMessage(err)));
    return () => {
      live = false;
    };
  }, [days, errorMessage]);
  if (!data && !error)
    return <div className="admin-panel">{t("common.loading")}</div>;
  if (error) return <div className="admin-panel error-text">{error}</div>;
  const local =
    locale === "en"
      ? {
          onlineUsers: "Online now",
          newUsers: "New users",
          newResources: "New resources",
          aiUses: "AI usage",
          top: "Popular resources",
          topDesc: "Hover a resource for its snapshot",
          heatmap: "Activity heatmap",
          heatmapDesc: "Visits by weekday and hour",
          regions: "Visitor sources",
          regionsDesc: "Geographic markers and privacy-reduced networks",
          ownership: "User resource profile",
          ownershipDesc: "Public and personal resource distribution",
        }
      : {
          onlineUsers: "当前在线",
          newUsers: "新增用户",
          newResources: "新增资源",
          aiUses: "AI 使用次数",
          top: "热门资源",
          topDesc: "悬停资源可查看历史快照详情",
          heatmap: "访问热点分析",
          heatmapDesc: "按星期和时段展示访问密度",
          regions: "访问来源地图",
          regionsDesc: "地区标记与隐私化来源网段",
          ownership: "用户资源画像",
          ownershipDesc: "公共与个人资源分布情况",
        };
  const kpis = [
    ["opens", "grid", t("analytics.opens")],
    ["activeUsers", "user", t("analytics.activeUsers")],
    ["onlineUsers", "shield", local.onlineUsers],
    ["users", "user", t("analytics.users")],
    ["resources", "link", t("analytics.resources")],
    ["newUsers", "plus", local.newUsers],
    ["newResources", "folder", local.newResources],
    ["aiUses", "assistant", local.aiUses],
  ];
  return (
    <div className="analytics-dashboard">
      <div className="analytics-filters">
        <div>
          <h2>{t("analytics.title")}</h2>
          <p>{t("analytics.description")}</p>
        </div>
        <label>
          <span>{t("analytics.range")}</span>
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            {[7, 30, 90].map((value) => (
              <option value={value} key={value}>
                {t("analytics.days", { count: value })}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="kpi-grid analytics-kpi-grid">
        {kpis.map(([key, icon, label]) => (
          <article key={key}>
            <span className="kpi-icon">
              <Icon name={icon} size={17} />
            </span>
            <div>
              <span>{label}</span>
              <strong>{data.summary[key]}</strong>
            </div>
          </article>
        ))}
      </div>
      <div className="analytics-grid analytics-grid-expanded">
        <figure className="chart-card analytics-trend-card">
          <figcaption>
            <div className="chart-title-icon">
              <Icon name="grid" size={17} />
            </div>
            <div>
              <strong>{t("analytics.trend")}</strong>
              <small>{t("analytics.trendDesc")}</small>
            </div>
            <span className="chart-tag">{t("analytics.liveEvents")}</span>
          </figcaption>
          <TrendChart data={data.trend} />
        </figure>
        <figure className="chart-card top-resources-card">
          <figcaption>
            <div className="chart-title-icon">
              <Icon name="link" size={17} />
            </div>
            <div>
              <strong>{local.top}</strong>
              <small>{local.topDesc}</small>
            </div>
          </figcaption>
          <TopResources data={data.topResources} />
        </figure>
        <figure className="chart-card heatmap-card">
          <figcaption>
            <div className="chart-title-icon">
              <Icon name="grid" size={17} />
            </div>
            <div>
              <strong>{local.heatmap}</strong>
              <small>{local.heatmapDesc}</small>
            </div>
          </figcaption>
          <ActivityHeatmap data={data.heatmap} />
        </figure>
        <figure className="chart-card region-card">
          <figcaption>
            <div className="chart-title-icon">
              <Icon name="globe" size={17} />
            </div>
            <div>
              <strong>{local.regions}</strong>
              <small>{local.regionsDesc}</small>
            </div>
          </figcaption>
          <RegionMap data={data.regions} networks={data.networks} />
        </figure>
        <figure className="chart-card ownership-card">
          <figcaption>
            <div className="chart-title-icon">
              <Icon name="user" size={17} />
            </div>
            <div>
              <strong>{local.ownership}</strong>
              <small>{local.ownershipDesc}</small>
            </div>
          </figcaption>
          <OwnershipCard value={data.ownership} />
        </figure>
        {chartDefinitions.map(([title, key, group, icon]) => (
          <figure className="chart-card dimension-card" key={key}>
            <figcaption>
              <div className="chart-title-icon">
                <Icon name={icon} size={17} />
              </div>
              <strong>
                {["sources", "devices", "spaces"].includes(title)
                  ? t(`analytics.${title}`)
                  : locale === "en"
                    ? {
                        分类资源: "Resources by folder",
                        浏览器: "Browsers",
                        操作系统: "Operating systems",
                        资源状态: "Resource status",
                      }[title] || title
                    : title}
              </strong>
            </figcaption>
            <Bars data={data[key]} group={group} />
          </figure>
        ))}
      </div>
    </div>
  );
}

function EventTag({ type }) {
  const { auditEventLabel } = useI18n();
  return (
    <span className="audit-event-tag">
      <Icon
        name={
          type.startsWith("auth.")
            ? "user"
            : type.startsWith("settings.")
              ? "settings"
              : type.startsWith("category.")
                ? "folder"
                : type.startsWith("ai.")
                  ? "assistant"
                  : "link"
        }
        size={14}
      />
      {auditEventLabel(type)}
    </span>
  );
}

const FIELD_LABELS = {
  id: "ID",
  name: "名称",
  url: "URL",
  icon: "图标",
  description: "描述",
  categoryId: "分类 ID",
  categoryName: "分类",
  sortOrder: "顺序",
  checkMethod: "探测方式",
  checkTarget: "探测目标",
  checkEnabled: "启用探测",
  scope: "空间",
  status: "状态",
  version: "版本",
  orderedIds: "排序 ID",
  affectedCount: "影响数量",
  affectedIds: "影响对象",
  operationTypes: "操作类型",
  operationCount: "操作数量",
  changedFields: "变更字段",
  reason: "原因",
  inputHash: "指令摘要",
  displayName: "显示名",
  role: "角色",
};
function fieldLabel(key, locale) {
  if (locale === "en")
    return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
  return FIELD_LABELS[key] || key;
}
function DetailValue({ value, locale }) {
  if (value === null || value === "") return "—";
  if (typeof value === "boolean")
    return locale === "en" ? (value ? "Yes" : "No") : value ? "是" : "否";
  if (Array.isArray(value))
    return (
      <div className="audit-value-list">
        {value.map((item, index) => (
          <span key={index}>
            {typeof item === "object" ? JSON.stringify(item) : String(item)}
          </span>
        ))}
      </div>
    );
  if (typeof value === "object")
    return (
      <dl className="audit-nested">
        {Object.entries(value).map(([key, item]) => (
          <React.Fragment key={key}>
            <dt>{fieldLabel(key, locale)}</dt>
            <dd>
              <DetailValue value={item} locale={locale} />
            </dd>
          </React.Fragment>
        ))}
      </dl>
    );
  return String(value);
}
function DetailBlock({ title, value }) {
  const { locale } = useI18n();
  if (!value || (typeof value === "object" && !Object.keys(value).length))
    return null;
  return (
    <section className="audit-detail-block">
      <h3>{title}</h3>
      <dl>
        {Object.entries(value).map(([key, item]) => (
          <React.Fragment key={key}>
            <dt>{fieldLabel(key, locale)}</dt>
            <dd>
              <DetailValue value={item} locale={locale} />
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </section>
  );
}

function AuditDrawer({ event, onClose }) {
  const { t } = useI18n();
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const key = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const { before, after, ...metadata } = event.metadata || {};
  return (
    <div
      className="audit-drawer-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside
        className="audit-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-detail-title"
      >
        <header>
          <div>
            <span className={`outcome-tag ${event.outcome}`}>
              {t(`audit.outcomes.${event.outcome}`)}
            </span>
            <h2 id="audit-detail-title">{t("audit.detailTitle")}</h2>
            <EventTag type={event.eventType} />
          </div>
          <button
            ref={closeRef}
            className="mini-btn audit-close"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            ×
          </button>
        </header>
        <div className="audit-drawer-body">
          <section className="audit-facts">
            <div>
              <span>{t("analytics.time")}</span>
              <strong>{new Date(event.occurredAt).toLocaleString()}</strong>
            </div>
            <div>
              <span>{t("analytics.actor")}</span>
              <strong>{event.actorUsername || t("audit.anonymous")}</strong>
              <small>{event.actorRole || "—"}</small>
            </div>
            <div>
              <span>{t("audit.target")}</span>
              <strong>
                {event.targetType || "—"} · {event.targetId || "—"}
              </strong>
            </div>
            <div>
              <span>IP</span>
              <strong>{event.ipPrefix || "—"}</strong>
              <small>
                {[event.browserFamily, event.osFamily, event.deviceClass]
                  .filter(Boolean)
                  .join(" / ") || "—"}
              </small>
            </div>
          </section>
          <DetailBlock title={t("audit.before")} value={before} />
          <DetailBlock title={t("audit.after")} value={after} />
          <DetailBlock title={t("audit.metadata")} value={metadata} />
        </div>
      </aside>
    </div>
  );
}

export function AuditTable() {
  const { t, errorMessage } = useI18n();
  const [rows, setRows] = useState([]),
    [pagination, setPagination] = useState({
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 1,
    }),
    [pageSize, setPageSize] = useState(20),
    [selected, setSelected] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const page = pagination.page;
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    api
      .getAuditEvents(page, pageSize)
      .then((result) => {
        if (live) {
          setRows(result.items);
          setPagination(result.pagination);
        }
      })
      .catch((err) => live && setError(errorMessage(err)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [page, pageSize, errorMessage]);
  const first = pagination.total
      ? (pagination.page - 1) * pagination.pageSize + 1
      : 0,
    last = Math.min(pagination.page * pagination.pageSize, pagination.total);
  function changePageSize(event) {
    const value = Number(event.target.value);
    setPageSize(value);
    setPagination((current) => ({ ...current, page: 1, pageSize: value }));
  }
  return (
    <div className="admin-panel audit-panel">
      <div className="audit-heading">
        <div>
          <h2>{t("analytics.audit")}</h2>
          <p>{t("audit.description")}</p>
        </div>
        <span className="chart-tag">
          {t("audit.records", { count: pagination.total })}
        </span>
      </div>
      {error && <div className="error-text">{error}</div>}
      <div className={`audit-table ${loading ? "loading" : ""}`}>
        <table>
          <thead>
            <tr>
              <th>{t("analytics.time")}</th>
              <th>{t("analytics.event")}</th>
              <th>{t("analytics.actor")}</th>
              <th>{t("audit.target")}</th>
              <th>{t("analytics.outcome")}</th>
              <th aria-label={t("audit.view")}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                tabIndex="0"
                onClick={() => setSelected(row)}
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") && setSelected(row)
                }
              >
                <td>{new Date(row.occurredAt).toLocaleString()}</td>
                <td>
                  <EventTag type={row.eventType} />
                </td>
                <td>{row.actorUsername || t("audit.anonymous")}</td>
                <td>
                  {row.targetType
                    ? `${row.targetType} · ${row.targetId || "—"}`
                    : "—"}
                </td>
                <td>
                  <span className={`outcome-tag ${row.outcome}`}>
                    {t(`audit.outcomes.${row.outcome}`)}
                  </span>
                </td>
                <td>
                  <Icon name="link" size={14} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && !loading && !error && (
          <div className="chart-empty">{t("analytics.noData")}</div>
        )}
        {loading && !rows.length && (
          <div className="chart-empty">{t("common.loading")}</div>
        )}
      </div>
      <div className="audit-pagination">
        <div className="audit-page-summary">
          <strong>
            {t("audit.rangeSummary", { first, last, total: pagination.total })}
          </strong>
          <span>
            {t("audit.pageSummary", {
              page: pagination.page,
              totalPages: pagination.totalPages,
            })}
          </span>
        </div>
        <div className="audit-page-controls">
          <label>
            <span>{t("audit.perPage")}</span>
            <select
              aria-label={t("audit.pageSize")}
              value={pageSize}
              disabled={loading}
              onChange={changePageSize}
            >
              {[10, 20, 50, 100].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <span>{t("audit.items")}</span>
          </label>
          <div className="audit-page-nav">
            <button
              className="pagination-btn"
              aria-label={t("audit.previous")}
              disabled={pagination.page <= 1 || loading}
              onClick={() =>
                setPagination((current) => ({
                  ...current,
                  page: current.page - 1,
                }))
              }
            >
              <Icon name="chevronLeft" size={15} />
              <span>{t("audit.previous")}</span>
            </button>
            <span className="page-indicator">
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              className="pagination-btn"
              aria-label={t("audit.next")}
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() =>
                setPagination((current) => ({
                  ...current,
                  page: current.page + 1,
                }))
              }
            >
              <span>{t("audit.next")}</span>
              <Icon name="chevronRight" size={15} />
            </button>
          </div>
        </div>
      </div>
      {selected && (
        <AuditDrawer event={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
