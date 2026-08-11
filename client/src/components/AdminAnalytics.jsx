import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { useI18n } from "../i18n/LocaleContext.jsx";
import Icon, { ContentIcon } from "./Icon.jsx";
import AdminPageHeader from "./AdminPageHeader.jsx";

function localizedDimension(t, group, value) {
  const key = `analytics.dimensions.${group}.${String(value || "other").replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const translated = t(key);
  return translated === key ? value || t("analytics.unknown") : translated;
}

function detailAtPointer(detail, event) {
  const rect = event.currentTarget.getBoundingClientRect();
  const pointerX = Number(event.clientX) > 0 ? event.clientX : rect.left + rect.width / 2;
  const pointerY = Number(event.clientY) > 0 ? event.clientY : rect.top;
  return { ...detail, pointerX, pointerY, below: pointerY < 150 };
}

function ChartTooltip({ active }) {
  if (!active) return null;
  return <span className={`chart-hover-tooltip ${active.below ? "below" : ""}`} style={{ "--tooltip-x": `${active.pointerX}px`, "--tooltip-y": `${active.pointerY}px` }} role="tooltip"><strong>{active.label}</strong>{active.metrics.map(([label, value]) => <span key={label}><span>{label}</span><b>{value}</b></span>)}</span>;
}

function Bars({ data, group }) {
  const { t, locale } = useI18n();
  const [active, setActive] = useState(null);
  const max = Math.max(...data.map((item) => item.value), 1);
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);
  if (!data.length)
    return <div className="chart-empty">{t("analytics.noData")}</div>;
  return (
    <div className="interactive-chart"><div className="chart-bars" onMouseLeave={() => setActive(null)}>
      {data.map((item, index) => {
        const label = localizedDimension(t, group, item.name);
        const selected = { label, metrics:[[locale === "en" ? "Count" : "数量", Number(item.value).toLocaleString(locale)],[locale === "en" ? "Share" : "占比", `${total ? ((item.value / total) * 100).toFixed(1) : 0}%`]] };
        return (
          <div className={`chart-bar-row ${active?.key === item.name ? "active" : ""}`} key={`${item.name}-${item.value}`} role="img" aria-label={`${label} · ${item.value}`} tabIndex="0" onPointerEnter={(event) => setActive(detailAtPointer({key:item.name,...selected}, event))} onPointerMove={(event) => setActive(detailAtPointer({key:item.name,...selected}, event))} onFocus={(event) => setActive(detailAtPointer({key:item.name,...selected}, event))} onBlur={() => setActive(null)}>
            <span>{label}</span>
            <div className="chart-bar-track">
              <i style={{ width: `${(item.value / max) * 100}%` }} />
            </div>
            <strong>{Number(item.value).toLocaleString(locale)}</strong>
          </div>
        );
      })}
    </div><ChartTooltip active={active}/></div>
  );
}

function TopResources({ data, onSelect }) {
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
      {data.slice(0, 12).map((item, index) => (
        <div
          className="top-resource-row"
          key={`${item.id}-${index}`}
          tabIndex="0"
          role="button"
          onClick={() => onSelect?.(item)}
          onKeyDown={(event) =>
            (event.key === "Enter" || event.key === " ") && onSelect?.(item)
          }
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
  const [active, setActive] = useState(null);
  const days =
    locale === "en"
      ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      : ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const map = new Map(
    data.map((row) => [`${row.weekday}:${row.hour}`, row.value]),
  );
  const max = Math.max(...data.map((row) => row.value), 1);
  const total = data.reduce((sum, row) => sum + Number(row.value || 0), 0);
  return (
    <div className="interactive-chart"><div className="activity-heatmap" onMouseLeave={() => setActive(null)}>
      <div className="heatmap-hours">
        <span />
        <div><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
      </div>
      {days.map((day, weekday) => (
        <div className="heatmap-row" key={day}>
          <span>{day}</span>
          <div>
            {Array.from({ length: 24 }, (_, hour) => {
              const value = map.get(`${weekday}:${hour}`) || 0;
              const detail = {key:`${weekday}:${hour}`,label:`${day} ${String(hour).padStart(2,"0")}:00–${String((hour+1)%24).padStart(2,"0")}:00`,metrics:[[locale==="en"?"Visits":"访问次数",value.toLocaleString(locale)],[locale==="en"?"Share":"区间占比",`${total?((value/total)*100).toFixed(1):0}%`]]};
              return (
                <button
                  key={hour}
                  type="button"
                  aria-label={`${day} ${String(hour).padStart(2, "0")}:00 · ${value}`}
                  className={active?.key === `${weekday}:${hour}` ? "active" : ""}
                  onPointerEnter={(event) => setActive(detailAtPointer(detail, event))}
                  onPointerMove={(event) => setActive(detailAtPointer(detail, event))}
                  onFocus={(event) => setActive(detailAtPointer(detail, event))}
                  onBlur={() => setActive(null)}
                  style={{
                    opacity: value ? 0.18 + (value / max) * 0.82 : 0.06,
                  }}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div><ChartTooltip active={active}/></div>
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
function RegionMap({ data, networks, coverage }) {
  const { locale } = useI18n();
  const [active, setActive] = useState(null);
  const countries = data.filter((item) => item.name !== "unknown");
  const mapped = countries.filter((item) => regionPoints[item.name]);
  const max = Math.max(...mapped.map((item) => item.value), 1);
  const select = (item) => ({key:item.name,label:item.name,metrics:[[locale==="en"?"Visits":"访问次数",Number(item.value).toLocaleString(locale)],[locale==="en"?"Known-region share":"已识别地区占比",`${coverage?.known?((item.value/coverage.known)*100).toFixed(1):0}%`]]});
  return (
    <div className="interactive-chart"><div className="region-map-wrap" onMouseLeave={() => setActive(null)}>
      <div
        className="region-map"
        aria-label={locale === "en" ? "Visitor source map" : "访问来源地图"}
      >
        <div className="map-land land-a" />
        <div className="map-land land-b" />
        <div className="map-land land-c" />
        {mapped.map((item) => (
          <button
            type="button"
            key={item.name}
            className={active?.key===item.name?"active":""}
            onPointerEnter={(event) => setActive(detailAtPointer(select(item), event))}
            onPointerMove={(event) => setActive(detailAtPointer(select(item), event))}
            onFocus={(event) => setActive(detailAtPointer(select(item), event))}
            onBlur={() => setActive(null)}
            style={{
              left: `${regionPoints[item.name][0]}%`,
              top: `${regionPoints[item.name][1]}%`,
              "--point-size": `${9 + (item.value / max) * 14}px`,
            }}
            aria-label={`${item.name} · ${item.value}`}
          >
            <i />
            {item.name}
          </button>
        ))}
      </div>
      <div className="region-legend">
        {countries.length ? (
          countries.slice(0, 6).map((item) => (
            <button type="button" key={item.name} className={active?.key===item.name?"active":""} onPointerEnter={(event) => setActive(detailAtPointer(select(item), event))} onPointerMove={(event) => setActive(detailAtPointer(select(item), event))} onFocus={(event) => setActive(detailAtPointer(select(item), event))} onBlur={() => setActive(null)}>
              <i />
              {item.name}
              <b>{item.value}</b>
            </button>
          ))
        ) : (
          <p>
            {locale === "en"
              ? "No country data yet. Configure a trusted proxy country header or a GeoIP database."
              : "暂无国家/地区数据。配置可信代理国家头或 GeoIP 数据库后，地图会自动显示来源标记。"}
          </p>
        )}
        <small>
          {locale === "en"
            ? `${networks.length} network sources · ${coverage?.rate||0}% region coverage`
            : `${networks.length} 个来源网段（已隐私化） · 地区覆盖率 ${coverage?.rate||0}%`}
        </small>
      </div>
    </div><ChartTooltip active={active}/></div>
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
            <i className="resources" />
            {locale === "en" ? "Opened resources" : "被访问资源"}{" "}
            <b>{active.openedResources}</b>
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

const pieColors = ["var(--accent)", "#22a06b", "#f59e0b", "#8b5cf6", "#0ea5e9", "#ef5b5b", "#64748b"];

function DonutChart({ data, valueKey = "value", emptyLabel }) {
  const { locale } = useI18n();
  const [active, setActive] = useState(null);
  const visible = data.length > 7 ? [...data.slice(0, 6), { name:locale === "en" ? "Other" : "其他", [valueKey]:data.slice(6).reduce((sum,item)=>sum+(Number(item[valueKey])||0),0) }] : data.slice(0, 7);
  const total = visible.reduce((sum, item) => sum + (Number(item[valueKey]) || 0), 0);
  let cursor = 0;
  const segments = visible.map((item, index) => {
    const start = cursor;
    cursor += total ? ((Number(item[valueKey]) || 0) / total) * 100 : 0;
    return {item,index,start,end:cursor,color:pieColors[index]};
  });
  const select = (item) => ({key:item.name,label:item.name,metrics:[[locale==="en"?"Count":"数量",Number(item[valueKey]).toLocaleString(locale)],[locale==="en"?"Share":"占比",`${total?((item[valueKey]/total)*100).toFixed(1):0}%`]]});
  if (!total) return <div className="chart-empty">{emptyLabel}</div>;
  return (
    <div className="interactive-chart" onMouseLeave={() => setActive(null)}><div className="donut-layout">
      <div className="donut-chart">
        <svg viewBox="0 0 140 140" role="img" aria-label={locale==="en"?"Distribution chart":"分布图表"}>
          <circle className="donut-track" cx="70" cy="70" r="49" pathLength="100"/>
          {segments.map((segment) => <circle key={`${segment.item.name}-${segment.index}`} className={`donut-segment ${active?.key===segment.item.name?"active":""}`} cx="70" cy="70" r="49" pathLength="100" strokeDasharray={`${segment.end-segment.start} ${100-(segment.end-segment.start)}`} strokeDashoffset={-segment.start} transform="rotate(-90 70 70)" style={{"--segment-color":segment.color}} tabIndex="0" role="img" aria-label={`${segment.item.name} · ${segment.item[valueKey]}`} onPointerEnter={(event)=>setActive(detailAtPointer(select(segment.item),event))} onPointerMove={(event)=>setActive(detailAtPointer(select(segment.item),event))} onFocus={(event)=>setActive(detailAtPointer(select(segment.item),event))} onBlur={()=>setActive(null)}/>) }
        </svg>
        <span><strong>{active ? Number(visible.find(item=>item.name===active.key)?.[valueKey]||0).toLocaleString(locale) : total.toLocaleString(locale)}</strong><small>{active?.label || (locale==="en"?"Total":"总计")}</small></span>
      </div>
      <div className="donut-legend">
        {visible.map((item, index) => (
          <div className={`donut-legend-row ${active?.key===item.name?"active":""}`} key={`${item.name}-${index}`} tabIndex="0" role="img" aria-label={`${item.name} · ${item[valueKey]}`} onPointerEnter={(event)=>setActive(detailAtPointer(select(item),event))} onPointerMove={(event)=>setActive(detailAtPointer(select(item),event))} onFocus={(event)=>setActive(detailAtPointer(select(item),event))} onBlur={()=>setActive(null)}><i style={{ background: pieColors[index] }} /><span title={item.name}>{item.name}</span><b>{item[valueKey]}</b><small>{Math.round((item[valueKey] / total) * 100)}%</small></div>
        ))}
      </div>
    </div><ChartTooltip active={active}/></div>
  );
}

function TokenTrend({ data }) {
  const { locale } = useI18n();
  const [active, setActive] = useState(null);
  const max = Math.max(1, ...data.map((row) => row.totalTokens));
  const select = (row) => ({key:row.day,label:new Intl.DateTimeFormat(locale,{year:"numeric",month:"short",day:"numeric"}).format(new Date(`${row.day}T00:00:00`)),metrics:[[locale==="en"?"Total tokens":"Token 总量",Number(row.totalTokens).toLocaleString(locale)],[locale==="en"?"Input / output":"输入 / 输出",`${Number(row.inputTokens).toLocaleString(locale)} / ${Number(row.outputTokens).toLocaleString(locale)}`],[locale==="en"?"Requests":"请求数",Number(row.requests).toLocaleString(locale)]]});
  return (
    <div className="interactive-chart"><div className="token-trend" onMouseLeave={() => setActive(null)}>
      {data.map((row) => (
        <button type="button" key={row.day} className={active?.key===row.day?"active":""} style={{ height: `${Math.max(3, (row.totalTokens / max) * 100)}%` }} aria-label={`${row.day} · ${row.totalTokens} Token`} onPointerEnter={(event)=>setActive(detailAtPointer(select(row),event))} onPointerMove={(event)=>setActive(detailAtPointer(select(row),event))} onFocus={(event)=>setActive(detailAtPointer(select(row),event))} onBlur={()=>setActive(null)}/>
      ))}
      {!data.some((row) => row.totalTokens) && <span>所选范围内暂无 Token 数据</span>}
    </div><ChartTooltip active={active}/></div>
  );
}

function AnalyticsCard({ icon, title, description, children, className = "", action = null }) {
  return (
    <figure className={`chart-card ${className}`}>
      <figcaption><div className="chart-title-icon"><Icon name={icon} size={17} /></div><div><strong>{title}</strong>{description && <small>{description}</small>}</div>{action}</figcaption>
      {children}
    </figure>
  );
}

function AnalyticsDrawer({ detail, onClose, locale }) {
  useEffect(() => {
    const close = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  const isResource = detail.type === "resource";
  const value = detail.value;
  const rows = isResource
    ? [["URL", value.url || "—"], [locale === "en" ? "Description" : "描述", value.description || "—"], [locale === "en" ? "Space" : "空间", value.scope === "personal" ? (value.ownerName || "个人空间") : "公共空间"], [locale === "en" ? "Category" : "分类", value.categoryName || "未分类"], [locale === "en" ? "Unique visitors" : "独立访问用户", value.uniqueVisitors], [locale === "en" ? "Last opened" : "最近访问", value.lastOpenedAt ? new Date(value.lastOpenedAt).toLocaleString() : "—"]]
    : [[locale === "en" ? "Username" : "用户名", value.username || "—"], [locale === "en" ? "Requests" : "请求次数", value.requests], ["Token", value.totalTokens], [locale === "en" ? "Success rate" : "成功率", `${value.successRate || 0}%`], [locale === "en" ? "Average latency" : "平均响应耗时", `${value.averageLatencyMs || 0} ms`], ["TTFT", value.averageFirstTokenMs == null ? (locale === "en" ? "No streaming samples" : "暂无流式样本") : `${value.averageFirstTokenMs} ms`]];
  return (
    <div className="analytics-drawer-mask" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="analytics-drawer" role="dialog" aria-modal="true">
        <header><div className="chart-title-icon"><Icon name={isResource ? "link" : "assistant"} size={19} /></div><div><h2>{value.name}</h2><p>{isResource ? (locale === "en" ? "Resource access drill-down" : "资源访问下钻") : (locale === "en" ? "AI usage drill-down" : "AI 使用下钻")}</p></div><button className="mini-btn" onClick={onClose}>×</button></header>
        {isResource && Boolean(value.deleted) && <div className="analytics-detail-warning">该资源已删除，以下内容来自访问事件快照。</div>}
        <dl>{rows.map(([label, content]) => <React.Fragment key={label}><dt>{label}</dt><dd>{content ?? "—"}</dd></React.Fragment>)}</dl>
        <section><h3>{locale === "en" ? "Why this matters" : "指标用途"}</h3><p>{isResource ? (locale === "en" ? "Use visits and unique visitors together to distinguish repeated use from broad adoption." : "结合访问次数和独立用户数，区分高频重复使用与广泛使用。") : (locale === "en" ? "Use requests, tokens and latency together to evaluate cost, adoption and experience." : "结合请求、Token 与延迟评估使用活跃度、成本和体验。")}</p></section>
      </aside>
    </div>
  );
}

export default function AdminAnalytics() {
  const { t, errorMessage, locale } = useI18n();
  const [days, setDays] = useState(30);
  const [scope, setScope] = useState("all");
  const [ownerId, setOwnerId] = useState("");
  const [owners, setOwners] = useState([]);
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.getAnalyticsUsers().then((result) => setOwners(result.items || [])).catch(() => {}); }, []);
  useEffect(() => {
    let live = true;
    setLoading(true); setError("");
    api.getAnalytics({ days, scope, ownerId: scope === "personal" ? ownerId : "" })
      .then((result) => live && setData(result))
      .catch((err) => live && setError(errorMessage(err)))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [days, scope, ownerId, errorMessage]);
  const zh = locale !== "en";
  const copy = zh ? {
    description:"按空间、资源和用户理解真实使用行为，并监控 AI 成本与体验",
    all:"全平台",public:"公共空间",personal:"个人空间",allOwners:"全部个人用户",
    overview:"使用概览",overviewDesc:"回答所选空间是否被使用，以及使用覆盖面如何",
    access:"访问表现",accessDesc:"观察访问变化，识别异常波动与持续活跃度",
    resource:"资源表现",resourceDesc:"判断哪些资源真正有价值，以及资源结构是否健康",
    behavior:"用户与使用习惯",behaviorDesc:"了解谁在使用、从哪里进入、何时最活跃",
    ai:"AI 使用与性能",aiDesc:"同时评估采用率、Token 成本、可靠性和响应体验",
  } : {
    description:"Understand real usage by space, resource and user, while monitoring AI cost and experience",
    all:"All platform",public:"Public Space",personal:"Personal Spaces",allOwners:"All personal owners",
    overview:"Usage overview",overviewDesc:"Is the selected space being used, and how broad is adoption?",
    access:"Access performance",accessDesc:"Track changes and identify unusual or sustained activity",
    resource:"Resource performance",resourceDesc:"Find useful resources and evaluate information health",
    behavior:"Users and habits",behaviorDesc:"Understand who uses resources, entry points and active time",
    ai:"AI usage and performance",aiDesc:"Evaluate adoption, token cost, reliability and response experience",
  };
  if (!data && loading) return <div className="admin-panel">{t("common.loading")}</div>;
  if (!data && error) return <div className="admin-panel error-text">{error}</div>;
  const summary = data.summary;
  const aiSummary = data.ai?.summary || {};
  const number = (value) => Number(value || 0).toLocaleString(locale);
  const filterActions = <div className="analytics-filter-controls">
    <label><span>{t("analytics.range")}</span><select value={days} onChange={(event) => setDays(Number(event.target.value))}>{[7,30,90].map((value) => <option value={value} key={value}>{t("analytics.days",{count:value})}</option>)}</select></label>
    <div className="analytics-scope-switch" role="group">{[["all",copy.all],["public",copy.public],["personal",copy.personal]].map(([value,label]) => <button className={scope===value?"active":""} key={value} onClick={() => {setScope(value);if(value!=="personal")setOwnerId("");}}>{label}</button>)}</div>
    {scope === "personal" && <label><span>{zh?"空间所有者":"Space owner"}</span><select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}><option value="">{copy.allOwners}</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.displayName} (@{owner.username}) · {owner.resourceCount}</option>)}</select></label>}
  </div>;
  const accessKpis = [["opens","grid",zh?"资源访问":"Resource opens",zh?"实际打开资源的总次数":"Actual resource opens"],["activeUsers","user",zh?"访问用户":"Visitors",zh?"产生访问的独立登录用户":"Distinct signed-in visitors"],["openedResources","link",zh?"被访问资源":"Opened resources",zh?"至少被访问一次的资源":"Resources opened at least once"],["resources","folder",zh?"现有资源":"Current resources",zh?"当前筛选空间的资源总数":"Resources in selected spaces"],["averageOpensPerUser","grid",zh?"人均访问":"Opens per visitor",zh?"衡量使用深度，不代表用户规模":"Usage depth, not audience size"],["newResources","plus",zh?"新增资源":"New resources",zh?"统计周期内当前仍存在的新增资源":"Current resources created in range"]];
  const aiKpis = [["requests",zh?"AI 请求":"AI requests"],["users",zh?"使用用户":"AI users"],["totalTokens","Token"],["successRate",zh?"成功率":"Success rate","%"],["averageLatencyMs",zh?"平均响应耗时":"Avg latency"," ms"],["averageFirstTokenMs","TTFT"," ms"],["peakRpm","Peak RPM"],["peakTpm","Peak TPM"]];
  return (
    <div className={`analytics-dashboard ${loading ? "is-refreshing" : ""}`}>
      <AdminPageHeader icon="grid" title={t("analytics.title")} description={copy.description} actions={filterActions} />
      {error && <div className="admin-inline-error"><Icon name="shield" size={15}/>{error}</div>}
      <section className="analytics-section"><header><div><h3>{copy.overview}</h3><p>{copy.overviewDesc}</p></div>{loading && <span className="analytics-refreshing">{zh?"正在静默更新…":"Refreshing…"}</span>}</header>
        <div className="kpi-grid analytics-kpi-grid">{accessKpis.map(([key,icon,label,note]) => <article key={key} title={note}><span className="kpi-icon"><Icon name={icon} size={17}/></span><div><span>{label}</span><strong>{number(summary[key])}</strong><small>{note}</small></div></article>)}</div>
      </section>
      <section className="analytics-section"><header><div><h3>{copy.access}</h3><p>{copy.accessDesc}</p></div></header>
        <AnalyticsCard icon="grid" title={t("analytics.trend")} description={zh?"访问次数、独立用户和被访问资源按日变化":"Daily opens, visitors and opened resources"} className="analytics-trend-card"><TrendChart data={data.access.trend}/></AnalyticsCard>
      </section>
      <section className="analytics-section"><header><div><h3>{copy.resource}</h3><p>{copy.resourceDesc}</p></div></header>
        <div className="analytics-two-column align-start">
          <AnalyticsCard icon="link" title={zh?"热门资源":"Popular resources"} description={zh?"点击一行查看资源快照和访问明细":"Select a row for resource details"} className="top-resources-card"><TopResources data={data.access.topResources} onSelect={(value) => setDetail({type:"resource",value})}/></AnalyticsCard>
          <div className="analytics-stack">
            <AnalyticsCard icon="folder" title={zh?"分类资源占比":"Resources by category"} description={zh?"用于发现分类是否过度集中或大量未分类":"Find concentration and uncategorized resources"}><DonutChart data={data.resources.categories} emptyLabel={t("analytics.noData")}/></AnalyticsCard>
            <AnalyticsCard icon="shield" title={zh?"资源可用状态":"Resource availability"} description={zh?"在线、离线与待探测资源构成":"Online, offline and unknown composition"}><DonutChart data={data.resources.statuses} emptyLabel={t("analytics.noData")}/></AnalyticsCard>
          </div>
        </div>
      </section>
      <section className="analytics-section"><header><div><h3>{copy.behavior}</h3><p>{copy.behaviorDesc}</p></div></header>
        <div className="analytics-behavior-grid">
          <AnalyticsCard icon="grid" title={zh?"访问时间热点":"Activity heatmap"} description={zh?"星期 × 小时，用于判断高峰时段":"Weekday × hour for peak periods"} className="heatmap-card behavior-heatmap-card"><ActivityHeatmap data={data.access.heatmap}/></AnalyticsCard>
          <AnalyticsCard icon="user" title={zh?"访问用户排行":"Visitor ranking"} description={zh?"用于识别活跃用户，不等同于资源所有者":"Active visitors, distinct from space owners"}><Bars data={(data.access.visitors||[]).map((row)=>({name:row.name,value:row.value}))} group="users"/></AnalyticsCard>
          <AnalyticsCard icon="grid" title={t("analytics.sources")} description={zh?"资源从卡片、搜索或 AI 等入口被打开":"Where resource opens originate"}><Bars data={data.access.sources} group="sources"/></AnalyticsCard>
          <AnalyticsCard icon="user" title={t("analytics.devices")} description={zh?"用于判断桌面端与移动端适配优先级":"Prioritize desktop or mobile experience"}><Bars data={data.access.devices} group="devices"/></AnalyticsCard>
          <AnalyticsCard icon="globe" title={zh?"浏览器环境":"Browser environment"} description={zh?"用于识别兼容性验证和前端优化优先级":"Prioritize compatibility testing and frontend optimization"}><Bars data={data.access.browsers} group="browsers"/></AnalyticsCard>
        </div>
        <AnalyticsCard icon="globe" title={zh?"访问来源地区":"Visitor regions"} description={zh?"地区数据来自可信代理国家代码或本地 GeoIP 数据库，并展示当前覆盖率":"Country data comes from trusted proxy headers or the local GeoIP database, with coverage shown explicitly"} className="region-card behavior-region-card"><RegionMap data={data.access.regions} networks={data.access.networks} coverage={data.access.regionCoverage}/></AnalyticsCard>
      </section>
      <section className="analytics-section ai-analytics-section"><header><div><h3>{copy.ai}</h3><p>{copy.aiDesc}</p></div><span className="chart-tag">{zh?"TTFT 仅统计流式请求":"TTFT: streaming only"}</span></header>
        <div className="ai-kpi-grid">{aiKpis.map(([key,label,suffix=""]) => <article key={key}><span>{label}</span><strong>{aiSummary[key] == null ? "—" : `${number(aiSummary[key])}${suffix}`}</strong>{key==="peakRpm"&&<small>{zh?"活跃分钟峰值":"Peak active minute"}</small>}{key==="peakTpm"&&<small>{zh?"活跃分钟峰值":"Peak active minute"}</small>}</article>)}</div>
        <div className="analytics-two-column align-start">
          <AnalyticsCard icon="assistant" title={zh?"Token 增长趋势":"Token trend"} description={zh?"输入与输出 Token 的总量按日变化，用于成本趋势判断":"Daily token volume for cost trend"}><TokenTrend data={data.ai.trend}/><div className="token-summary"><span>{zh?"输入":"Input"} <b>{number(aiSummary.inputTokens)}</b></span><span>{zh?"输出":"Output"} <b>{number(aiSummary.outputTokens)}</b></span><span>{zh?"平均活跃分钟 TPM":"Avg active-minute TPM"} <b>{number(aiSummary.averageTpm)}</b></span></div></AnalyticsCard>
          <AnalyticsCard icon="user" title={zh?"用户 AI 用量":"AI usage by user"} description={zh?"点击用户下钻，联合判断采用率、成本和响应体验":"Select a user to inspect adoption, cost and experience"}><div className="analytics-entity-table"><div className="entity-table-head"><span>{zh?"用户":"User"}</span><span>{zh?"请求":"Requests"}</span><span>Token</span><span>{zh?"成功率":"Success"}</span></div>{data.ai.users.map((row)=><button key={row.id||row.name} onClick={()=>setDetail({type:"ai-user",value:row})}><span><strong>{row.name}</strong><small>{row.username?`@${row.username}`:"—"}</small></span><b>{row.requests}</b><b>{number(row.totalTokens)}</b><b>{row.successRate}%</b></button>)}{!data.ai.users.length&&<div className="chart-empty">{t("analytics.noData")}</div>}</div></AnalyticsCard>
        </div>
        <div className="analytics-two-column align-start">
          <AnalyticsCard icon="assistant" title={zh?"模型调用分布":"Model usage"} description={zh?"对比模型调用量与 Token 消耗，辅助模型治理":"Compare calls and tokens for model governance"}><DonutChart data={data.ai.models.map((row)=>({...row,value:row.requests}))} emptyLabel={t("analytics.noData")}/></AnalyticsCard>
          <AnalyticsCard icon="tools" title={zh?"AI 功能使用分布":"AI feature usage"} description={zh?"识别真正被使用的 AI 能力，避免维护低价值功能":"Identify useful capabilities and low-value features"}><Bars data={data.ai.features.map((row)=>({name:row.name,value:row.requests}))} group="features"/></AnalyticsCard>
        </div>
      </section>
      {detail && <AnalyticsDrawer detail={detail} onClose={()=>setDetail(null)} locale={locale}/>}
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
      <AdminPageHeader
        icon="shield"
        title={t("analytics.audit")}
        description={t("audit.description")}
        actions={<span className="chart-tag">{t("audit.records", { count: pagination.total })}</span>}
      />
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
