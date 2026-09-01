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

function formatInterval(minutes, locale) {
  const value = Number(minutes) || 5;
  if (value < 60) return locale === "en" ? `Every ${value} min` : `每 ${value} 分钟`;
  return locale === "en" ? `Every ${value / 60} hr` : `每 ${value / 60} 小时`;
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
  if (value?.detailAvailable === false) return <div className="availability-day-empty"><span><Icon name="archive" size={21}/></span><strong>{zh ? "五分钟明细已按保留策略清理" : "Fine-grained checks have expired"}</strong><small>{zh ? `每日汇总和故障事件仍会长期保留；当前原始明细保留 ${value.detailRetentionDays || 30} 天。` : `Daily summaries and incidents remain available; raw checks are retained for ${value.detailRetentionDays || 30} days.`}</small></div>;
  if (!value) return <div className="availability-day-empty"><span><Icon name="clock" size={21}/></span><strong>{zh ? "当天没有探测记录" : "No checks on this day"}</strong></div>;
  const fromAtMs = Number(value.fromAtMs) || Date.parse(`${value.date}T00:00:00Z`);
  const toAtMs = Number(value.toAtMs) || fromAtMs + 24 * 60 * 60 * 1000;
  const durationMs = Math.max(1,toAtMs - fromAtMs);
  const events = [...(value.events || [])].sort((a,b) => a.checkedAtMs - b.checkedAtMs);
  const scheduledEvents = events
    .filter((event) => event.triggerType !== "manual")
    .filter((event) => event.checkedAtMs >= fromAtMs && event.checkedAtMs < toAtMs);
  const inferredChanges = scheduledEvents.reduce((changes,event) => {
    const interval = Number(event.checkIntervalMinutes) || Number(value?.checkIntervalMinutes) || 5;
    if (changes.at(-1)?.checkIntervalMinutes !== interval) changes.push({
      startAtMs:event.checkedAtMs,
      checkEnabled:true,
      checkMethod:"http",
      checkIntervalMinutes:interval,
      scheduleAnchorAtMs:event.checkedAtMs,
      source:"inferred",
    });
    return changes;
  }, []);
  if (!inferredChanges.length) inferredChanges.push({ startAtMs:fromAtMs,checkEnabled:Boolean(value.checkEnabled),checkMethod:value.checkEnabled ? "http" : "none",checkIntervalMinutes:Number(value.checkIntervalMinutes) || 5,source:"inferred" });
  inferredChanges[0].startAtMs = fromAtMs;
  const inferredSegments = inferredChanges.map((change,index) => ({ ...change,endAtMs:inferredChanges[index + 1]?.startAtMs || toAtMs }));
  const segments = (Array.isArray(value.scheduleSegments) ? value.scheduleSegments : inferredSegments)
    .map((segment) => ({
      ...segment,
      startAtMs:Math.max(fromAtMs,Number(segment.startAtMs)),
      endAtMs:Math.min(toAtMs,Number(segment.endAtMs)),
    }))
    .filter((segment) => Number.isFinite(segment.startAtMs) && Number.isFinite(segment.endAtMs) && segment.endAtMs > segment.startAtMs);
  const pointLeft = (timestamp) => Math.min(100,Math.max(0,(Number(timestamp) - fromAtMs) / durationMs * 100));
  const timelineTime = (timestamp) => {
    const totalMinutes = Math.min(1440,Math.max(0,Math.floor((Number(timestamp) - fromAtMs) / 60000)));
    return `${String(Math.floor(totalMinutes / 60)).padStart(2,"0")}:${String(totalMinutes % 60).padStart(2,"0")}`;
  };
  const intervalValues = new Set(segments.filter((segment) => segment.checkEnabled).map((segment) => Number(segment.checkIntervalMinutes)));
  const configurationChanged = segments.length > 1 || intervalValues.size > 1;
  const expectedChecks = [];
  const expectationEndAtMs = Math.min(toAtMs,Date.now());
  segments.filter((segment) => segment.checkEnabled && segment.scheduleAnchorAtMs != null).forEach((segment) => {
    const step = Math.max(5,Number(segment.checkIntervalMinutes) || 5) * 60000;
    const anchor = Number(segment.scheduleAnchorAtMs);
    let next = anchor < segment.startAtMs ? anchor + Math.ceil((segment.startAtMs - anchor) / step) * step : anchor;
    while (next < segment.endAtMs && next <= expectationEndAtMs && expectedChecks.length < 1000) {
      expectedChecks.push({ checkedAtMs:next,segment,matched:false });
      next += step;
    }
  });
  const scheduledActual = events.filter((event) => event.triggerType === "scheduled");
  const usedEvents = new Set();
  expectedChecks.forEach((expected) => {
    const tolerance = Math.max(120000,Math.min(10 * 60000,Number(expected.segment.checkIntervalMinutes) * 60000 * .2));
    let closest = -1, distance = Infinity;
    scheduledActual.forEach((event,index) => {
      const delta = Math.abs(event.checkedAtMs - expected.checkedAtMs);
      if (!usedEvents.has(index) && delta <= tolerance && delta < distance) { closest=index; distance=delta; }
    });
    if (closest >= 0) { expected.matched=true; usedEvents.add(closest); }
  });
  const missedByHour = expectedChecks.filter((expected) => !expected.matched).reduce((hours,expected) => {
    const hour = Math.min(23,Math.max(0,Math.floor((expected.checkedAtMs - fromAtMs) / durationMs * 24)));
    hours[hour] = (hours[hour] || 0) + 1;
    return hours;
  },{});
  const coverage = expectedChecks.length ? Number((expectedChecks.filter((expected) => expected.matched).length / expectedChecks.length * 100).toFixed(1)) : null;
  const slotMs = 5 * 60000;
  const slotCount = Math.ceil(durationMs / slotMs);
  const statusRank = { unknown:0,online:1,degraded:2,offline:3 };
  const createProbeSlots = (source) => {
    const bySlot = new Map();
    source.forEach((event) => {
      const slotIndex = Math.min(slotCount - 1,Math.max(0,Math.floor((event.checkedAtMs - fromAtMs) / slotMs)));
      const bucket = bySlot.get(slotIndex) || { slotIndex,events:[] };
      bucket.events.push(event);
      bySlot.set(slotIndex,bucket);
    });
    return [...bySlot.values()].map((bucket) => {
      bucket.events.sort((a,b) => a.checkedAtMs - b.checkedAtMs);
      bucket.status = bucket.events.reduce((status,event) => statusRank[event.status] > statusRank[status] ? event.status : status,"unknown");
      bucket.startAtMs = fromAtMs + bucket.slotIndex * slotMs;
      bucket.endAtMs = Math.min(toAtMs,bucket.startAtMs + slotMs);
      return bucket;
    });
  };
  const slotState = (slotEvents) => slotEvents.reduce((status,event) => statusRank[event.status] > statusRank[status] ? event.status : status,"unknown");
  const makeHourSlots = (hour, trigger) => Array.from({length:12},(_,index) => {
    const start = fromAtMs + hour * 60 * 60000 + index * slotMs;
    const end = Math.min(toAtMs,start + slotMs);
    const slotEvents = events.filter((event) => event.checkedAtMs >= start && event.checkedAtMs < end && (trigger === "scheduled" ? event.triggerType === "scheduled" : event.triggerType !== "scheduled"));
    return { index, startAtMs:start, endAtMs:end, events:slotEvents, status:slotEvents.length ? slotState(slotEvents) : "unknown" };
  });
  const hourMatrix = Array.from({length:24},(_,hour) => ({
    hour,
    scheduled:makeHourSlots(hour,"scheduled"),
    auxiliary:makeHourSlots(hour,"auxiliary"),
    eventCount:events.filter((event) => Math.floor((event.checkedAtMs - fromAtMs) / 3600000) === hour).length,
  }));
  const triggerLabel = (event) => event.triggerType === "manual"
    ? (zh ? "手动检测" : "Manual check")
    : event.triggerType === "configuration"
      ? (zh ? "配置变更检测" : "Configuration check")
      : (zh ? "定时检测" : "Scheduled check");
  const methodLabel = (method) => method === "tcp" ? "TCP" : method === "http" ? "HTTP(S)" : (zh ? "不探测" : "Disabled");
  return <div className="availability-day-history">
    <div className="availability-day-summary">
      <article><small>{zh ? "探测次数" : "Checks"}</small><strong>{value.checks}</strong></article>
      <article><small>{zh ? "当日可用率" : "Daily uptime"}</small><strong>{value.availability == null ? "—" : `${value.availability}%`}</strong></article>
      <article><small>{zh ? "平均响应" : "Average response"}</small><strong>{value.averageLatencyMs == null ? "—" : `${value.averageLatencyMs} ms`}</strong></article>
      <article><small>{zh ? "计划执行覆盖" : "Schedule coverage"}</small><strong>{coverage == null ? "—" : `${coverage}%`}</strong></article>
    </div>
    <div className="availability-fixed-day">
      <header><div><strong>{zh ? "24 小时配置与真实探测" : "24-hour configuration and checks"}</strong><small>{configurationChanged ? (zh ? "当天配置发生过变化，各阶段按生效时间独立展示" : "Configuration changes are shown at their effective times") : (zh ? "探测点按真实执行时间定位" : "Checks are positioned at their actual execution time")}</small></div><span>{segments.length} {zh ? "个配置阶段" : "segments"} · {events.length} {zh ? "次探测" : "checks"}</span></header>
      <div className="availability-config-row">
        <small>{zh ? "检测配置" : "Configuration"}</small>
        <div className="availability-config-track">
          {segments.map((segment,index) => {
            const left = pointLeft(segment.startAtMs), width = Math.max(.25,pointLeft(segment.endAtMs) - left);
            return <span className={`availability-config-segment ${segment.checkEnabled ? "enabled" : "disabled"} ${segment.checkMethod || "none"}`} style={{left:`${left}%`,width:`${width}%`}} key={`${segment.startAtMs}-${index}`} tabIndex={0}>
              <b>{segment.checkEnabled ? formatInterval(segment.checkIntervalMinutes,locale) : (zh ? "检测关闭" : "Monitoring off")}</b>
              <span className={`availability-tooltip ${left < 14 ? "edge-start" : left + width > 86 ? "edge-end" : ""}`}><strong>{timelineTime(segment.startAtMs)}–{timelineTime(segment.endAtMs)}</strong><small>{segment.checkEnabled ? `${methodLabel(segment.checkMethod)} · ${formatInterval(segment.checkIntervalMinutes,locale)}` : (zh ? "此阶段未安排定时检测" : "No scheduled checks in this segment")}</small>{segment.checkTarget && segment.checkEnabled && <small>{segment.checkTarget}</small>}</span>
            </span>;
          })}
          {segments.slice(1).map((segment,index) => <i className="availability-config-change" style={{left:`${pointLeft(segment.startAtMs)}%`}} key={`${segment.startAtMs}-change-${index}`}><span>{timelineTime(segment.startAtMs)}</span></i>)}
        </div>
      </div>
      <div className="availability-matrix-row">
        <small>{zh ? "真实探测" : "Actual checks"}</small>
        <div className="availability-probe-matrix" aria-label={zh ? "单日 24 小时探测矩阵" : "24-hour daily check matrix"}>
          {Array.from({length:12},(_,row) => {
            const hours = [hourMatrix[row],hourMatrix[row + 12]];
            return <div className="availability-matrix-line" key={row}>
              {hours.map((bucket) => {
                const renderSlots = (slots) => slots.map((slot) => {
                  const auxiliaryEvents = bucket.auxiliary[slot.index].events;
                  const allEvents = [...slot.events,...auxiliaryEvents];
                  const event = allEvents.at(-1);
                  const labelTime = `${String(bucket.hour).padStart(2,"0")}:${String(slot.index * 5).padStart(2,"0")}`;
                  const status = slot.events.length ? slot.status : auxiliaryEvents.length ? slotState(auxiliaryEvents) : "unknown";
                  return <button type="button" className={`${allEvents.length ? "availability-probe-point" : ""} availability-matrix-point ${status} ${auxiliaryEvents.length && !slot.events.length ? (event?.triggerType || "auxiliary") : "scheduled"} ${allEvents.length ? "has-event" : "empty"}`} key={`${bucket.hour}-scheduled-${slot.index}`} disabled={!allEvents.length} onClick={() => allEvents.length && onSelectHour?.(selectedHour === bucket.hour ? null : bucket.hour)} aria-label={`${labelTime} ${allEvents.length ? stateLabel(status,locale) : (zh ? "无探测" : "No check")}`}>
                    <i />
                    {event && <><b className={auxiliaryEvents.length ? "availability-matrix-marker" : ""} /> <span className={`availability-tooltip ${slot.index < 2 ? "edge-start" : slot.index > 9 ? "edge-end" : ""}`}><strong>{value.date} {labelTime}</strong><small>{stateLabel(status,locale)} · {event.latencyMs == null ? (zh ? "无响应时间" : "No response time") : `${event.latencyMs} ms`}</small><small>{triggerLabel(event)} · {formatInterval(event.checkIntervalMinutes || value.checkIntervalMinutes,locale)}</small>{allEvents.length > 1 && <small>{zh ? `此槽聚合 ${allEvents.length} 次触发` : `${allEvents.length} checks in this slot`}</small>}</span></>}
                  </button>;
                });
                return <section className={`availability-matrix-hour ${selectedHour === bucket.hour ? "active" : ""}`} key={bucket.hour}>
                  <button type="button" className="availability-matrix-hour-head" onClick={() => onSelectHour?.(selectedHour === bucket.hour ? null : bucket.hour)}><strong>{String(bucket.hour).padStart(2,"0")}:00</strong><small>{bucket.eventCount ? `${bucket.eventCount}${zh ? " 次" : " checks"}` : (zh ? "无记录" : "No data")}</small></button>
                  <div className="availability-matrix-slots">{renderSlots(bucket.scheduled)}</div>
                </section>;
              })}
            </div>;
          })}
          {!events.length && <div className="availability-probe-empty"><Icon name="clock" size={15}/>{zh ? "当天没有实际探测记录" : "No actual checks on this day"}</div>}
        </div>
      </div>
      <div className="availability-matrix-axis" aria-hidden="true"><span>{zh ? "左列 00–11 时" : "Left 00–11"}</span><span>{zh ? "右列 12–23 时" : "Right 12–23"}</span></div>
      <footer className="availability-fixed-legend"><span><i className="online"/>{zh ? "正常" : "Online"}</span><span><i className="degraded"/>{zh ? "性能下降" : "Degraded"}</span><span><i className="offline"/>{zh ? "不可用" : "Offline"}</span><span><i className="manual"/>{zh ? "手动检测" : "Manual"}</span><span><i className="missed"/>{zh ? "计划未执行" : "Missed"}</span><small>{zh ? "点击任意小时或探测点可筛选下方响应时间" : "Select an hour or check to filter response times"}</small></footer>
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
  const selectedDayFromAtMs = Number(dayValue?.fromAtMs) || (selectedDate ? Date.parse(`${selectedDate}T00:00:00Z`) : 0);
  const responseEvents = detailMode === "day"
    ? (dayValue?.events || []).filter((event) => selectedDayHour == null || Math.floor((event.checkedAtMs - selectedDayFromAtMs) / 3600000) === selectedDayHour)
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
          <div className="availability-range-switch" role="group" aria-label={zh ? "统计周期" : "Time range"}>{[7, 15, 30, 90].map((range) => <button type="button" className={days === range ? "active" : ""} key={range} onClick={() => setDays(range)}>{range}{zh ? "天" : "d"}</button>)}</div>
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
            <header><div><strong>{detailMode === "day" ? (zh ? "单日探测记录" : "Daily check history") : (zh ? "可用性历史" : "Availability history")}</strong><small>{detailMode === "day" ? (zh ? "查看当天配置变化与每一次真实探测结果" : "Configuration changes and every check recorded on the selected day") : (zh ? "点击任意一天可下钻查看当天记录" : "Select any day to inspect its checks")}</small></div><div className="availability-history-actions"><span>{detailMode === "day" && activeValue?.scheduleSegments?.length > 1 ? `${activeValue.scheduleSegments.length} ${zh ? "个配置阶段" : "segments"}` : formatInterval(activeValue?.checkIntervalMinutes,locale)} · {activeValue?.checks || 0} {zh ? "次检测" : "checks"}</span><div role="group" aria-label={zh ? "历史展示方式" : "History view"}><button type="button" className={detailMode === "overview" ? "active" : ""} onClick={() => setDetailMode("overview")}>{zh ? "每日概览" : "Overview"}</button><button type="button" className={detailMode === "day" ? "active" : ""} disabled={!selectedDate} onClick={() => selectedDate && setDetailMode("day")}>{zh ? "单日记录" : "Day"}</button></div></div></header>
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
