import React, { useEffect, useId, useMemo, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { useI18n } from "../i18n/LocaleContext.jsx";
import ThemeSwitcher from "./ThemeSwitcher.jsx";
import LocaleSwitcher from "./LocaleSwitcher.jsx";
import { AccountMenu } from "./AuthDialogs.jsx";
import Icon, { ContentIcon } from "./Icon.jsx";
import { openGlobalSearch } from "./GlobalSearch.jsx";

const compact = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const COLORS = [
  "var(--accent)",
  "var(--online)",
  "var(--offline)",
  "var(--unknown)",
  "#c084fc",
  "#f59e0b",
];
const copy = {
  "zh-CN": {
    title: "公共空间洞察",
    desc: "从真实使用数据中发现值得关注的公共资源、内容趋势和搜索需求。",
    back: "返回公共空间",
    period: "统计周期",
    days: "天",
    resources: "公共资源",
    newResources: "周期新增",
    opens: "资源访问",
    opened: "被访问资源",
    online: "当前在线率",
    visitors: "访问用户",
    access: "资源访问趋势",
    accessDesc: "访问次数、访问用户与被访问资源",
    growth: "公共资源增长",
    growthDesc: "当前仍存在资源的创建趋势",
    search: "搜索与发现",
    searchDesc: "仅统计返回过公共资源的全局搜索",
    searches: "有效搜索",
    ctr: "结果点击率",
    searchTrend: "公共搜索趋势",
    terms: "热门搜索词",
    termCloud: "搜索热度词云",
    termCloudDesc: "词语越大，代表周期内搜索次数越多",
    termRank: "热词排行",
    searchCount: "搜索次数",
    publicClickCount: "公共点击",
    termsEmpty: "达到隐私阈值后，热门词会显示在这里",
    top: "热门公共资源",
    topDesc: "按周期内真实访问次数排序",
    categories: "资源分类",
    tags: "热门标签",
    status: "可用状态",
    empty: "当前周期还没有足够的数据",
    opensLine: "访问次数",
    visitorsLine: "访问用户",
    resourcesLine: "被访问资源",
    totalLine: "资源总数",
    addedLine: "新增资源",
    searchLine: "有效搜索",
    clickLine: "公共点击",
    unknown: "未知",
    onlineStatus: "在线",
    offlineStatus: "失联",
    loading: "正在汇总公共空间数据…",
    denied: "登录后可查看公共空间洞察",
    login: "立即登录",
    disabled: "公共空间洞察暂未开放",
    privacy: "热门搜索词经过匿名化、敏感内容过滤，并达到公开阈值后才会展示。",
    open: "访问资源",
    count: "个资源",
  },
  en: {
    title: "Public space insights",
    desc: "Discover useful public resources, content trends and search demand from real usage.",
    back: "Back to public space",
    period: "Period",
    days: "days",
    resources: "Public resources",
    newResources: "New resources",
    opens: "Resource opens",
    opened: "Opened resources",
    online: "Current availability",
    visitors: "Visitors",
    access: "Resource access trend",
    accessDesc: "Opens, visitors and resources reached",
    growth: "Public resource growth",
    growthDesc: "Creation trend of resources that still exist",
    search: "Search & discovery",
    searchDesc: "Only global searches returning public results",
    searches: "Eligible searches",
    ctr: "Result CTR",
    searchTrend: "Public search trend",
    terms: "Top search terms",
    termCloud: "Search interest cloud",
    termCloudDesc: "Larger terms were searched more often in this period",
    termRank: "Term ranking",
    searchCount: "Searches",
    publicClickCount: "Public clicks",
    termsEmpty: "Terms appear after reaching the privacy threshold",
    top: "Popular public resources",
    topDesc: "Ranked by real opens in this period",
    categories: "Resource categories",
    tags: "Popular tags",
    status: "Availability",
    empty: "Not enough data in this period",
    opensLine: "Opens",
    visitorsLine: "Visitors",
    resourcesLine: "Resources",
    totalLine: "Total resources",
    addedLine: "Added",
    searchLine: "Searches",
    clickLine: "Public clicks",
    unknown: "Unknown",
    onlineStatus: "Online",
    offlineStatus: "Offline",
    loading: "Summarizing public space data…",
    denied: "Sign in to view public space insights",
    login: "Sign in",
    disabled: "Public space insights are not available",
    privacy:
      "Popular terms are anonymized, filtered for sensitive content and only shown above the disclosure threshold.",
    open: "Open resource",
    count: "resources",
  },
};

function Brand({ branding }) {
  return (
    <a className="brand" href="/">
      <span className="brand-mark">
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt="" />
        ) : (
          <Icon name="assistant" size={17} />
        )}
      </span>
      {branding.siteName || "NavPilot"}
      <span className="brand-tag">NAV</span>
    </a>
  );
}
function format(value) {
  return compact.format(Number(value) || 0);
}
function pct(value) {
  return value == null ? "—" : `${Number(value).toFixed(1)}%`;
}
function Kpi({ icon, label, value, sub }) {
  return (
    <article>
      <span>
        <Icon name={icon} size={18} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {sub && <em>{sub}</em>}
      </div>
    </article>
  );
}

