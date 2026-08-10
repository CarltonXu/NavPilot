import React from "react";
import StatusPill from "./StatusPill.jsx";
import Icon, { ContentIcon } from "./Icon.jsx";
import { useI18n } from "../i18n/LocaleContext.jsx";
export default function NavCard({
  item,
  checking,
  canManage,
  selected = false,
  viewMode = "card",
  onClick,
  onEdit,
  onDelete,
  onRecheck,
  onToggleSelect,
  onDragStart,
  onDragEnd,
}) {
  const { t } = useI18n();
  let host = item.url;
  try {
    host = new URL(item.url).host;
  } catch {
    /* keep */
  }
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const selection = canManage && (
    <label
      className="item-selection"
      title={t("batch.selectItem", { name: item.name })}
      onClick={(event) => event.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect?.()}
      />
      <span />
    </label>
  );
  const dragProps = canManage
    ? {
        draggable: true,
        onDragStart: (event) => onDragStart?.(event),
        onDragEnd,
      }
    : {};
  const actions = canManage && (
    <div className="item-actions">
      <button
        className="mini-btn"
        aria-label={t("nav.checkNow")}
        title={t("nav.checkNow")}
        onClick={(e) => {
          e.preventDefault();
          onRecheck();
        }}
      >
        <Icon name="refresh" size={15} />
      </button>
      <button
        className="mini-btn"
        aria-label={t("common.edit")}
        onClick={(e) => {
          e.preventDefault();
          onEdit();
        }}
      >
        ✎
      </button>
      <button
        className="mini-btn"
        aria-label={t("common.delete")}
        onClick={(e) => {
          e.preventDefault();
          onDelete();
        }}
      >
        ×
      </button>
    </div>
  );
  if (viewMode === "board")
    return (
      <div
        className={`board-resource selectable-item ${selected ? "selected" : ""}`}
        {...dragProps}
      >
        {selection}
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClick}
          className="board-resource-main"
          title={`${item.name}\n${item.description || host}`}
        >
          <span className="board-resource-icon">
            <ContentIcon value={item.icon} />
          </span>
          <span className="board-resource-meta">
            <strong>{item.name}</strong>
            <small>{item.description || host}</small>
          </span>
          <span
            className={`board-resource-status status-${item.status}`}
            aria-label={t(`status.${item.status || "unknown"}`)}
          />
        </a>
        {actions}
      </div>
    );
  if (viewMode === "compact")
    return (
      <div
        className={`nav-list-row selectable-item ${selected ? "selected" : ""}`}
        {...dragProps}
      >
        {selection}
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClick}
          className="nav-list-main"
        >
          <span className="nav-card-icon">
            <ContentIcon value={item.icon} />
          </span>
          <span className="nav-list-title">
            <strong>{item.name}</strong>
            <small>{host}</small>
          </span>
          <span className="nav-list-desc">
            {tags.length
              ? tags
                  .slice(0, 3)
                  .map((tag) => `#${tag}`)
                  .join(" ")
              : item.description}
          </span>
          <span className="nav-list-category">
            {item.category_name || t("category.uncategorized")}
          </span>
          <StatusPill
            status={item.status}
            latencyMs={item.latency_ms}
            checking={checking}
          />
          <span className="click-count">{item.click_count || 0}</span>
        </a>
        {actions}
      </div>
    );
  return (
    <div
      className={`nav-card selectable-item ${selected ? "selected" : ""}`}
      {...dragProps}
    >
      {selection}
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="nav-card-link"
        onClick={onClick}
      >
        <div className="nav-card-top">
          <div className="nav-card-icon">
            <ContentIcon value={item.icon} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="nav-card-name">{item.name}</div>
            <div className="nav-card-url">{host}</div>
          </div>
        </div>
        {item.description && (
          <div className="nav-card-desc">{item.description}</div>
        )}
        {tags.length > 0 && (
          <div className="nav-card-tags">
            {tags.slice(0, 5).map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        )}
        <div className="nav-card-footer">
          <StatusPill
            status={item.status}
            latencyMs={item.latency_ms}
            checking={checking}
          />
          <span className="click-count" title={t("nav.clicks")}>
            👆 {item.click_count || 0}
          </span>
        </div>
      </a>
      {actions}
    </div>
  );
}
