import React, { useMemo } from "react";
import Icon from "./Icon.jsx";
import { useI18n } from "../i18n/LocaleContext.jsx";

const timeValue = (value) => {
  const result = new Date(value || 0).getTime();
  return Number.isFinite(result) ? result : 0;
};

export default function ResourceOverview({ items, renderItems, onTagSelect }) {
  const { locale } = useI18n();
  const english = locale === "en";
  const insight = useMemo(() => {
    const byClicks = [...items]
      .filter((item) => Number(item.click_count) > 0)
      .sort((a, b) => Number(b.click_count) - Number(a.click_count))
      .slice(0, 6);
    const recent = [...items]
      .sort((a, b) => timeValue(b.created_at) - timeValue(a.created_at))
      .slice(0, 6);
    const attention = [...items]
      .filter((item) => item.status === "offline" || item.status === "unknown")
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "offline" ? -1 : 1;
        return timeValue(b.last_checked_at) - timeValue(a.last_checked_at);
      })
      .slice(0, 6);
    const tagCounts = new Map();
    items.forEach((item) =>
      (Array.isArray(item.tags) ? item.tags : []).forEach((tag) =>
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1),
      ),
    );
    return {
      byClicks,
      recent,
      attention,
      tags: [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
      totalClicks: items.reduce((sum, item) => sum + Number(item.click_count || 0), 0),
      online: items.filter((item) => item.status === "online").length,
      offline: items.filter((item) => item.status === "offline").length,
      unknown: items.filter((item) => item.status === "unknown").length,
    };
  }, [items]);

  const section = (title, description, list, icon) => (
    <section className="overview-panel">
      <header className="overview-panel-heading">
        <span><Icon name={icon} size={16} /></span>
        <div><strong>{title}</strong><small>{description}</small></div>
        <em>{list.length}</em>
      </header>
      {list.length ? renderItems(list) : <div className="overview-empty">{english ? "No matching resources yet" : "暂时没有符合条件的资源"}</div>}
    </section>
  );

  return <div className="resource-overview">
    <section className="overview-hero">
      <div className="overview-hero-copy">
        <span className="overview-kicker"><Icon name="assistant" size={14} />{english ? "MULTI-DIMENSION VIEW" : "多维资源视图"}</span>
        <h2>{english ? "Resource insights" : "智能总览"}</h2>
        <p>{english ? "Explore resources by usage, recency, health, and tags instead of category alone." : "从使用频率、添加时间、可用状态和标签理解资源，而不只是按分类浏览。"}</p>
      </div>
      <div className="overview-metrics">
        <article><span>{english ? "Resources" : "资源总数"}</span><strong>{items.length}</strong><small>{english ? `${insight.totalClicks} opens` : `累计访问 ${insight.totalClicks} 次`}</small></article>
        <article className="online"><span>{english ? "Online" : "当前在线"}</span><strong>{insight.online}</strong><small>{english ? "reachable" : "可正常访问"}</small></article>
        <article className="offline"><span>{english ? "Offline" : "访问异常"}</span><strong>{insight.offline}</strong><small>{english ? "needs attention" : "建议及时处理"}</small></article>
        <article className="unknown"><span>{english ? "Unchecked" : "尚未确认"}</span><strong>{insight.unknown}</strong><small>{english ? "run a manual check" : "可执行手动探测"}</small></article>
      </div>
    </section>
    <div className="overview-insight-grid">
      {section(english ? "Frequently used" : "高频访问", english ? "Sorted by accumulated opens" : "按照累计访问次数排序", insight.byClicks, "grid")}
      {section(english ? "Recently added" : "最近添加", english ? "New resources worth discovering" : "快速发现最近加入的资源", insight.recent, "plus")}
      {section(english ? "Needs attention" : "待确认状态", english ? "Offline and unchecked resources first" : "优先展示离线和未确认资源", insight.attention, "refresh")}
      <section className="overview-panel overview-tags-panel">
        <header className="overview-panel-heading">
          <span><Icon name="tag" size={16} /></span>
          <div><strong>{english ? "Tag landscape" : "标签分布"}</strong><small>{english ? "Browse across category boundaries" : "跨越分类查看内容主题"}</small></div>
          <em>{insight.tags.length}</em>
        </header>
        <div className="overview-tag-cloud">
          {insight.tags.length ? insight.tags.map(([tag, count], index) => <button key={tag} style={{fontSize:`${11-Math.min(2,index/4)}px`}} onClick={()=>onTagSelect?.(tag)}><span>#{tag}</span><strong>{count}</strong></button>) : <div className="overview-empty">{english ? "Add tags to see topic distribution" : "为资源添加标签后可查看主题分布"}</div>}
        </div>
      </section>
    </div>
    <section className="overview-catalog">
      <header><div><strong>{english ? "Complete catalog" : "全部资源目录"}</strong><small>{english ? "All resources matching the current category, tag, and search filters" : "展示符合当前分类、标签和搜索条件的全部资源"}</small></div><span>{items.length}</span></header>
      {renderItems(items)}
    </section>
  </div>;
}
