import React, { useMemo, useState } from "react";
import Icon, { ContentIcon } from "./Icon.jsx";
import { useI18n } from "../i18n/LocaleContext.jsx";

const fields = ["name", "description", "icon"];

export default function RecognitionResultDialog({ result, onClose }) {
  const { locale } = useI18n();
  const [filter, setFilter] = useState("all");
  const w =
    locale === "en"
      ? {
          title: "Website identification details",
          subtitle: "Review each resource and the metadata changes returned by its website.",
          total: "Total",
          succeeded: "Succeeded",
          changed: "Changed",
          failed: "Failed",
          all: "All",
          success: "Succeeded",
          failure: "Failed",
          unchanged: "Identified · No metadata changes",
          updated: "Metadata updated",
          name: "Name",
          description: "Description",
          icon: "Icon",
          close: "Close",
          empty: "No matching results",
        }
      : {
          title: "网站信息识别详情",
          subtitle: "逐条查看网站返回结果，以及名称、描述和图标的具体变化。",
          total: "识别总数",
          succeeded: "识别成功",
          changed: "发生变化",
          failed: "识别失败",
          all: "全部",
          success: "成功",
          failure: "失败",
          unchanged: "识别成功 · 信息无变化",
          updated: "已更新网站信息",
          name: "名称",
          description: "描述",
          icon: "图标",
          close: "关闭",
          empty: "没有符合条件的结果",
        };
  const changedCount = result.successes.filter(
    (entry) => entry.changedFields.length,
  ).length;
  const entries = useMemo(() => {
    const successes = result.successes.map((entry) => ({
      ...entry,
      outcome: "success",
    }));
    const failures = result.failures.map((entry) => ({
      ...entry,
      outcome: "failure",
    }));
    if (filter === "success") return successes;
    if (filter === "failure") return failures;
    return [...successes, ...failures];
  }, [filter, result]);
  const fieldLabel = (field) => w[field];
  const value = (input) => String(input || "").trim() || "—";
  return (
    <div className="modal-mask recognition-result-mask">
      <section
        className="modal recognition-result-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recognition-result-title"
      >
        <header className="recognition-result-header">
          <span><Icon name="globe" size={20} /></span>
          <div>
            <h3 id="recognition-result-title">{w.title}</h3>
            <p>{w.subtitle}</p>
          </div>
          <button className="mini-btn" aria-label={w.close} onClick={onClose}>
            <Icon name="close" size={15} />
          </button>
        </header>
        <div className="recognition-result-stats">
          {[
            [w.total, result.total, ""],
            [w.succeeded, result.successes.length, "success"],
            [w.changed, changedCount, "changed"],
            [w.failed, result.failures.length, "failure"],
          ].map(([label, count, tone]) => (
            <div className={tone} key={label}>
              <strong>{count}</strong><span>{label}</span>
            </div>
          ))}
        </div>
        <nav className="recognition-result-filters">
          {[["all",w.all],["success",w.success],["failure",w.failure]].map(([key,label])=><button key={key} className={filter===key?"active":""} onClick={()=>setFilter(key)}>{label}</button>)}
        </nav>
        <div className="recognition-result-list">
          {!entries.length && <div className="recognition-result-empty">{w.empty}</div>}
          {entries.map((entry) => (
            <article className={`recognition-result-item ${entry.outcome}`} key={`${entry.outcome}-${entry.id}`}>
              <span className="recognition-result-icon">
                {entry.outcome === "success" ? <ContentIcon value={entry.after.icon} size={24} /> : <Icon name="close" size={18} />}
              </span>
              <div className="recognition-result-content">
                <div className="recognition-result-title-row">
                  <div><strong>{entry.after?.name || entry.name}</strong><small>{entry.after?.url || entry.url}</small></div>
                  <span>{entry.outcome === "failure" ? w.failure : entry.changedFields.length ? w.updated : w.unchanged}</span>
                </div>
                {entry.outcome === "failure" ? (
                  <p className="recognition-result-error">{entry.error}</p>
                ) : entry.changedFields.length ? (
                  <div className="recognition-result-changes">
                    {fields.filter((field)=>entry.changedFields.includes(field)).map((field)=><div key={field}><label>{fieldLabel(field)}</label><del title={value(entry.before[field])}>{value(entry.before[field])}</del><Icon name="chevronRight" size={13}/><ins title={value(entry.after[field])}>{value(entry.after[field])}</ins></div>)}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        <footer className="recognition-result-footer">
          <span>{new Date(result.finishedAt).toLocaleString(locale === "en" ? "en-US" : "zh-CN")}</span>
          <button className="icon-btn primary" onClick={onClose}>{w.close}</button>
        </footer>
      </section>
    </div>
  );
}