function tooltipAt(detail, event) {
  const rect = event.currentTarget.getBoundingClientRect();
  const pointerX =
    Number(event.clientX) > 0 ? event.clientX : rect.left + rect.width / 2;
  const pointerY = Number(event.clientY) > 0 ? event.clientY : rect.top;
  return { ...detail, pointerX, pointerY, below: pointerY < 150 };
}

function PublicChartTooltip({ active }) {
  if (!active) return null;
  return (
    <span
      className={`chart-hover-tooltip ${active.below ? "below" : ""}`}
      style={{
        "--tooltip-x": `${active.pointerX}px`,
        "--tooltip-y": `${active.pointerY}px`,
      }}
      role="tooltip"
    >
      <strong>{active.label}</strong>
      {active.metrics.map(([label, value, color]) => (
        <span className="public-tooltip-metric" key={label}>
          <i style={{ background: color || "var(--accent)" }} />
          <span>{label}</span>
          <b>{value}</b>
        </span>
      ))}
    </span>
  );
}

function smoothLinePath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, "");
}

function niceAxisMax(value) {
  const raw = Math.max(1, Number(value) || 0);
  const power = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / power;
  const nice =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * power;
}

function LineChart({ data, lines, emptyText }) {
  const { locale } = useI18n();
  const [active, setActive] = useState(null);
  const gradientBase = useId().replace(/:/g, "");
  const max = niceAxisMax(
      Math.max(
        1,
        ...data.flatMap((row) =>
          lines.map((line) => Number(row[line.key]) || 0),
        ),
      ),
    ),
    tickPositions = [10, 29.5, 49, 68.5, 88],
    ticks = [4, 3, 2, 1, 0].map((step) => (max * step) / 4);
  const x = (index) =>
      data.length <= 1 ? 50 : (index / (data.length - 1)) * 100,
    y = (value) => 88 - ((Number(value) || 0) / max) * 78;
  const labelIndices = [
    0,
    Math.floor((data.length - 1) / 2),
    data.length - 1,
  ].filter(
    (value, index, array) => value >= 0 && array.indexOf(value) === index,
  );
  if (!data.length)
    return <div className="public-insights-empty">{emptyText}</div>;
  const dateLabel = (day) =>
    new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(`${day}T00:00:00`));
  const detailFor = (row, index) => ({
    key: row.day,
    index,
    label: dateLabel(row.day),
    metrics: lines.map((line, lineIndex) => [
      line.label,
      Number(row[line.key] || 0).toLocaleString(locale),
      line.color || COLORS[lineIndex],
    ]),
  });
  const series = lines.map((line, lineIndex) => {
    const points = data.map((row, index) => ({
      x: x(index),
      y: y(row[line.key]),
      value: row[line.key],
    }));
    const path = smoothLinePath(points);
    return {
      line,
      lineIndex,
      points,
      path,
      area: points.length
        ? `${path} L ${points.at(-1).x} 88 L ${points[0].x} 88 Z`
        : "",
    };
  });
  return (
    <div className="public-line-chart interactive-chart">
      <div className="public-chart-y-axis" aria-hidden="true">
        {ticks.map((value, index) => (
          <span
            key={`${value}-${index}`}
            style={{ top: `${tickPositions[index]}%` }}
          >
            {format(value)}
          </span>
        ))}
      </div>
      <svg
        className="public-chart-plot"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        onPointerLeave={() => setActive(null)}
      >
        <defs>
          {lines.map((line, index) => (
            <linearGradient
              id={`${gradientBase}-${index}`}
              key={line.key}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0"
                stopColor={line.color || COLORS[index]}
                stopOpacity=".22"
              />
              <stop
                offset="1"
                stopColor={line.color || COLORS[index]}
                stopOpacity=".015"
              />
            </linearGradient>
          ))}
        </defs>
        {tickPositions.map((position) => (
          <line
            className="public-chart-grid-line"
            key={position}
            x1="0"
            y1={position}
            x2="100"
            y2={position}
          />
        ))}
        {series.map(({ line, lineIndex, path, area }) => (
          <g
            className="public-chart-series"
            key={line.key}
            style={{ "--series-color": line.color || COLORS[lineIndex] }}
          >
            <path
              className="public-chart-waterfall"
              d={area}
              fill={`url(#${gradientBase}-${lineIndex})`}
            />
            <path className="public-chart-line" d={path} />
          </g>
        ))}
        {active && (
          <g className="public-chart-crosshair" aria-hidden="true">
            <line
              className="vertical"
              x1={x(active.index)}
              y1="10"
              x2={x(active.index)}
              y2="88"
            />
            <line
              className="horizontal"
              x1="0"
              y1={y(data[active.index]?.[lines[0].key])}
              x2="100"
              y2={y(data[active.index]?.[lines[0].key])}
            />
          </g>
        )}
        <g className="public-chart-hit-areas">
          {data.map((row, index) => {
            const half = 50 / Math.max(1, data.length - 1);
            const left = Math.max(0, index === 0 ? 0 : x(index) - half);
            const right = Math.min(
              100,
              index === data.length - 1 ? 100 : x(index) + half,
            );
            return (
              <rect
                key={row.day}
                x={left}
                y="10"
                width={Math.max(0.1, right - left)}
                height="78"
                tabIndex="0"
                aria-label={`${dateLabel(row.day)} · ${lines
                  .map((line) => `${line.label} ${row[line.key] || 0}`)
                  .join(" · ")}`}
                onPointerEnter={(event) =>
                  setActive(tooltipAt(detailFor(row, index), event))
                }
                onPointerMove={(event) =>
                  setActive(tooltipAt(detailFor(row, index), event))
                }
                onFocus={(event) =>
                  setActive(tooltipAt(detailFor(row, index), event))
                }
                onBlur={() => setActive(null)}
              />
            );
          })}
        </g>
      </svg>
      <div className="public-chart-markers" aria-hidden="true">
        {series.flatMap(({ line, lineIndex, points }) =>
          points.map((point, index) => (
            <i
              key={`${line.key}-${index}`}
              className={active?.index === index ? "active" : ""}
              style={{
                "--series-color": line.color || COLORS[lineIndex],
                left: `${point.x}%`,
                top: `${point.y}%`,
              }}
            />
          )),
        )}
      </div>
      <div className="public-chart-x-axis" aria-hidden="true">
        {labelIndices.map((index) => (
          <span key={index} style={{ left: `${x(index)}%` }}>
            {String(data[index]?.day || "").slice(5)}
          </span>
        ))}
      </div>
      <div className="public-chart-legend">
        {lines.map((line, index) => (
          <span key={line.key}>
            <i style={{ background: line.color || COLORS[index] }} />
            {line.label}
          </span>
        ))}
      </div>
      <PublicChartTooltip active={active} />
    </div>
  );
}
function Distribution({ rows, onClick, emptyText }) {
  const { locale } = useI18n();
  const [active, setActive] = useState(null);
  const max = Math.max(1, ...rows.map((row) => row.value));
  const total = rows.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const detailFor = (row) => ({
    key: row.id ?? row.name,
    label: row.name,
    metrics: [
      [
        locale === "en" ? "Resources" : "资源数量",
        Number(row.value || 0).toLocaleString(locale),
        "var(--accent)",
      ],
      [
        locale === "en" ? "Share" : "占比",
        `${total ? ((Number(row.value || 0) / total) * 100).toFixed(1) : 0}%`,
        "var(--online)",
      ],
    ],
  });
  return rows.length ? (
    <div
      className="public-distribution interactive-chart"
      onPointerLeave={() => setActive(null)}
    >
      {rows.map((row) => (
        <button
          key={row.id ?? row.name}
          className={active?.key === (row.id ?? row.name) ? "active" : ""}
          onClick={() => onClick?.(row)}
          onPointerEnter={(event) =>
            setActive(tooltipAt(detailFor(row), event))
          }
          onPointerMove={(event) => setActive(tooltipAt(detailFor(row), event))}
          onFocus={(event) => setActive(tooltipAt(detailFor(row), event))}
          onBlur={() => setActive(null)}
        >
          <span>
            <b>{row.name}</b>
            <small>{row.value}</small>
          </span>
          <i>
            <em style={{ width: `${(row.value / max) * 100}%` }} />
          </i>
        </button>
      ))}
      <PublicChartTooltip active={active} />
    </div>
  ) : (
    <div className="public-insights-empty compact">{emptyText}</div>
  );
}

