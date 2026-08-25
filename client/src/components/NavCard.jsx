import React, { useCallback, useState } from "react";
import StatusPill from "./StatusPill.jsx";
import Icon, { ContentIcon } from "./Icon.jsx";
import ContextMenu from "./ContextMenu.jsx";
import { useI18n } from "../i18n/LocaleContext.jsx";
import { AvailabilityStrip } from "./AvailabilityTimeline.jsx";
export default function NavCard({
  item,
  checking,
  canManage,
  canConfigure = canManage,
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
  onCopied,
  availability = null,
  onShowAvailability,
}) {
  const { t, locale } = useI18n();
  let host = item.url;
  try {
    host = new URL(item.url).host;
  } catch {
    /* keep */
  }
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const monitoringEnabled = item.check_enabled === true || Number(item.check_enabled) === 1 || item.checkEnabled === true;
  const accessBadge=item.scope==='public'&&item.visibility&&item.visibility!=='public'?<span className={`resource-access-badge ${item.visibility}`}><Icon name={item.visibility==='restricted'?'lock':'user'} size={12}/>{locale==='en'?(item.visibility==='restricted'?'Team resource':'Signed-in'):(item.visibility==='restricted'?'团队资源':'登录可见')}</span>:null;
  const [contextPosition, setContextPosition] = useState(null);
  const closeContextMenu = useCallback(() => setContextPosition(null), []);
  const openContextMenu = event => {
    if (event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    setContextPosition({ x:event.clientX, y:event.clientY });
  };
  const copyLink = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(item.url);
      else {
        const field = document.createElement('textarea');
        field.value = item.url;
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.append(field);
        field.select();
        document.execCommand?.('copy');
        field.remove();
      }
      onCopied?.();
    } catch {
      /* The browser may deny clipboard access; opening the resource still works. */
    }
  };
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
  const contextMenu = contextPosition && <ContextMenu
    x={contextPosition.x}
    y={contextPosition.y}
    onClose={closeContextMenu}
    label={locale === 'en' ? `Actions for ${item.name}` : `「${item.name}」的操作`}
  >
    <div className="resource-context-heading"><ContentIcon value={item.icon} cachedUrl={item.icon_cache_url} size={18}/><span><strong>{item.name}</strong><small>{host}</small></span></div>
    <a role="menuitem" data-context-action href={item.url} target="_blank" rel="noopener noreferrer" onClick={onClick}><Icon name="globe" size={16}/><span>{locale === 'en' ? 'Open in new tab' : '在新标签页打开'}</span></a>
    <button type="button" role="menuitem" data-context-action onClick={copyLink}><Icon name="clipboard" size={16}/><span>{locale === 'en' ? 'Copy link' : '复制链接'}</span></button>
    {canFavorite && <button type="button" role="menuitem" data-context-action disabled={favoriteBusy} onClick={() => onToggleFavorite?.()}><Icon name="star" size={16}/><span>{locale === 'en' ? (item.is_favorite ? 'Remove favorite' : 'Add favorite') : (item.is_favorite ? '取消收藏' : '添加收藏')}</span></button>}
    {(item.check_enabled || availability) && <button type="button" role="menuitem" data-context-action onClick={() => onShowAvailability?.()}><Icon name="insights" size={16}/><span>{locale === 'en' ? 'Availability details' : '查看可用性'}</span></button>}
    {canConfigure && <><div className="resource-context-divider" role="separator"/><button type="button" role="menuitem" data-context-action onClick={() => onEdit?.()}><Icon name="edit" size={16}/><span>{locale === 'en' ? 'Edit resource' : '编辑条目'}</span><kbd>E</kbd></button><button type="button" role="menuitem" data-context-action disabled={checking} onClick={() => onRecheck?.()}><Icon name="refresh" size={16}/><span>{locale === 'en' ? 'Check now' : '立即探测'}</span></button><button type="button" role="menuitem" data-context-action className="danger" onClick={() => onDelete?.()}><Icon name="trash" size={16}/><span>{locale === 'en' ? 'Delete resource' : '删除条目'}</span></button></>}
  </ContextMenu>;
  if (viewMode === "overview")
    return (
      <div
        className={`overview-resource-card selectable-item ${canFavorite ? "favorite-control" : ""} ${canManage ? "manageable" : ""} ${selected ? "selected" : ""} ${contextPosition ? "context-active" : ""}`}
        {...dragProps}
        onContextMenu={openContextMenu}
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
            <ContentIcon value={item.icon} cachedUrl={item.icon_cache_url} size={28} />
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
            {monitoringEnabled ? <AvailabilityStrip value={availability} onOpen={onShowAvailability} className="nav-card-availability overview-availability" /> : null}
            <small>👆 {item.click_count || 0}</small>
          </span>
        </a>
        {actions}
        {contextMenu}
      </div>
    );
  if (viewMode === "compact")
    return (
      <div
        className={`nav-list-row selectable-item ${selected ? "selected" : ""} ${contextPosition ? "context-active" : ""}`}
        {...dragProps}
        onContextMenu={openContextMenu}
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
            <ContentIcon value={item.icon} cachedUrl={item.icon_cache_url} />
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
            <StatusPill status={item.status} latencyMs={item.latency_ms} checking={checking} />
            {monitoringEnabled ? <AvailabilityStrip value={availability} onOpen={onShowAvailability} className="nav-card-availability compact-availability" /> : null}
          </span>
          <span className="click-count">{item.click_count || 0}</span>
        </a>
        {actions}
        {contextMenu}
      </div>
    );
  return (
    <div
      className={`nav-card selectable-item ${selected ? "selected" : ""} ${contextPosition ? "context-active" : ""}`}
      {...dragProps}
      onContextMenu={openContextMenu}
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
            <ContentIcon value={item.icon} cachedUrl={item.icon_cache_url} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="nav-card-name resource-title" title={item.name}>{item.name}</div>
            {accessBadge}
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
        {monitoringEnabled ? <AvailabilityStrip value={availability} onOpen={onShowAvailability} className="nav-card-availability" /> : null}
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
      {contextMenu}
    </div>
  );
}
