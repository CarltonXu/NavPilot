import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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

export function AvailabilityStrip({ value, onOpen, onDayOpen = null, className = "", tooltipPlacement = "above", displayDays = null }) {
  const { locale } = useI18n();
  const zh = locale !== "en";
  const usePortalTooltip = className.includes("overview-availability");
  const [portalTooltip, setPortalTooltip] = useState(null);
  const daily = value?.daily || Array.from({ length:30 }, (_, index) => ({ date:String(index), status:"unknown", checks:0 }));
  const visibleDayCount = Number.isFinite(displayDays) && displayDays > 0
    ? Math.max(1, Math.floor(displayDays))
    : daily.length;
  const visibleDaily = daily.slice(-visibleDayCount);
  const availabilityLabel = value == null
    ? (zh ? "正在加载可用性" : "Loading availability")
    : value.availability == null
      ? (zh ? "等待首次检测" : "Awaiting first check")
      : `${value.availability}%`;
  const dayAction = onDayOpen || onOpen;
  const content = (
    <>
      <span className="availability-strip-head">
        <span className={`availability-state ${value?.state || "unknown"}`}><i />{stateLabel(value?.state || "unknown", locale)}</span>
        <strong className={value == null ? "availability-loading-label" : ""}>{availabilityLabel}</strong>
      </span>
      <span
        className="availability-bars"
        style={{ "--availability-bars":visibleDaily.length }}
        aria-label={zh ? `过去 ${visibleDaily.length} 天可用性` : `Availability over the last ${visibleDaily.length} days`}
      >
        {visibleDaily.map((bucket, index) => (
          <i
            className={bucket.status || "unknown"}
            key={bucket.date}
            role={dayAction && bucket.date.length > 5 ? "button" : undefined}
            tabIndex={dayAction && bucket.date.length > 5 ? 0 : undefined}
            onClick={dayAction && bucket.date.length > 5 ? (event) => { event.preventDefault(); event.stopPropagation(); dayAction(bucket.date); } : undefined}
            onKeyDown={dayAction && bucket.date.length > 5 ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); dayAction(bucket.date); } } : undefined}
            onMouseEnter={usePortalTooltip ? (event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const placeBelow = tooltipPlacement === "below" || rect.top < 86;
              setPortalTooltip({ bucket, index, left:rect.left + rect.width / 2, top:placeBelow ? rect.bottom + 8 : rect.top - 8, below:placeBelow });
            } : undefined}
            onMouseLeave={usePortalTooltip ? () => setPortalTooltip(null) : undefined}
            onFocus={usePortalTooltip ? (event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const placeBelow = tooltipPlacement === "below" || rect.top < 86;
              setPortalTooltip({ bucket, index, left:rect.left + rect.width / 2, top:placeBelow ? rect.bottom + 8 : rect.top - 8, below:placeBelow });
            } : undefined}
            onBlur={usePortalTooltip ? () => setPortalTooltip(null) : undefined}
          >
            <span className={`availability-tooltip ${tooltipPlacement === "below" ? "below" : ""} ${usePortalTooltip ? "portal-source" : ""}`}>
              <strong>{bucket.date.length > 5 ? formatDate(`${bucket.date}T00:00:00Z`, locale) : (zh ? "暂无数据" : "No data")}</strong>
              <small>{stateLabel(bucket.status, locale)}</small>
              {bucket.checks > 0 && <small>{zh ? `可用率 ${bucket.availability}% · ${bucket.checks} 次检测` : `${bucket.availability}% uptime · ${bucket.checks} checks`}</small>}
              {bucket.averageLatencyMs != null && <small>{zh ? `平均 ${bucket.averageLatencyMs} ms` : `${bucket.averageLatencyMs} ms average`}</small>}
            </span>
          </i>
        ))}
      </span>
      <span className="availability-strip-foot"><small>{zh ? `${visibleDaily.length} 天前` : `${visibleDaily.length} days ago`}</small><small>{zh ? "今天" : "Today"}</small></span>
      {usePortalTooltip && portalTooltip && createPortal(
        <span
          className={`availability-tooltip availability-tooltip-portal ${portalTooltip.below ? "below" : ""} ${portalTooltip.index === 0 ? "edge-start" : portalTooltip.index === visibleDaily.length - 1 ? "edge-end" : ""}`}
          style={{ left:portalTooltip.left, top:portalTooltip.top }}
        >
          <strong>{portalTooltip.bucket.date.length > 5 ? formatDate(`${portalTooltip.bucket.date}T00:00:00Z`, locale) : (zh ? "暂无数据" : "No data")}</strong>
          <small>{stateLabel(portalTooltip.bucket.status, locale)}</small>
          {portalTooltip.bucket.checks > 0 && <small>{zh ? `可用率 ${portalTooltip.bucket.availability}% · ${portalTooltip.bucket.checks} 次检测` : `${portalTooltip.bucket.availability}% uptime · ${portalTooltip.bucket.checks} checks`}</small>}
          {portalTooltip.bucket.averageLatencyMs != null && <small>{zh ? `平均 ${portalTooltip.bucket.averageLatencyMs} ms` : `${portalTooltip.bucket.averageLatencyMs} ms average`}</small>}
        </span>,
        document.body,
      )}
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

