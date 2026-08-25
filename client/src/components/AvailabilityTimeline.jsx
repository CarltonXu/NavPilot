import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { useI18n } from "../i18n/LocaleContext.jsx";
import Icon, { ContentIcon } from "./Icon.jsx";

const stateLabels = {
  online:["正常运行", "Operational"],
  degraded:["性能下降", "Degraded"],
  offline:["不可用", "Unavailable"],
  unknown:["暂无数据", "No data"],
};

function stateLabel(state, locale) {
  return stateLabels[state]?.[locale === "en" ? 1 : 0] || stateLabels.unknown[locale === "en" ? 1 : 0];
}

function formatDate(value, locale, withTime = false) {
  if (!value) return locale === "en" ? "Never" : "从未检测";
  return new Intl.DateTimeFormat(locale, withTime
    ? { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" }
    : { month:"short", day:"numeric" }).format(new Date(value));
}

function formatDuration(value, locale) {
  const minutes = Math.max(1, Math.round(Number(value || 0) / 60000));
  if (minutes < 60) return locale === "en" ? `${minutes} min` : `${minutes} 分钟`;
  const hours = Math.round(minutes / 6) / 10;
  return locale === "en" ? `${hours} hr` : `${hours} 小时`;
}

export function AvailabilityStrip({ value, onOpen, className = "", tooltipPlacement = "above" }) {
  const { locale } = useI18n();
  const zh = locale !== "en";
  const daily = value?.daily || Array.from({ length:30 }, (_, index) => ({ date:String(index), status:"unknown", checks:0 }));
  const availabilityLabel = value == null
    ? (zh ? "正在加载可用性" : "Loading availability")
    : value.availability == null
      ? (zh ? "等待首次检测" : "Awaiting first check")
      : `${value.availability}%`;
  const content = (
    <>
      <span className="availability-strip-head">
        <span className={`availability-state ${value?.state || "unknown"}`}><i />{stateLabel(value?.state || "unknown", locale)}</span>
        <strong className={value == null ? "availability-loading-label" : ""}>{availabilityLabel}</strong>
      </span>
      <span className="availability-bars" aria-label={zh ? "过去 30 天可用性" : "Availability over the last 30 days"}>
        {daily.map((bucket) => (
          <i className={bucket.status || "unknown"} key={bucket.date}>
            <span className={`availability-tooltip ${tooltipPlacement === "below" ? "below" : ""}`}>
              <strong>{bucket.date.length > 5 ? formatDate(`${bucket.date}T00:00:00Z`, locale) : (zh ? "暂无数据" : "No data")}</strong>
              <small>{stateLabel(bucket.status, locale)}</small>
              {bucket.checks > 0 && <small>{zh ? `可用率 ${bucket.availability}% · ${bucket.checks} 次检测` : `${bucket.availability}% uptime · ${bucket.checks} checks`}</small>}
              {bucket.averageLatencyMs != null && <small>{zh ? `平均 ${bucket.averageLatencyMs} ms` : `${bucket.averageLatencyMs} ms average`}</small>}
            </span>
          </i>
        ))}
      </span>
      <span className="availability-strip-foot"><small>{zh ? "30 天前" : "30 days ago"}</small><small>{zh ? "今天" : "Today"}</small></span>
    </>
  );
  if (!onOpen) return <span className={`availability-strip ${className}`}>{content}</span>;
  return (
    <span
      className={`availability-strip interactive ${className}`}
      role="button"
      tabIndex={0}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpen(); }}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onOpen(); } }}
    >{content}</span>
  );
}