function SearchTermCloud({ terms, copy, emptyText, onSelect }) {
  const { locale } = useI18n();
  const [active, setActive] = useState(null);
  if (!terms?.length)
    return <div className="public-insights-empty compact">{emptyText}</div>;
  const values = terms.map((term) => Number(term.searches) || 0);
  const min = Math.min(...values),
    max = Math.max(...values),
    range = Math.max(1, max - min);
  const cloudSlots = [
    [50, 54, 0],
    [31, 43, -4],
    [70, 42, 4],
    [42, 68, 3],
    [64, 67, -3],
    [20, 59, -6],
    [81, 58, 6],
    [51, 34, 2],
    [32, 76, 5],
    [75, 76, -5],
    [17, 72, 3],
    [86, 70, -3],
    [24, 35, 5],
    [76, 30, -4],
    [52, 82, 0],
  ];
  const detailFor = (term) => ({
    key: term.name,
    label: term.name,
    metrics: [
      [
        copy.searchCount,
        Number(term.searches || 0).toLocaleString(locale),
        "var(--accent)",
      ],
      [
        copy.publicClickCount,
        Number(term.publicClicks || 0).toLocaleString(locale),
        "var(--online)",
      ],
      [
        "CTR",
        `${term.searches ? ((term.publicClicks / term.searches) * 100).toFixed(1) : 0}%`,
        "#c084fc",
      ],
    ],
  });
  return (
    <div
      className="public-search-term-cloud interactive-chart"
      onPointerLeave={() => setActive(null)}
    >
      <svg
        className="public-term-cloud-shape"
        viewBox="0 0 610 300"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="public-term-cloud-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent-soft)" />
            <stop offset="1" stopColor="var(--bg)" />
          </linearGradient>
        </defs>
        <path
          d="M101 267C49 267 18 236 18 194C18 151 49 119 92 115C106 67 149 38 198 45C225 17 270 7 307 25C339 2 387 5 417 34C464 23 509 55 518 102C562 106 592 140 592 181C592 230 555 267 505 267H101Z"
          fill="url(#public-term-cloud-fill)"
        />
        <path
          d="M101 267C49 267 18 236 18 194C18 151 49 119 92 115C106 67 149 38 198 45C225 17 270 7 307 25C339 2 387 5 417 34C464 23 509 55 518 102C562 106 592 140 592 181C592 230 555 267 505 267H101Z"
          className="public-term-cloud-outline"
        />
      </svg>
      {terms.map((term, index) => {
        const heat = (Number(term.searches || 0) - min) / range;
        const slot = cloudSlots[index % cloudSlots.length];
        return (
          <button
            key={term.name}
            className={active?.key === term.name ? "active" : ""}
            style={{
              "--term-size": `${13 + heat * 17}px`,
              "--term-opacity": 0.58 + heat * 0.42,
              "--term-color": COLORS[index % COLORS.length],
              "--term-x": `${slot[0]}%`,
              "--term-y": `${slot[1]}%`,
              "--term-rotate": `${slot[2]}deg`,
            }}
            onClick={() => onSelect(term.name)}
            onPointerEnter={(event) =>
              setActive(tooltipAt(detailFor(term), event))
            }
            onPointerMove={(event) =>
              setActive(tooltipAt(detailFor(term), event))
            }
            onFocus={(event) => setActive(tooltipAt(detailFor(term), event))}
            onBlur={() => setActive(null)}
          >
            {term.name}
          </button>
        );
      })}
      <PublicChartTooltip active={active} />
    </div>
  );
}
function Donut({ rows, labels, emptyText }) {
  const { locale } = useI18n();
  const [active, setActive] = useState(null);
  const total = rows.reduce((sum, row) => sum + row.value, 0),
    radius = 42,
    circumference = 2 * Math.PI * radius;
  let offset = 0;
  if (!total)
    return <div className="public-insights-empty compact">{emptyText}</div>;
  const detailFor = (row, index) => ({
    key: row.name,
    label: labels[row.name] || row.name,
    metrics: [
      [
        locale === "en" ? "Resources" : "资源数量",
        Number(row.value || 0).toLocaleString(locale),
        COLORS[index],
      ],
      [
        locale === "en" ? "Share" : "占比",
        `${((Number(row.value || 0) / total) * 100).toFixed(1)}%`,
        COLORS[index],
      ],
    ],
  });
  return (
    <div
      className="public-donut interactive-chart"
      onPointerLeave={() => setActive(null)}
    >
      <svg viewBox="0 0 110 110" aria-label="Resource availability">
        <circle className="track" cx="55" cy="55" r={radius} />
        {rows.map((row, index) => {
          const length = (row.value / total) * circumference,
            node = (
              <circle
                key={row.name}
                cx="55"
                cy="55"
                r={radius}
                stroke={COLORS[index]}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                className={active?.key === row.name ? "active" : ""}
                tabIndex="0"
                aria-label={`${labels[row.name] || row.name}: ${row.value}`}
                onPointerEnter={(event) =>
                  setActive(tooltipAt(detailFor(row, index), event))
                }
                onPointerMove={(event) =>
                  setActive(tooltipAt(detailFor(row, index), event))
                }
                onFocus={(event) =>
                  setActive(tooltipAt(detailFor(row, index), event))
                }
                onBlur={() => setActive(null)}
              />
            );
          offset += length;
          return node;
        })}
        <text x="55" y="52" textAnchor="middle">
          {total}
        </text>
        <text className="sub" x="55" y="67" textAnchor="middle">
          TOTAL
        </text>
      </svg>
      <div>
        {rows.map((row, index) => (
          <span
            key={row.name}
            className={active?.key === row.name ? "active" : ""}
            tabIndex="0"
            onPointerEnter={(event) =>
              setActive(tooltipAt(detailFor(row, index), event))
            }
            onPointerMove={(event) =>
              setActive(tooltipAt(detailFor(row, index), event))
            }
            onFocus={(event) =>
              setActive(tooltipAt(detailFor(row, index), event))
            }
            onBlur={() => setActive(null)}
          >
            <i style={{ background: COLORS[index] }} />
            <b>{labels[row.name] || row.name}</b>
            <small>{row.value}</small>
          </span>
        ))}
      </div>
      <PublicChartTooltip active={active} />
    </div>
  );
}

