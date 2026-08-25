import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { useI18n } from "../i18n/LocaleContext.jsx";
import AiSettingsPanel from "./SystemSettingsModal.jsx";
import AdminAnalytics, { AuditTable } from "./AdminAnalytics.jsx";
import UserManagement from "./UserManagement.jsx";
import AccessGroupManagement from "./AccessGroupManagement.jsx";
import AvailabilityManagement from "./AvailabilityManagement.jsx";
import ThemeSwitcher from "./ThemeSwitcher.jsx";
import LocaleSwitcher from "./LocaleSwitcher.jsx";
import Icon from "./Icon.jsx";
import { normalizeBrandImage } from "../utils/imageProcessing.js";

const tabs = [
  ["analytics", "grid", "analytics.title"],
  ["availability", "monitor", "admin.availability"],
  ["audit", "shield", "analytics.audit"],
  ["users", "user", "admin.users"],
  ["access", "users", "admin.accessGroups"],
  ["general", "settings", "settings.generalTitle"],
  ["ai", "assistant", "settings.aiMenu"],
];
export const ADMIN_TAB_CACHE_TTL_MS = 60_000;

function AdminLoading() {
  const { t } = useI18n();
  return (
    <div className="admin-workspace admin-loading-shell" aria-busy="true">
      <header className="admin-header">
        <div>
          <span className="skeleton-line skeleton-short" />
          <span className="skeleton-line skeleton-title" />
          <span className="skeleton-line skeleton-copy" />
        </div>
        <span className="skeleton-line skeleton-account" />
      </header>
      <nav className="admin-tabs" aria-label={t("common.loading")}>
        {tabs.map(([key]) => (
          <span className="skeleton-tab" key={key} />
        ))}
      </nav>
      <main className="admin-panel admin-loading-panel">
        <Icon name="settings" size={22} />
        <span>{t("common.loading")}</span>
      </main>
    </div>
  );
}

function PublicInsightsSettings({ value, onChange, zh }) {
  return (
    <section className="settings-section public-insights-settings">
      <h3>{zh ? "公共空间洞察" : "Public space insights"}</h3>
      <div className="public-insights-setting-list">
        <label>
          <span>
            <strong>
              {zh ? "开放公共空间洞察" : "Enable public space insights"}
            </strong>
            <small>
              {zh
                ? "在公共空间操作栏展示“空间洞察”入口"
                : "Show the insights entry in the public-space action bar"}
            </small>
          </span>
          <input
            type="checkbox"
            checked={Boolean(value.enabled)}
            onChange={(event) =>
              onChange({ ...value, enabled: event.target.checked })
            }
          />
        </label>
        <label className={!value.enabled ? "disabled" : ""}>
          <span>
            <strong>
              {zh ? "允许匿名用户查看" : "Allow anonymous access"}
            </strong>
            <small>
              {zh
                ? "关闭后仅登录用户可以查看聚合数据"
                : "When disabled, only signed-in users can view aggregated data"}
            </small>
          </span>
          <input
            type="checkbox"
            disabled={!value.enabled}
            checked={Boolean(value.anonymousEnabled)}
            onChange={(event) =>
              onChange({ ...value, anonymousEnabled: event.target.checked })
            }
          />
        </label>
        <label className={!value.enabled ? "disabled" : ""}>
          <span>
            <strong>
              {zh ? "热门搜索词公开阈值" : "Popular-term disclosure threshold"}
            </strong>
            <small>
              {zh
                ? "同一关键词达到该次数后才会公开，建议至少 3 次"
                : "A term is public only after reaching this count; 3 or more is recommended"}
            </small>
          </span>
          <input
            className="insights-threshold-input"
            type="number"
            min="2"
            max="20"
            disabled={!value.enabled}
            value={value.searchMinCount}
            onChange={(event) =>
              onChange({ ...value, searchMinCount: Number(event.target.value) })
            }
          />
        </label>
      </div>
      <div className="settings-note">
        <Icon name="shield" size={17} />
        <div>
          <strong>{zh ? "隐私保护" : "Privacy protection"}</strong>
          <span>
            {zh
              ? "只公开公共空间的聚合结果；不会返回搜索用户身份，邮箱、手机号、IP 等敏感关键词会被过滤。"
              : "Only aggregated public-space results are exposed. Search identities are never returned and sensitive terms are filtered."}
          </span>
        </div>
      </div>
    </section>
  );
}