function LatencyChart({ events, locale }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const samples = [...(events || [])].reverse().filter((event) => event.latencyMs != null);
  if (!samples.length) return <div className="availability-chart-empty">{locale === "en" ? "No latency samples" : "暂无响应时间样本"}</div>;
  const max = Math.max(250, ...samples.map((event) => event.latencyMs));
  const coordinates = samples.map((event, index) => ({
    event,
    x:samples.length === 1 ? 50 : index / (samples.length - 1) * 100,
    y:100 - Math.min(100, Number(event.latencyMs) / max * 100),
  }));
  const points = coordinates.map(({ x, y }) => `${x},${y}`).join(" ");
  const hovered = hoveredIndex == null ? null : coordinates[hoveredIndex];
  const yTicks = [max, Math.round(max * .75), Math.round(max * .5), Math.round(max * .25), 0];
  const xSamples = [coordinates[0], coordinates[Math.floor((coordinates.length - 1) / 2)], coordinates[coordinates.length - 1]];
  const timeLabel = (value, withTime = false) => formatDate(value, locale, withTime);
  return (
    <div className="availability-latency-chart">
      <div className="availability-chart-y-axis" aria-hidden="true">
        {yTicks.map((tick) => <small key={tick}>{tick} ms</small>)}
      </div>
      <div
        className="availability-chart-plot"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
          setHoveredIndex(Math.round(ratio * (samples.length - 1)));
        }}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={locale === "en" ? "Response-time trend" : "响应时间趋势"}>
          <defs><linearGradient id="availability-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".28"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
          <path className="grid-line" d="M0 0H100M0 25H100M0 50H100M0 75H100M0 100H100" />
          <polygon points={`0,100 ${points} 100,100`} fill="url(#availability-chart-fill)" />
          <polyline points={points} />
          {hovered && <g className="availability-chart-guides"><line x1={hovered.x} x2={hovered.x} y1="0" y2="100"/><line x1="0" x2="100" y1={hovered.y} y2={hovered.y}/></g>}
        </svg>
        {hovered && <>
          <i className="availability-chart-point" style={{ left:`${hovered.x}%`, top:`${hovered.y}%` }} />
          <div className={`availability-chart-tag ${hovered.x > 72 ? "align-right" : hovered.x < 28 ? "align-left" : ""} ${hovered.y < 30 ? "below" : ""}`} style={{ left:`${hovered.x}%`, top:`${hovered.y}%` }}>
            <strong>{hovered.event.latencyMs} ms</strong>
            <small>{timeLabel(hovered.event.checkedAtMs, true)}</small>
            <span className={`availability-state ${hovered.event.status || "unknown"}`}><i />{stateLabel(hovered.event.status, locale)}</span>
          </div>
        </>}
      </div>
      <div className="availability-chart-x-axis" aria-hidden="true">
        {xSamples.map((sample, index) => <small key={`${sample?.event.checkedAtMs || index}-${index}`}>{timeLabel(sample?.event.checkedAtMs)}</small>)}
      </div>
    </div>
  );
}

