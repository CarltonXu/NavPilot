import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { useI18n } from "../i18n/LocaleContext.jsx";
import AdminPageHeader from "./AdminPageHeader.jsx";
import Icon from "./Icon.jsx";
import { AvailabilityDetailModal, AvailabilityStrip, formatDate, stateLabel } from "./AvailabilityTimeline.jsx";

export default function AvailabilityManagement({ refreshToken = 0 }) {
  const { locale, errorMessage } = useI18n();
  const zh = locale !== "en";
  const [days, setDays] = useState(30);
  const [scope, setScope] = useState("all");
  const [state, setState] = useState("all");
  const [query, setQuery] = useState("");
  const [data, setData] = useState({ summary:{}, items:[] });
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkingId, setCheckingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkInterval, setBulkInterval] = useState(5);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setData(await api.getAdminAvailability({ days, scope })); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setLoading(false); }
  }, [days, scope, errorMessage]);
  useEffect(() => { load(); }, [load, refreshToken]);
  const filtered = useMemo(() => data.items.filter((item) => {
    const itemState = item.checkEnabled ? item.state : "unknown";
    return (state === "all" || itemState === state) && (!query.trim() || `${item.name} ${item.url} ${item.categoryName || ""} ${item.ownerName || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  }), [data.items, query, state]);
  async function checkItem(id) {
    setCheckingId(id);
    try { await api.checkAdminAvailabilityItem(id); await load(); }
    finally { setCheckingId(null); }
  }
  async function checkAll() {
    setCheckingAll(true);
    setError("");
    try { await api.checkAdminAvailabilityAll(scope); await load(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setCheckingAll(false); }
  }
  const intervalLabel = (minutes) => minutes < 60 ? `${minutes} ${zh ? "分钟" : "min"}` : `${minutes / 60} ${zh ? "小时" : "hr"}`;
  const allFilteredSelected = filtered.length > 0 && filtered.every((item) => selectedIds.has(item.itemId));
  function toggleAllFiltered() {
    setSelectedIds((current) => {
      const next = new Set(current);
      filtered.forEach((item) => allFilteredSelected ? next.delete(item.itemId) : next.add(item.itemId));
      return next;
    });
  }
  async function bulkConfigure(mode) {
    if (!selectedIds.size || bulkBusy) return;
    setBulkBusy(true); setError("");
    try {
      const result = await api.bulkConfigureAdminAvailability([...selectedIds],mode,mode === "interval" ? bulkInterval : null);
      setSelectedIds(new Set());
      await load();
      if (result.skippedCount) setError(zh ? `${result.updatedCount} 个资源已更新，${result.skippedCount} 个未开启探测的资源已跳过。` : `${result.updatedCount} updated; ${result.skippedCount} disabled resources skipped.`);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBulkBusy(false); }
  }
  const summary = data.summary || {};
  const stats = [
    ["monitor", summary.monitored || 0, zh ? "监控资源" : "Monitored", "monitored"],
    ["check", summary.online || 0, zh ? "正常" : "Operational", "online"],
    ["speed", summary.degraded || 0, zh ? "性能下降" : "Degraded", "degraded"],
    ["shield", summary.offline || 0, zh ? "不可用" : "Unavailable", "offline"],
    ["clock", summary.unknown || 0, zh ? "暂无数据" : "No data", "unknown"],
  ];
  return (
    <div className={`availability-admin ${loading ? "is-loading" : ""}`}>
      <AdminPageHeader
        icon="monitor"
        title={zh ? "可用性监控" : "Availability monitoring"}
        description={zh ? "使用 Uptime 时间轴查看资源可用率、响应时间与故障记录。" : "Track uptime, response time and incidents for every monitored resource."}
        actions={<div className="availability-admin-actions"><label><span>{zh ? "统计周期" : "Range"}</span><select value={days} onChange={(event) => setDays(Number(event.target.value))}>{[7,30,90].map((value) => <option value={value} key={value}>{value} {zh ? "天" : "days"}</option>)}</select></label><div role="group">{[["all",zh?"全部":"All"],["public",zh?"公共空间":"Public"],["personal",zh?"个人空间":"Personal"]].map(([key,label]) => <button type="button" className={scope === key ? "active" : ""} key={key} onClick={() => setScope(key)}>{label}</button>)}</div><button type="button" className="icon-btn primary" disabled={checkingAll} onClick={checkAll}><Icon name="refresh" size={14}/>{checkingAll ? (zh ? "检测中…" : "Checking…") : (zh ? "全部检测" : "Check all")}</button></div>}
      />
      {error && <div className="admin-inline-error"><Icon name="shield" size={15}/>{error}</div>}
      <div className="availability-admin-stats">
        {stats.map(([icon,count,label,key]) => <article className={key} key={key}><span><Icon name={icon} size={16}/></span><div><strong>{count}</strong><small>{label}</small></div></article>)}
      </div>
      <section className="availability-admin-list">
        <header className="availability-admin-toolbar">
          <div className="availability-admin-search"><Icon name="search" size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={zh ? "搜索资源、地址、分类或所有者…" : "Search resources, URLs, categories or owners…"}/></div>
          <div className="availability-admin-filters" role="tablist">
            {[["all",zh?"全部":"All",summary.total],["online",zh?"正常":"Operational",summary.online],["degraded",zh?"性能下降":"Degraded",summary.degraded],["offline",zh?"不可用":"Unavailable",summary.offline],["unknown",zh?"暂无数据":"No data",summary.unknown]].map(([key,label,count]) => <button type="button" role="tab" aria-selected={state === key} className={state === key ? "active" : ""} key={key} onClick={() => setState(key)}>{label}<span>{count || 0}</span></button>)}
          </div>
          <em>{zh ? `显示 ${filtered.length} 个资源` : `${filtered.length} resources`}</em>
        </header>
        <div className="availability-monitoring-bulk"><button type="button" className={`icon-btn ${allFilteredSelected ? "active" : ""}`} onClick={toggleAllFiltered}><span className="batch-select-box">{allFilteredSelected && <Icon name="check" size={11}/>}</span>{allFilteredSelected ? (zh ? "取消全选" : "Clear all") : (zh ? "选择当前结果" : "Select results")}</button>{selectedIds.size > 0 && <><strong>{zh ? `已选 ${selectedIds.size} 项` : `${selectedIds.size} selected`}</strong><button type="button" className="icon-btn" disabled={bulkBusy} onClick={() => bulkConfigure("enable")}><Icon name="monitor" size={14}/>{zh ? "开启检测" : "Enable"}</button><button type="button" className="icon-btn" disabled={bulkBusy} onClick={() => bulkConfigure("disable")}><Icon name="minus" size={14}/>{zh ? "关闭检测" : "Disable"}</button><select value={bulkInterval} disabled={bulkBusy} onChange={(event) => setBulkInterval(Number(event.target.value))}>{[5,10,15,30,60,120,300,480,720,1440].map((value) => <option value={value} key={value}>{intervalLabel(value)}</option>)}</select><button type="button" className="icon-btn primary" disabled={bulkBusy} onClick={() => bulkConfigure("interval")}><Icon name={bulkBusy ? "refresh" : "clock"} size={14}/>{zh ? "设置周期" : "Set interval"}</button></>}</div>
        <div className="availability-admin-table-head"><span>{zh ? "资源" : "Resource"}</span><span>{zh ? "最近可用性" : "Recent uptime"}</span><span>{zh ? "状态" : "Status"}</span><span>{zh ? "响应" : "Response"}</span><span>{zh ? "最后检测" : "Last checked"}</span><span /></div>
        <div className="availability-admin-rows">
          {filtered.map((item) => {
            const itemState = item.checkEnabled ? item.state : "unknown";
            return <article className="availability-admin-row" key={item.itemId}>
              <button type="button" className="availability-admin-row-main" onClick={() => setSelected(item)} aria-label={`${item.name} ${zh ? "可用性详情" : "availability details"}`}>
                <span className={`availability-row-selector ${selectedIds.has(item.itemId) ? "selected" : ""}`} role="checkbox" aria-checked={selectedIds.has(item.itemId)} tabIndex={0} onClick={(event) => { event.stopPropagation(); setSelectedIds((current) => { const next = new Set(current); next.has(item.itemId) ? next.delete(item.itemId) : next.add(item.itemId); return next; }); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); setSelectedIds((current) => { const next = new Set(current); next.has(item.itemId) ? next.delete(item.itemId) : next.add(item.itemId); return next; }); } }}>{selectedIds.has(item.itemId) && <Icon name="check" size={11}/>}</span>
                <span className={`availability-resource-icon ${itemState}`}><Icon name="link" size={15}/></span>
                <span className="availability-resource-copy"><strong>{item.name}</strong><small title={item.url}>{item.url}</small><em>{item.scope === "personal" ? (item.ownerName || (zh ? "个人空间" : "Personal")) : (item.categoryName || (zh ? "公共空间" : "Public"))} · {item.checkEnabled ? (zh ? `每 ${intervalLabel(item.checkIntervalMinutes)}` : `Every ${intervalLabel(item.checkIntervalMinutes)}`) : (zh ? "未启用" : "Disabled")}</em></span>
              </button>
              <AvailabilityStrip value={item} className="admin-row-strip" tooltipPlacement="below" />
              <span className={`availability-state ${itemState}`}><i />{item.checkEnabled ? stateLabel(itemState, locale) : (zh ? "未启用" : "Disabled")}</span>
              <strong className="availability-row-latency">{item.latencyMs == null ? "—" : `${item.latencyMs} ms`}</strong>
              <small className="availability-row-checked">{formatDate(item.lastCheckedAtMs, locale, true)}</small>
              <button type="button" className="mini-btn" disabled={checkingId === item.itemId} aria-label={`${zh ? "立即检测" : "Check now"} ${item.name}`} onClick={() => checkItem(item.itemId)}><Icon name="refresh" size={14}/></button>
            </article>;
          })}
          {!filtered.length && <div className="availability-admin-empty"><Icon name="monitor" size={24}/><strong>{loading ? (zh ? "正在加载…" : "Loading…") : (zh ? "没有符合条件的资源" : "No matching resources")}</strong><span>{zh ? "调整筛选条件或为资源启用可用性探测。" : "Adjust filters or enable monitoring for resources."}</span></div>}
        </div>
      </section>
      {selected && <AvailabilityDetailModal item={{...selected,id:selected.itemId}} initialValue={selected} canCheck onCheck={checkItem} onClose={() => setSelected(null)}/>} 
    </div>
  );
}