function GeneralSettings({
  theme,
  onThemeChange,
  branding,
  onBrandingChange,
  publicInsights,
  onPublicInsightsChange,
}) {
  const { t, errorMessage, locale } = useI18n();
  const zh = locale !== "en";
  const logoInputRef = useRef(null),
    faviconInputRef = useRef(null);
  const [draft, setDraft] = useState(branding),
    [insightsDraft, setInsightsDraft] = useState(
      publicInsights || {
        enabled: true,
        anonymousEnabled: false,
        searchMinCount: 3,
      },
    ),
    [saving, setSaving] = useState(false),
    [uploading, setUploading] = useState(""),
    [processing, setProcessing] = useState(""),
    [saved, setSaved] = useState(false),
    [error, setError] = useState("");
  useEffect(() => setDraft(branding), [branding]);
  useEffect(
    () =>
      setInsightsDraft(
        publicInsights || {
          enabled: true,
          anonymousEnabled: false,
          searchMinCount: 3,
        },
      ),
    [publicInsights],
  );
  async function save() {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const result = await api.updateAdminSettings({
        branding: draft,
        publicInsights: insightsDraft,
      });
      setDraft(result.branding);
      setInsightsDraft(result.publicInsights);
      onBrandingChange?.(result.branding);
      onPublicInsightsChange?.(result.publicInsights);
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  async function upload(kind, dataUrl) {
    setUploading(kind);
    setSaved(false);
    setError("");
    try {
      const result = await api.uploadBrandingAsset(kind, dataUrl);
      setDraft((current) => ({
        ...result.branding,
        siteName: current.siteName,
      }));
      onBrandingChange?.(result.branding);
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading("");
    }
  }
  async function select(kind, file) {
    if (!file) return;
    setProcessing(kind);
    setSaved(false);
    setError("");
    try {
      const dataUrl = await normalizeBrandImage(file, {
        square: kind === "favicon",
      });
      setProcessing("");
      await upload(kind, dataUrl);
    } catch (e) {
      setError(errorMessage(e));
      setProcessing("");
    }
  }
  async function clear(kind) {
    if (
      !confirm(
        kind === "logo"
          ? zh
            ? "清除当前网站 Logo？"
            : "Clear the current site logo?"
          : zh
            ? "清除当前标签页图标？"
            : "Clear the current tab icon?",
      )
    )
      return;
    setUploading(kind);
    setError("");
    try {
      const result = await api.clearBrandingAsset(kind);
      setDraft((current) => ({
        ...result.branding,
        siteName: current.siteName,
      }));
      onBrandingChange?.(result.branding);
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading("");
    }
  }
  const previewName = draft.siteName?.trim() || "NavPilot";
  const asset = (kind, title, description, url, inputRef) => {
    const busy = processing === kind || uploading === kind;
    return (
      <article className={`branding-asset-card ${busy ? "busy" : ""}`}>
        <button
          type="button"
          className="branding-asset-select"
          disabled={Boolean(processing || uploading)}
          onClick={() => inputRef.current?.click()}
        >
          <span className={`branding-asset-preview ${kind}`}>
            {url ? (
              <img src={url} alt="" />
            ) : (
              <Icon name={kind === "logo" ? "assistant" : "globe"} size={30} />
            )}
            <i>
              <Icon name={busy ? "refresh" : "edit"} size={13} />
            </i>
          </span>
          <span className="branding-asset-copy">
            <strong>{title}</strong>
            <small>
              {busy
                ? zh
                  ? "正在处理并上传…"
                  : "Processing and uploading…"
                : description}
            </small>
            <em>{zh ? "点击更换图片" : "Click to replace image"}</em>
          </span>
        </button>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
          onChange={(event) => {
            select(kind, event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {url && (
          <button
            type="button"
            className="branding-asset-clear"
            disabled={Boolean(processing || uploading)}
            onClick={() => clear(kind)}
            aria-label={zh ? "清除图片" : "Clear image"}
          >
            <Icon name="trash" size={14} />
          </button>
        )}
      </article>
    );
  };
  return (
    <section className="admin-panel settings-page general-settings-page">
      <div className="settings-page-heading">
        <div className="settings-page-icon">
          <Icon name="settings" size={22} />
        </div>
        <div>
          <h2>{t("settings.generalTitle")}</h2>
          <p>{t("settings.generalDescription")}</p>
        </div>
      </div>
      <section className="settings-section">
        <h3>{t("settings.branding")}</h3>
        <div className="form-row branding-name-field">
          <label>{t("settings.siteName")}</label>
          <input
            value={draft.siteName || ""}
            onChange={(e) => {
              setSaved(false);
              setDraft({ ...draft, siteName: e.target.value });
            }}
            placeholder="NavPilot"
          />
          <div className="hint">
            {zh
              ? "网站名称保存后会同步到页面标题和浏览器标签页"
              : "The site name is used in the page header and browser tab"}
          </div>
        </div>
        <div className="branding-asset-grid">
          {asset(
            "logo",
            zh ? "网站 Logo" : "Site logo",
            zh ? "页面左上角和 AI 工作台" : "Header and AI workspace",
            draft.logoUrl,
            logoInputRef,
          )}
          {asset(
            "favicon",
            zh ? "标签页图标" : "Tab icon",
            zh ? "浏览器标签页和收藏夹" : "Browser tabs and bookmarks",
            draft.faviconUrl,
            faviconInputRef,
          )}
        </div>
        <section className="branding-browser-demo">
          <header>
            <div>
              <strong>{zh ? "浏览器效果预览" : "Browser preview"}</strong>
              <small>
                {zh
                  ? "上方修改会实时同步到示例"
                  : "Changes above appear here instantly"}
              </small>
            </div>
            <span>{zh ? "实时预览" : "LIVE"}</span>
          </header>
          <div className="branding-browser-window">
            <div className="branding-browser-tabs">
              <i />
              <i />
              <i />
              <div className="branding-browser-tab">
                <span>
                  {draft.faviconUrl ? (
                    <img src={draft.faviconUrl} alt="" />
                  ) : (
                    <Icon name="globe" size={12} />
                  )}
                </span>
                <strong>{previewName}</strong>
                <small>×</small>
              </div>
              <b>+</b>
            </div>
            <div className="branding-browser-address">
              <Icon name="chevronLeft" size={12} />
              <Icon name="chevronRight" size={12} />
              <Icon name="refresh" size={12} />
              <span>
                <Icon name="shield" size={11} />
                {typeof window !== "undefined"
                  ? window.location.host
                  : "navpilot.example.com"}
              </span>
            </div>
            <div className="branding-browser-page">
              <div className="branding-browser-brand">
                <span>
                  {draft.logoUrl ? (
                    <img src={draft.logoUrl} alt="" />
                  ) : (
                    <Icon name="assistant" size={25} />
                  )}
                </span>
                <strong>{previewName}</strong>
              </div>
              <div className="branding-browser-nav">
                <i />
                <i />
                <i />
              </div>
              <button type="button" tabIndex="-1">
                <Icon name="user" size={13} />
              </button>
              <div className="branding-browser-canvas">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
          <footer>
            <span>
              <i className="favicon">
                {draft.faviconUrl ? (
                  <img src={draft.faviconUrl} alt="" />
                ) : (
                  <Icon name="globe" size={11} />
                )}
              </i>
              <b>{zh ? "标签页图标" : "Tab icon"}</b>
              <small>{zh ? "显示在浏览器标签中" : "Browser tab"}</small>
            </span>
            <span>
              <i>
                {draft.logoUrl ? (
                  <img src={draft.logoUrl} alt="" />
                ) : (
                  <Icon name="assistant" size={11} />
                )}
              </i>
              <b>{zh ? "网站 Logo" : "Site logo"}</b>
              <small>{zh ? "显示在页面左上角" : "Page header"}</small>
            </span>
            <span>
              <i className="name">Aa</i>
              <b>{zh ? "网站名称" : "Site name"}</b>
              <small>
                {zh ? "标签标题与页面品牌名" : "Tab title and brand"}
              </small>
            </span>
          </footer>
        </section>
      </section>
      <PublicInsightsSettings
        value={insightsDraft}
        onChange={(value) => {
          setSaved(false);
          setInsightsDraft(value);
        }}
        zh={zh}
      />
      <section className="settings-section">
        <h3>{t("settings.browserPreferences")}</h3>
        <div className="preference-grid">
          <article>
            <div>
              <h3>{t("theme.label")}</h3>
              <p>{t("settings.themeDescription")}</p>
            </div>
            <ThemeSwitcher theme={theme} onChange={onThemeChange} />
          </article>
          <article>
            <div>
              <h3>{t("locale.label")}</h3>
              <p>{t("settings.localeDescription")}</p>
            </div>
            <LocaleSwitcher />
          </article>
        </div>
        <div className="settings-note">
          <Icon name="user" size={17} />
          <div>
            <strong>{t("settings.preferenceScope")}</strong>
            <span>{t("settings.preferenceScopeDesc")}</span>
          </div>
        </div>
      </section>
      {error && <div className="error-text">{error}</div>}
      {saved && (
        <div className="settings-saved">{t("toast.settingsSaved")}</div>
      )}
      <div className="settings-actions">
        <button
          className="icon-btn primary"
          disabled={saving || Boolean(processing || uploading)}
          onClick={save}
        >
          {t(saving ? "common.saving" : "common.save")}
        </button>
      </div>
    </section>
  );
}

export default function AdminWorkspace({
  theme,
  onThemeChange,
  branding,
  onBrandingChange,
  publicInsights,
  onPublicInsightsChange,
}) {
  const auth = useAuth();
  const { t, locale } = useI18n();
  const [tab, setTab] = useState(() => {
    const saved = sessionStorage.getItem("navpilot_admin_tab");
    return tabs.some(([key]) => key === saved) ? saved : "analytics";
  });
  const [loadedTabs, setLoadedTabs] = useState(() => new Set([tab]));
  const [refreshTokens, setRefreshTokens] = useState({});
  const loadedAt = useRef({ [tab]: Date.now() });
  function refreshTab(key) {
    loadedAt.current[key] = Date.now();
    setRefreshTokens((current) => ({
      ...current,
      [key]: (current[key] || 0) + 1,
    }));
  }
  function selectTab(key) {
    const isLoaded = loadedTabs.has(key);
    if (
      isLoaded &&
      key !== "general" &&
      Date.now() - (loadedAt.current[key] || 0) >=
        ADMIN_TAB_CACHE_TTL_MS
    ) {
      refreshTab(key);
    } else if (!isLoaded) {
      loadedAt.current[key] = Date.now();
    }
    setLoadedTabs((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });
    setTab(key);
  }
  useEffect(() => {
    if (!auth.loading && !auth.user) auth.setLoginOpen(true);
  }, [auth.loading, auth.user, auth.setLoginOpen]);
  useEffect(() => sessionStorage.setItem("navpilot_admin_tab", tab), [tab]);
  if (auth.loading) return <AdminLoading />;
  if (!auth.user)
    return (
      <div className="admin-workspace">
        <div className="admin-panel empty-state">{t("auth.loginRequired")}</div>
      </div>
    );
  if (!auth.isAdmin)
    return <div className="empty-state">{t("auth.forbidden")}</div>;
  if (auth.user.mustChangePassword) return <AdminLoading />;
  return (
    <div className="admin-workspace">
      <header className="admin-header">
        <div>
          <a href="/" className="back-link">
            <Icon name="link" size={14} />
            {t("admin.back")}
          </a>
          <h1>{t("admin.workspace")}</h1>
          <p>{t("admin.workspaceDesc")}</p>
        </div>
        <div>
          <span>{auth.user.displayName}</span>
          <button className="icon-btn" onClick={auth.logout}>
            <Icon name="user" size={15} />
            {t("auth.logout")}
          </button>
        </div>
      </header>
      <div className="admin-tab-toolbar">
        <nav
          className="admin-tabs"
          role="tablist"
          aria-label={t("admin.workspace")}
        >
          {tabs.map(([key, icon, label]) => (
            <button
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? "active" : ""}
              key={key}
              onClick={() => selectTab(key)}
            >
              <Icon name={icon} size={16} />
              <span>{t(label)}</span>
            </button>
          ))}
        </nav>
        {tab !== "general" && (
          <button
            type="button"
            className="icon-btn admin-tab-refresh"
            aria-label={
              locale === "en" ? "Refresh current tab" : "刷新当前标签页"
            }
            title={
              locale === "en" ? "Refresh current tab" : "刷新当前标签页"
            }
            onClick={() => refreshTab(tab)}
          >
            <Icon name="refresh" size={15} />
            <span>{locale === "en" ? "Refresh" : "刷新"}</span>
          </button>
        )}
      </div>
      <main className="admin-tab-content">
        {loadedTabs.has("analytics") && (
          <section className="admin-tab-panel" hidden={tab !== "analytics"}>
            <AdminAnalytics refreshToken={refreshTokens.analytics || 0} />
          </section>
        )}
        {loadedTabs.has("audit") && (
          <section className="admin-tab-panel" hidden={tab !== "audit"}>
            <AuditTable refreshToken={refreshTokens.audit || 0} />
          </section>
        )}
        {loadedTabs.has("availability") && (
          <section className="admin-tab-panel" hidden={tab !== "availability"}>
            <AvailabilityManagement refreshToken={refreshTokens.availability || 0} />
          </section>
        )}
        {loadedTabs.has("users") && (
          <section className="admin-tab-panel" hidden={tab !== "users"}>
            <UserManagement refreshToken={refreshTokens.users || 0} />
          </section>
        )}
        {loadedTabs.has("access") && (
          <section className="admin-tab-panel" hidden={tab !== "access"}>
            <AccessGroupManagement refreshToken={refreshTokens.access || 0} />
          </section>
        )}
        {loadedTabs.has("general") && (
          <section className="admin-tab-panel" hidden={tab !== "general"}>
            <GeneralSettings
              theme={theme}
              onThemeChange={onThemeChange}
              branding={branding}
              onBrandingChange={onBrandingChange}
              publicInsights={publicInsights}
              onPublicInsightsChange={onPublicInsightsChange}
            />
          </section>
        )}
        {loadedTabs.has("ai") && (
          <section className="admin-tab-panel" hidden={tab !== "ai"}>
            <AiSettingsPanel refreshToken={refreshTokens.ai || 0} />
          </section>
        )}
      </main>
    </div>
  );
}
