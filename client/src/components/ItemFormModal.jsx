import React, { useRef, useState } from "react";
import { api } from "../api.js";
import { useI18n } from "../i18n/LocaleContext.jsx";
import Icon, { ContentIcon } from "./Icon.jsx";

import { flattenCategoryTree } from "../utils/categoryTree.js";

const ICON_PRESETS = [
  "🔗",
  "🌐",
  "💻",
  "📊",
  "📚",
  "🛠️",
  "📋",
  "🐙",
  "☁️",
  "🧭",
  "📈",
  "🔒",
  "📁",
  "🚀",
];

export default function ItemFormModal({
  item,
  categories,
  onClose,
  onSubmit,
  onDelete,
  scope = item?.scope || "public",
}) {
  const { t, errorMessage, locale } = useI18n();
  const isEdit = Boolean(item && item.id);
  const [form, setForm] = useState({
    name: item?.name || "",
    url: item?.url || "",
    icon: item?.icon || "🔗",
    description: item?.description || "",
    tagsText: Array.isArray(item?.tags) ? item.tags.join(", ") : "",
    category_id: item?.category_id ?? "",
    check_method: item?.check_method || "http",
    check_target: item?.check_target || "",
    check_enabled: item?.check_enabled ?? 1,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataMessage, setMetadataMessage] = useState("");
  const dirtyFields = useRef(new Set());
  const activeInspection = useRef(null);
  const lastInspectedUrl = useRef("");
  const metadataWords =
    locale === "en"
      ? {
          button: "Identify site",
          loading: "Identifying…",
          success: "Site name, description and icon were identified.",
          hint: "Enter a reachable URL to identify site information automatically.",
        }
      : {
          button: "识别网站信息",
          loading: "正在识别…",
          success: "已获取网站名称、描述和图标。",
          hint: "输入可访问的网址后，可自动获取网站名称、描述和图标。",
        };
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  function userUpdate(key, value) {
    dirtyFields.current.add(key);
    if (key === "url") setMetadataMessage("");
    update(key, value);
  }
  async function inspectMetadata(force = false) {
    const url = form.url.trim();
    if (!url || activeInspection.current) return;
    if (!force && (isEdit || lastInspectedUrl.current === url)) return;
    setMetadataLoading(true);
    setMetadataMessage("");
    setError("");
    const inspection = api.inspectItemUrl(scope, url);
    activeInspection.current = inspection;
    try {
      const metadata = await inspection;
      lastInspectedUrl.current = url;
      setForm((current) => ({
        ...current,
        url: metadata.url || current.url,
        name:
          metadata.name && (force || !dirtyFields.current.has("name"))
            ? metadata.name
            : current.name,
        description:
          metadata.description &&
          (force || !dirtyFields.current.has("description"))
            ? metadata.description
            : current.description,
        icon:
          metadata.icon && (force || !dirtyFields.current.has("icon"))
            ? metadata.icon
            : current.icon,
      }));
      setMetadataMessage(metadataWords.success);
    } catch (err) {
      setMetadataMessage("");
      if (force) setError(errorMessage(err));
    } finally {
      activeInspection.current = null;
      setMetadataLoading(false);
    }
  }
  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.url.trim()) {
      setError(t("item.required"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { tagsText, ...fields } = form;
      await onSubmit({
        ...fields,
        tags: [
          ...new Set(
            tagsText
              .split(/[,，]/)
              .map((tag) => tag.trim().replace(/^#+/, ""))
              .filter(Boolean),
          ),
        ],
        category_id: form.category_id === "" ? null : Number(form.category_id),
        check_enabled: form.check_enabled ? 1 : 0,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t(isEdit ? "item.editTitle" : "item.addTitle")}</h3>
        <p className="modal-sub">{t("item.description")}</p>
        <form onSubmit={submit}>
          <div className="form-grid-2">
            <div className="form-row">
              <label>{t("item.name")}</label>
              <input
                value={form.name}
                onChange={(e) => userUpdate("name", e.target.value)}
                placeholder={t("item.namePlaceholder")}
              />
            </div>
            <div className="form-row">
              <label>{t("item.icon")}</label>
              <div className="item-icon-control">
                <span>
                  <ContentIcon value={form.icon} size={20} />
                </span>
                <input
                  value={form.icon}
                  onChange={(e) => userUpdate("icon", e.target.value)}
                  placeholder="🔗"
                />
              </div>
            </div>
          </div>
          <div className="form-row">
            <label>{t("item.url")}</label>
            <div className="item-url-control">
              <input
                value={form.url}
                onChange={(e) => userUpdate("url", e.target.value)}
                onBlur={() => inspectMetadata(false)}
                placeholder="https://"
              />
              <button
                type="button"
                className="icon-btn"
                disabled={metadataLoading || !form.url.trim()}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => inspectMetadata(true)}
              >
                <Icon name={metadataLoading ? "refresh" : "globe"} size={15} />
                {metadataLoading ? metadataWords.loading : metadataWords.button}
              </button>
            </div>
            <div
              className={`hint item-metadata-hint ${metadataMessage ? "success" : ""}`}
            >
              {metadataMessage || metadataWords.hint}
            </div>
          </div>
          <div className="form-row">
            <label>{t("item.quickIcon")}</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ICON_PRESETS.map((icon) => (
                <button
                  type="button"
                  key={icon}
                  className="mini-btn"
                  style={{ width: 30, height: 30, fontSize: 15 }}
                  onClick={() => userUpdate("icon", icon)}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <div className="form-row">
            <label>{t("item.descriptionLabel")}</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => userUpdate("description", e.target.value)}
              placeholder={t("item.descriptionPlaceholder")}
            />
          </div>
          <div className="form-row">
            <label>{locale === "en" ? "Tags" : "标签"}</label>
            <input
              value={form.tagsText}
              onChange={(e) => update("tagsText", e.target.value)}
              placeholder={
                locale === "en" ? "e.g. docs, work, AI" : "例如：文档、工作、AI"
              }
            />
            <div className="hint">
              {locale === "en"
                ? "Separate tags with commas; up to 20 tags. Tags are searchable and available to AI actions."
                : "使用逗号分隔，最多 20 个标签；标签支持搜索、筛选和 AI 操作。"}
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-row">
              <label>{t("item.category")}</label>
              <select
                value={form.category_id}
                onChange={(e) => update("category_id", e.target.value)}
              >
                <option value="">{t("category.uncategorized")}</option>
                {flattenCategoryTree(categories).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.path_label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>{t("item.checkMethod")}</label>
              <select
                value={form.check_method}
                onChange={(e) => update("check_method", e.target.value)}
              >
                <option value="http">HTTP(S)</option>
                <option value="tcp">{t("item.tcp")}</option>
                <option value="none">{t("item.none")}</option>
              </select>
            </div>
          </div>
          {form.check_method !== "none" && (
            <div className="form-row">
              <label>{t("item.checkTarget")}</label>
              <input
                value={form.check_target}
                onChange={(e) => update("check_target", e.target.value)}
                placeholder={
                  form.check_method === "tcp"
                    ? t("item.tcpPlaceholder")
                    : "https://example.com/health"
                }
              />
              <div className="hint">{t("item.checkHint")}</div>
            </div>
          )}
          {error && <div className="error-text">{error}</div>}
          <div className="modal-actions">
            {isEdit && (
              <button
                type="button"
                className="icon-btn"
                style={{ marginRight: "auto", color: "var(--offline)" }}
                onClick={onDelete}
              >
                {t("common.delete")}
              </button>
            )}
            <button type="button" className="icon-btn" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              className="icon-btn primary"
              disabled={saving}
            >
              {t(saving ? "common.saving" : "common.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