function LatencyChart({ events, locale, aggregation = "events" }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const samples = [...(events || [])].filter((event) => event.latencyMs != null).sort((a, b) => a.checkedAtMs - b.checkedAtMs);
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
            <small>{timeLabel(hovered.event.checkedAtMs, aggregation !== "daily")}</small>
            {aggregation === "daily" && <small>{hovered.event.checks || 0} {locale === "en" ? "checks" : "次探测"}</small>}
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

function DayHistory({ value, locale, loading, selectedHour = null, onSelectHour = null }) {
  const zh = locale !== "en";
  if (loading) return <div className="availability-day-empty loading"><Icon name="refresh" size={20}/><strong>{zh ? "正在加载当日记录…" : "Loading daily checks…"}</strong></div>;
  if (!value?.events?.length) return <div className="availability-day-empty"><span><Icon name="clock" size={21}/></span><strong>{zh ? "当天没有探测记录" : "No checks on this day"}</strong><small>{zh ? "可以返回每日概览选择其他日期。" : "Return to the daily overview and choose another date."}</small></div>;
  const hourly = Array.from({ length:24 }, (_, hour) => ({ hour, events:[], slots:Array.from({ length:12 }, (_, index) => ({ minute:index * 5, events:[] })) }));
  value.events.forEach((event) => {
    const hour = new Date(event.checkedAtMs).getHours();
    if (hourly[hour]) {
      hourly[hour].events.push(event);
      const slot = Math.min(11, Math.floor(new Date(event.checkedAtMs).getMinutes() / 5));
      hourly[hour].slots[slot].events.push(event);
    }
  });
  hourly.forEach((bucket) => {
    const known = bucket.events.filter((event) => event.status === "online" || event.status === "offline");
    const offline = bucket.events.some((event) => event.status === "offline");
    const degraded = bucket.events.some((event) => event.status === "degraded");
    bucket.status = !bucket.events.length ? "unknown" : offline ? "offline" : degraded ? "degraded" : "online";
    bucket.availability = known.length ? Number((known.filter((event) => event.status === "online").length / known.length * 100).toFixed(1)) : null;
    const latency = bucket.events.filter((event) => event.latencyMs != null).map((event) => Number(event.latencyMs));
    bucket.averageLatencyMs = latency.length ? Math.round(latency.reduce((sum, sample) => sum + sample, 0) / latency.length) : null;
    bucket.slots.forEach((slot) => slot.events.sort((a, b) => b.checkedAtMs - a.checkedAtMs));
  });
  return <div className="availability-day-history">
    <div className="availability-day-summary">
      <article><small>{zh ? "探测次数" : "Checks"}</small><strong>{value.checks}</strong></article>
      <article><small>{zh ? "当日可用率" : "Daily uptime"}</small><strong>{value.availability == null ? "—" : `${value.availability}%`}</strong></article>
      <article><small>{zh ? "平均响应" : "Average response"}</small><strong>{value.averageLatencyMs == null ? "—" : `${value.averageLatencyMs} ms`}</strong></article>
    </div>
    <div className="availability-day-timeline">
      <div className="availability-heatmap-head" aria-hidden="true">
        <span>{zh ? "时间" : "Hour"}</span>
        <div>{Array.from({ length:12 }, (_, index) => <small key={index}>{String(index * 5).padStart(2, "0")}</small>)}</div>
        <span>{zh ? "小时概览" : "Summary"}</span>
      </div>
      <div className="availability-day-heatmap" aria-label={zh ? "单日五分钟探测热力图" : "Daily five-minute check heatmap"}>
        {hourly.map((bucket) => <section className={`availability-heatmap-row ${bucket.status} ${selectedHour === bucket.hour ? "active" : ""}`} key={bucket.hour}>
          <button type="button" className="availability-heatmap-hour" disabled={!bucket.events.length} onClick={() => onSelectHour?.(selectedHour === bucket.hour ? null : bucket.hour)}>
            {String(bucket.hour).padStart(2, "0")}:00
          </button>
          <div className="availability-heatmap-slots">
            {bucket.slots.map((slot, index) => {
              const event = slot.events[0];
              const status = event?.status || "unknown";
              const endHour = slot.minute === 55 ? (bucket.hour + 1) % 24 : bucket.hour;
              const endMinute = (slot.minute + 5) % 60;
              return <button type="button" className={`availability-heatmap-cell ${status}`} key={slot.minute} disabled={!event} onClick={() => onSelectHour?.(bucket.hour)} aria-label={`${String(bucket.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")} ${stateLabel(status, locale)}`}>
                <i />
                <div className={`availability-tooltip ${index === 0 ? "edge-start" : index === 11 ? "edge-end" : ""}`}>
                  <strong>{String(bucket.hour).padStart(2, "0")}:{String(slot.minute).padStart(2, "0")}–{String(endHour).padStart(2, "0")}:{String(endMinute).padStart(2, "0")}</strong>
                  {event ? <><small>{formatDate(event.checkedAtMs, locale, true)}</small><small>{stateLabel(status, locale)} · {event.latencyMs == null ? (zh ? "无响应时间" : "No response time") : `${event.latencyMs} ms`}</small>{slot.events.length > 1 && <small>{zh ? `此时间槽共 ${slot.events.length} 次探测` : `${slot.events.length} checks in this slot`}</small>}</> : <small>{zh ? "该时间槽没有探测记录" : "No check in this time slot"}</small>}
                </div>
              </button>;
            })}
          </div>
          <button type="button" className="availability-heatmap-summary" disabled={!bucket.events.length} onClick={() => onSelectHour?.(selectedHour === bucket.hour ? null : bucket.hour)}>
            <strong>{bucket.availability == null ? "—" : `${bucket.availability}%`}</strong>
            <small>{bucket.events.length ? `${bucket.events.length}${zh ? " 次" : " checks"}` : (zh ? "无记录" : "No data")}</small>
          </button>
        </section>)}
      </div>
      <footer className="availability-day-history-note"><small>{zh ? "点击小时可筛选下方响应时间，再次点击恢复全天" : "Select an hour to filter the response chart; select it again to reset"}</small></footer>
    </div>
  </div>;
}

export function AvailabilityDetailModal({ item, initialValue = null, initialDate = null, onClose, canCheck = false, onCheck = null }) {
  const { locale, errorMessage } = useI18n();
  const zh = locale !== "en";
  const [days, setDays] = useState(initialValue?.daily?.length || 30);
  const [value, setValue] = useState(initialValue);
  const [loading, setLoading] = useState(!initialValue);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [detailMode, setDetailMode] = useState(initialDate ? "day" : "overview");
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [dayValue, setDayValue] = useState(null);
  const [dayLoading, setDayLoading] = useState(Boolean(initialDate));
  const [selectedDayHour, setSelectedDayHour] = useState(null);
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
    if (detailMode !== "day" || !selectedDate) return undefined;
    let live = true;
    setDayLoading(true);
    api.getItemAvailabilityDay(item.id || item.itemId, selectedDate)
      .then((result) => { if (live) { setDayValue(result); setError(""); } })
      .catch((cause) => live && setError(errorMessage(cause)))
      .finally(() => live && setDayLoading(false));
    return () => { live = false; };
  }, [detailMode, selectedDate, item.id, item.itemId, errorMessage]);
  useEffect(() => setSelectedDayHour(null), [selectedDate]);
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
  const activeValue = detailMode === "day" ? dayValue : value;
  const state = activeValue?.state || activeValue?.status || "unknown";
  const responseEvents = detailMode === "day"
    ? (dayValue?.events || []).filter((event) => selectedDayHour == null || new Date(event.checkedAtMs).getHours() === selectedDayHour)
    : (value?.daily || []).map((bucket) => ({
      checkedAtMs:Date.parse(`${bucket.date}T12:00:00Z`),
      latencyMs:bucket.averageLatencyMs,
      status:bucket.status,
      checks:bucket.checks,
    }));
  const availableDates = value?.daily?.map((bucket) => bucket.date) || [];
  const selectedDateIndex = availableDates.indexOf(selectedDate);
  const openDay = (date) => { setSelectedDate(date); setDetailMode("day"); };
  const changeDay = (offset) => {
    const next = availableDates[selectedDateIndex + offset];
    if (next) setSelectedDate(next);
  };
  return (
    <div className="modal-mask availability-modal-mask" onMouseDown={(event) => event.target === event.currentTarget && !checking && onClose()}>
      <div className="modal availability-detail-modal" role="dialog" aria-modal="true" aria-labelledby="availability-detail-title">
        <header className="availability-detail-head">
          <span><ContentIcon value={item.icon || "icon:link"} cachedUrl={item.icon_cache_url} size={22} /></span>
          <div><h3 id="availability-detail-title">{item.name}</h3><p title={item.url}>{item.url}</p></div>
          <div className="availability-range-switch" role="group" aria-label={zh ? "统计周期" : "Time range"}>{[7, 15, 30].map((range) => <button type="button" className={days === range ? "active" : ""} key={range} onClick={() => setDays(range)}>{range}{zh ? "天" : "d"}</button>)}</div>
          <button type="button" className="mini-btn" aria-label={zh ? "关闭" : "Close"} onClick={onClose}><Icon name="close" size={15} /></button>
        </header>
        {error && <div className="admin-inline-error"><Icon name="shield" size={15}/>{error}</div>}
        <div className={`availability-detail-body ${loading ? "loading" : ""}`}>
          <div className="availability-kpis">
            <article><span className={`availability-kpi-icon ${state}`}><i /></span><div><small>{zh ? "当前状态" : "Current status"}</small><strong>{stateLabel(state, locale)}</strong></div></article>
            <article><span className="availability-kpi-icon"><Icon name="insights" size={15}/></span><div><small>{detailMode === "day" ? (zh ? "当日可用率" : "Daily uptime") : (zh ? `${days} 天可用率` : `${days}-day uptime`)}</small><strong>{activeValue?.availability == null ? "—" : `${activeValue.availability}%`}</strong></div></article>
            <article><span className="availability-kpi-icon"><Icon name="speed" size={15}/></span><div><small>{zh ? "平均响应" : "Average response"}</small><strong>{activeValue?.averageLatencyMs == null ? "—" : `${activeValue.averageLatencyMs} ms`}</strong></div></article>
            <article><span className="availability-kpi-icon"><Icon name="clock" size={15}/></span><div><small>{detailMode === "day" ? (zh ? "选择日期" : "Selected date") : (zh ? "最后检测" : "Last checked")}</small><strong>{detailMode === "day" ? formatDate(`${selectedDate}T00:00:00Z`, locale) : formatDate(value?.lastCheckedAtMs, locale, true)}</strong></div></article>
          </div>
          <section className="availability-detail-section">
            <header><div><strong>{detailMode === "day" ? (zh ? "单日探测记录" : "Daily check history") : (zh ? "可用性历史" : "Availability history")}</strong><small>{detailMode === "day" ? (zh ? "查看当天每一次真实探测结果" : "Every check recorded on the selected day") : (zh ? "点击任意一天可下钻查看当天记录" : "Select any day to inspect its checks")}</small></div><div className="availability-history-actions"><span>{activeValue?.checks || 0} {zh ? "次检测" : "checks"}</span><div role="group" aria-label={zh ? "历史展示方式" : "History view"}><button type="button" className={detailMode === "overview" ? "active" : ""} onClick={() => setDetailMode("overview")}>{zh ? "每日概览" : "Overview"}</button><button type="button" className={detailMode === "day" ? "active" : ""} disabled={!selectedDate} onClick={() => selectedDate && setDetailMode("day")}>{zh ? "单日记录" : "Day"}</button></div></div></header>
            {detailMode === "overview" ? <AvailabilityStrip value={value} onDayOpen={openDay} /> : <>
              <div className="availability-day-navigation"><button type="button" className="mini-btn" disabled={selectedDateIndex <= 0} onClick={() => changeDay(-1)}><Icon name="chevronLeft" size={14}/></button><strong>{formatDate(`${selectedDate}T00:00:00Z`, locale)}</strong><button type="button" className="mini-btn" disabled={selectedDateIndex < 0 || selectedDateIndex >= availableDates.length - 1} onClick={() => changeDay(1)}><Icon name="chevronRight" size={14}/></button></div>
              <DayHistory value={dayValue} locale={locale} loading={dayLoading} selectedHour={selectedDayHour} onSelectHour={setSelectedDayHour}/>
            </>}
          </section>
          <div className="availability-detail-columns">
            <section className="availability-detail-section">
              <header><div><strong>{zh ? "响应时间" : "Response time"}</strong><small>{detailMode === "day" ? (selectedDayHour == null ? (zh ? "当天全部有效探测" : "All valid checks on this day") : (zh ? `${String(selectedDayHour).padStart(2, "0")}:00–${String((selectedDayHour + 1) % 24).padStart(2, "0")}:00 探测响应` : `${String(selectedDayHour).padStart(2, "0")}:00–${String((selectedDayHour + 1) % 24).padStart(2, "0")}:00 responses`)) : (zh ? `${days} 天每日平均响应` : `${days}-day daily average response`)}</small></div></header>
              <LatencyChart events={responseEvents} locale={locale} aggregation={detailMode === "day" ? "events" : "daily"} />
            </section>
            <section className="availability-detail-section">
              <header><div><strong>{detailMode === "day" ? (zh ? "当日事件" : "Daily incidents") : (zh ? "最近事件" : "Recent incidents")}</strong><small>{zh ? "不可用与恢复记录" : "Outages and recoveries"}</small></div></header>
              <div className="availability-incidents">
                {(activeValue?.incidents || []).map((incident) => <div key={incident.startedAtMs}><span className={incident.recovered ? "recovered" : "offline"}><Icon name={incident.recovered ? "check" : "shield"} size={13}/></span><div><strong>{incident.recovered ? (zh ? "已恢复" : "Recovered") : (zh ? "故障持续中" : "Ongoing outage")}</strong><small>{formatDate(incident.startedAtMs, locale, true)}</small></div><em>{formatDuration(incident.durationMs, locale)}</em></div>)}
                {!activeValue?.incidents?.length && <div className="availability-no-incidents"><span><Icon name="shieldCheck" size={21}/></span><strong>{zh ? "当前周期内没有故障记录" : "No incidents in this period"}</strong><small>{zh ? "所有已记录探测均未形成中断事件" : "Recorded checks did not produce an outage incident."}</small></div>}
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