export function AvailabilityDetailModal({ item, initialValue = null, onClose, canCheck = false, onCheck = null }) {
  const { locale, errorMessage } = useI18n();
  const zh = locale !== "en";
  const [days, setDays] = useState(initialValue?.daily?.length || 30);
  const [value, setValue] = useState(initialValue);
  const [loading, setLoading] = useState(!initialValue);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setLoading(true);
    api.getItemAvailability(item.id || item.itemId, days)
      .then((result) => { if (live) { setValue(result); setError(""); } })
      .catch((cause) => live && setError(errorMessage(cause)))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [item.id, item.itemId, days, errorMessage]);
  useEffect(() => {
    const close = (event) => event.key === "Escape" && !checking && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [checking, onClose]);
  async function checkNow() {
    if (!canCheck || checking) return;
    setChecking(true);
    setError("");
    try {
      if (onCheck) await onCheck(item.id || item.itemId);
      else await api.checkItem(item.id || item.itemId);
      setValue(await api.getItemAvailability(item.id || item.itemId, days));
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setChecking(false); }
  }
  const state = value?.state || value?.status || "unknown";
  return (
    <div className="modal-mask availability-modal-mask" onMouseDown={(event) => event.target === event.currentTarget && !checking && onClose()}>
      <div className="modal availability-detail-modal" role="dialog" aria-modal="true" aria-labelledby="availability-detail-title">
        <header className="availability-detail-head">
          <span><ContentIcon value={item.icon || "icon:link"} cachedUrl={item.icon_cache_url} size={22} /></span>
          <div><h3 id="availability-detail-title">{item.name}</h3><p title={item.url}>{item.url}</p></div>
          <div className="availability-range-switch" role="group" aria-label={zh ? "统计周期" : "Time range"}>{[7, 30, 90].map((range) => <button type="button" className={days === range ? "active" : ""} key={range} onClick={() => setDays(range)}>{range}{zh ? "天" : "d"}</button>)}</div>
          <button type="button" className="mini-btn" aria-label={zh ? "关闭" : "Close"} onClick={onClose}><Icon name="close" size={15} /></button>
        </header>
        {error && <div className="admin-inline-error"><Icon name="shield" size={15}/>{error}</div>}
        <div className={`availability-detail-body ${loading ? "loading" : ""}`}>
          <div className="availability-kpis">
            <article><span className={`availability-kpi-icon ${state}`}><i /></span><div><small>{zh ? "当前状态" : "Current status"}</small><strong>{stateLabel(state, locale)}</strong></div></article>
            <article><span className="availability-kpi-icon"><Icon name="insights" size={15}/></span><div><small>{zh ? `${days} 天可用率` : `${days}-day uptime`}</small><strong>{value?.availability == null ? "—" : `${value.availability}%`}</strong></div></article>
            <article><span className="availability-kpi-icon"><Icon name="speed" size={15}/></span><div><small>{zh ? "平均响应" : "Average response"}</small><strong>{value?.averageLatencyMs == null ? "—" : `${value.averageLatencyMs} ms`}</strong></div></article>
            <article><span className="availability-kpi-icon"><Icon name="clock" size={15}/></span><div><small>{zh ? "最后检测" : "Last checked"}</small><strong>{formatDate(value?.lastCheckedAtMs, locale, true)}</strong></div></article>
          </div>
          <section className="availability-detail-section">
            <header><div><strong>{zh ? "可用性历史" : "Availability history"}</strong><small>{zh ? "绿色正常、黄色性能下降、红色不可用" : "Operational, degraded and unavailable periods"}</small></div><span>{value?.checks || 0} {zh ? "次检测" : "checks"}</span></header>
            <AvailabilityStrip value={value} />
          </section>
          <div className="availability-detail-columns">
            <section className="availability-detail-section">
              <header><div><strong>{zh ? "响应时间" : "Response time"}</strong><small>{zh ? "最近 60 次有效探测" : "Latest 60 valid checks"}</small></div></header>
              <LatencyChart events={value?.events} locale={locale} />
            </section>
            <section className="availability-detail-section">
              <header><div><strong>{zh ? "最近事件" : "Recent incidents"}</strong><small>{zh ? "不可用与恢复记录" : "Outages and recoveries"}</small></div></header>
              <div className="availability-incidents">
                {(value?.incidents || []).map((incident) => <div key={incident.startedAtMs}><span className={incident.recovered ? "recovered" : "offline"}><Icon name={incident.recovered ? "check" : "shield"} size={13}/></span><div><strong>{incident.recovered ? (zh ? "已恢复" : "Recovered") : (zh ? "故障持续中" : "Ongoing outage")}</strong><small>{formatDate(incident.startedAtMs, locale, true)}</small></div><em>{formatDuration(incident.durationMs, locale)}</em></div>)}
                {!value?.incidents?.length && <div className="availability-no-incidents"><Icon name="check" size={17}/><span>{zh ? "当前周期内没有故障记录" : "No incidents in this period"}</span></div>}
              </div>
            </section>
          </div>
        </div>
        <footer className="availability-detail-footer"><span className={`availability-state ${state}`}><i />{stateLabel(state, locale)}</span><div>{canCheck && <button type="button" className="icon-btn" disabled={checking} onClick={checkNow}><Icon name="refresh" size={14}/>{checking ? (zh ? "检测中…" : "Checking…") : (zh ? "立即检测" : "Check now")}</button>}<button type="button" className="icon-btn primary" onClick={onClose}>{zh ? "关闭" : "Close"}</button></div></footer>
      </div>
    </div>
  );
}

export { stateLabel, formatDate };
