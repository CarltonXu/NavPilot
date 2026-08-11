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
  canFavorite = false,
  favoriteBusy = false,
  onToggleFavorite,
}) {
  const { t, locale } = useI18n();
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
  const actions = (canFavorite || canManage) && (
    <div className={`item-actions ${item.is_favorite ? "favorite-active" : ""}`}>
      {canFavorite&&<button className={`mini-btn favorite-btn ${item.is_favorite?"active":""}`} disabled={favoriteBusy} aria-pressed={Boolean(item.is_favorite)} aria-label={locale==="en"?(item.is_favorite?"Remove favorite":"Add favorite"):(item.is_favorite?"取消收藏":"添加收藏")} title={locale==="en"?(item.is_favorite?"Remove favorite":"Add favorite"):(item.is_favorite?"取消收藏":"添加收藏")} onClick={(event)=>{event.preventDefault();event.stopPropagation();onToggleFavorite?.();}}><Icon name="star" size={15}/></button>}
      {canManage&&<><button
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
      </>}
    </div>
  );
  if (viewMode === "overview")
    return (
      <div
        className={`overview-resource-card selectable-item ${canFavorite ? "favorite-control" : ""} ${canManage ? "manageable" : ""} ${selected ? "selected" : ""}`}
        {...dragProps}
      >
        {selection}
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClick}
          className="overview-resource-main"
          title={`${item.name}\n${item.description || host}`}
        >
          <span className="overview-resource-icon">
            <ContentIcon value={item.icon} size={28} />
          </span>
          <div className="overview-resource-meta">
            <strong className="resource-title" title={item.name}>{item.name}</strong>
            <small className="resource-url" title={item.url}>{host}</small>
            <span className="resource-category">
              {item.category_name || t("category.uncategorized")}
            </span>
          </div>
          <div className="overview-resource-details">
            <p className="resource-description" title={item.description}>
              {item.description || "—"}
            </p>
            {tags.length > 0 && (
              <span className="overview-resource-taxonomy">
              {tags.slice(0, 2).map((tag) => (
                <i className="resource-tag" key={tag}>#{tag}</i>
              ))}
              </span>
            )}
          </div>
          <span className="overview-resource-signals">
            <StatusPill status={item.status} latencyMs={item.latency_ms} checking={checking} />
            <small>👆 {item.click_count || 0}</small>
          </span>
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
          <span className="nav-list-title" title={item.name}>
            <strong className="resource-title">{item.name}</strong>
            <small className="resource-url" title={item.url}>{host}</small>
          </span>
          <span className="nav-list-details">
            <span className="nav-list-desc resource-description" title={item.description}>
              {item.description || "—"}
            </span>
            {tags.length > 0 && (
              <span className="nav-list-tags">
                {tags.slice(0, 3).map((tag) => (
                  <i className="resource-tag" key={tag}>#{tag}</i>
                ))}
              </span>
            )}
          </span>
          <span className="nav-list-category resource-category">
            {item.category_name || t("category.uncategorized")}
          </span>
          <span className="nav-list-status">
            <StatusPill
              status={item.status}
              latencyMs={item.latency_ms}
              checking={checking}
            />
          </span>
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
            <div className="nav-card-name resource-title" title={item.name}>{item.name}</div>
            <div className="nav-card-url resource-url" title={item.url}>{host}</div>
          </div>
        </div>
        {item.description && (
          <div className="nav-card-desc resource-description">{item.description}</div>
        )}
        <div className="nav-card-taxonomy">
          <span className="resource-category">
            {item.category_name || t("category.uncategorized")}
          </span>
          {tags.length > 0 && (
            <span className="nav-card-tags">
            {tags.slice(0, 5).map((tag) => (
              <i className="resource-tag" key={tag}>#{tag}</i>
            ))}
            </span>
          )}
        </div>
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