export default function PublicInsights({
  theme,
  onThemeChange,
  branding,
  settings,
}) {
  const auth = useAuth(),
    { locale, errorMessage } = useI18n(),
    c = copy[locale] || copy["zh-CN"];
  const [days, setDays] = useState(30),
    [data, setData] = useState(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(null);
  useEffect(() => {
    if (auth.loading) return;
    if (!settings?.enabled) {
      setError({ code: "PUBLIC_INSIGHTS_DISABLED" });
      return;
    }
    if (!settings.anonymousEnabled && !auth.authenticated) {
      setError({ code: "AUTH_REQUIRED" });
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getPublicInsights(days)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((value) => {
        if (active) setError(value);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    days,
    auth.loading,
    auth.authenticated,
    settings?.enabled,
    settings?.anonymousEnabled,
  ]);
  const labels = {
    online: c.onlineStatus,
    offline: c.offlineStatus,
    unknown: c.unknown,
  };
  const searchSummary = useMemo(() => data?.search || {}, [data]);
  function openResource(item, index) {
    api
      .clickItem(item.id, {
        surface: "public-insights",
        viewMode: "insights",
        position: index + 1,
        eventId: `${Date.now()}-${item.id}-${Math.random().toString(36).slice(2)}`,
      })
      .catch(() => {});
    window.open(item.url, "_blank", "noopener,noreferrer");
  }
  const blocked =
      error?.code === "AUTH_REQUIRED" ||
      (!settings?.anonymousEnabled && !auth.authenticated),
    disabled =
      error?.code === "PUBLIC_INSIGHTS_DISABLED" || settings?.enabled === false;
  return (
    <div className="public-insights-page">
      <header className="topbar public-insights-topbar">
        <Brand branding={branding} />
        <a className="icon-btn public-insights-back" href="/">
          <Icon name="chevronLeft" size={15} />
          {c.back}
        </a>
        <div className="topbar-actions">
          <LocaleSwitcher />
          <ThemeSwitcher theme={theme} onChange={onThemeChange} />
          <AccountMenu />
        </div>
      </header>
      <main className="public-insights-shell">
        <section className="public-insights-hero">
          <div>
            <span>
              <Icon name="insights" size={18} />
              {locale === "en" ? "PUBLIC DISCOVERY" : "PUBLIC DISCOVERY"}
            </span>
            <h1>{c.title}</h1>
            <p>{c.desc}</p>
          </div>
          <label>
            {c.period}
            <select
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              {[7, 30, 90].map((value) => (
                <option key={value} value={value}>
                  {value} {c.days}
                </option>
              ))}
            </select>
          </label>
        </section>
        {auth.loading || (loading && !data) ? (
          <div className="public-insights-state loading">
            <Icon name="refresh" size={24} />
            <strong>{c.loading}</strong>
          </div>
        ) : blocked ? (
          <div className="public-insights-state">
            <Icon name="user" size={28} />
            <strong>{c.denied}</strong>
            <button
              className="icon-btn primary"
              onClick={() => auth.setLoginOpen(true)}
            >
              {c.login}
            </button>
          </div>
        ) : disabled ? (
          <div className="public-insights-state">
            <Icon name="insights" size={28} />
            <strong>{c.disabled}</strong>
          </div>
        ) : error ? (
          <div className="public-insights-state error">
            <Icon name="shield" size={28} />
            <strong>{errorMessage(error)}</strong>
          </div>
        ) : (
          data && (
            <>
              <section className="public-insights-kpis">
                <Kpi
                  icon="grid"
                  label={c.resources}
                  value={format(data.summary.resources)}
                />
                <Kpi
                  icon="plus"
                  label={c.newResources}
                  value={`+${format(data.summary.newResources)}`}
                />
                <Kpi
                  icon="bolt"
                  label={c.opens}
                  value={format(data.summary.opens)}
                />
                <Kpi
                  icon="target"
                  label={c.opened}
                  value={format(data.summary.openedResources)}
                />
                <Kpi
                  icon="user"
                  label={c.visitors}
                  value={format(data.summary.visitors)}
                />
                <Kpi
                  icon="shield"
                  label={c.online}
                  value={pct(data.summary.onlineRate)}
                />
              </section>
              <section className="public-insights-grid two">
                <article className="public-insights-card">
                  <header>
                    <span>
                      <Icon name="bolt" size={18} />
                    </span>
                    <div>
                      <h2>{c.access}</h2>
                      <p>{c.accessDesc}</p>
                    </div>
                  </header>
                  <LineChart
                    data={data.accessTrend}
                    emptyText={c.empty}
                    lines={[
                      { key: "opens", label: c.opensLine },
                      {
                        key: "visitors",
                        label: c.visitorsLine,
                        color: "var(--online)",
                      },
                      {
                        key: "openedResources",
                        label: c.resourcesLine,
                        color: "#c084fc",
                      },
                    ]}
                  />
                </article>
                <article className="public-insights-card">
                  <header>
                    <span>
                      <Icon name="insights" size={18} />
                    </span>
                    <div>
                      <h2>{c.growth}</h2>
                      <p>{c.growthDesc}</p>
                    </div>
                  </header>
                  <LineChart
                    data={data.growthTrend}
                    emptyText={c.empty}
                    lines={[
                      { key: "totalResources", label: c.totalLine },
                      {
                        key: "addedResources",
                        label: c.addedLine,
                        color: "var(--online)",
                      },
                    ]}
                  />
                </article>
              </section>
              <section className="public-insights-section-heading">
                <div>
                  <span>
                    <Icon name="search" size={19} />
                  </span>
                  <div>
                    <h2>{c.search}</h2>
                    <p>{c.searchDesc}</p>
                  </div>
                </div>
                <small>
                  <Icon name="shield" size={13} />
                  {c.privacy}
                </small>
              </section>
              <section className="public-insights-grid search">
                <article className="public-insights-card search-chart">
                  <div className="public-search-summary">
                    <span>
                      <small>{c.searches}</small>
                      <strong>
                        {format(searchSummary.searchesWithPublicResults)}
                      </strong>
                    </span>
                    <span>
                      <small>{c.ctr}</small>
                      <strong>{pct(searchSummary.clickThroughRate)}</strong>
                    </span>
                  </div>
                  <LineChart
                    data={searchSummary.trend || []}
                    emptyText={c.empty}
                    lines={[
                      { key: "searches", label: c.searchLine },
                      {
                        key: "publicClicks",
                        label: c.clickLine,
                        color: "var(--online)",
                      },
                    ]}
                  />
                </article>
                <article className="public-insights-card term-card">
                  <header>
                    <span>
                      <Icon name="search" size={18} />
                    </span>
                    <div>
                      <h2>{c.terms}</h2>
                      <p>
                        {locale === "en"
                          ? `At least ${searchSummary.minCount || 3} searches`
                          : `至少出现 ${searchSummary.minCount || 3} 次`}
                      </p>
                    </div>
                  </header>
                  {searchSummary.terms?.length ? (
                    <div className="public-term-layout">
                      <div className="public-term-ranking">
                        <strong>{c.termRank}</strong>
                        {searchSummary.terms.slice(0, 10).map((term, index) => (
                          <button
                            key={term.name}
                            onClick={() => openGlobalSearch(term.name)}
                          >
                            <i>{index + 1}</i>
                            <span>{term.name}</span>
                            <b>{term.searches}</b>
                          </button>
                        ))}
                      </div>
                      <div className="public-term-cloud-panel">
                        <div className="public-term-cloud-heading">
                          <strong>{c.termCloud}</strong>
                          <small>{c.termCloudDesc}</small>
                        </div>
                        <SearchTermCloud
                          terms={searchSummary.terms}
                          copy={c}
                          emptyText={c.termsEmpty}
                          onSelect={openGlobalSearch}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="public-insights-empty compact">
                      {c.termsEmpty}
                    </div>
                  )}
                </article>
              </section>
              <section className="public-insights-section-heading simple">
                <div>
                  <span>
                    <Icon name="star" size={19} />
                  </span>
                  <div>
                    <h2>{c.top}</h2>
                    <p>{c.topDesc}</p>
                  </div>
                </div>
              </section>
              <section className="public-resource-rank">
                {data.topResources.length ? (
                  data.topResources.map((item, index) => (
                    <button
                      key={item.id}
                      onClick={() => openResource(item, index)}
                    >
                      <i>{String(index + 1).padStart(2, "0")}</i>
                      <span className="public-resource-icon">
                        <ContentIcon value={item.icon} cachedUrl={item.icon_cache_url} size={25} />
                      </span>
                      <span className="public-resource-copy">
                        <b>{item.name}</b>
                        <small>{item.categoryPath || item.url}</small>
                        <em>{item.description || item.url}</em>
                      </span>
                      <span className={`public-resource-status ${item.status}`}>
                        <i />
                        {labels[item.status]}
                      </span>
                      <span className="public-resource-visits">
                        <b>{format(item.visits)}</b>
                        <small>{c.opensLine}</small>
                      </span>
                      <Icon name="chevronRight" size={15} />
                    </button>
                  ))
                ) : (
                  <div className="public-insights-empty">{c.empty}</div>
                )}
              </section>
              <section className="public-insights-grid structure">
                <article className="public-insights-card">
                  <header>
                    <span>
                      <Icon name="folder" size={18} />
                    </span>
                    <div>
                      <h2>{c.categories}</h2>
                      <p>
                        {data.categories.reduce(
                          (sum, row) => sum + row.value,
                          0,
                        )}{" "}
                        {c.count}
                      </p>
                    </div>
                  </header>
                  <Distribution
                    rows={data.categories}
                    emptyText={c.empty}
                    onClick={(row) => {
                      location.href = `/?category=${row.id}`;
                    }}
                  />
                </article>
                <article className="public-insights-card">
                  <header>
                    <span>
                      <Icon name="tag" size={18} />
                    </span>
                    <div>
                      <h2>{c.tags}</h2>
                      <p>{data.tags.length} tags</p>
                    </div>
                  </header>
                  <div className="public-tag-cloud">
                    {data.tags.length ? (
                      data.tags.map((tag) => (
                        <a
                          key={tag.name}
                          href={`/?tag=${encodeURIComponent(tag.name)}`}
                          title={`${tag.name}: ${tag.value}`}
                        >
                          <span>#{tag.name}</span>
                          <b>{tag.value}</b>
                        </a>
                      ))
                    ) : (
                      <div className="public-insights-empty compact">
                        {c.empty}
                      </div>
                    )}
                  </div>
                </article>
                <article className="public-insights-card">
                  <header>
                    <span>
                      <Icon name="shield" size={18} />
                    </span>
                    <div>
                      <h2>{c.status}</h2>
                      <p>{c.resources}</p>
                    </div>
                  </header>
                  <Donut
                    rows={data.statuses}
                    labels={labels}
                    emptyText={c.empty}
                  />
                </article>
              </section>
            </>
          )
        )}
      </main>
    </div>
  );
}
