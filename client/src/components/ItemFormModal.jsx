import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useI18n } from "../i18n/LocaleContext.jsx";
import Icon from "./Icon.jsx";
import VectorIconPicker from "./VectorIconPicker.jsx";
import { AccessEditor } from "./AccessControl.jsx";

import { flattenCategoryTree } from "../utils/categoryTree.js";

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
    icon: item?.icon || "icon:link",
    description: item?.description || "",
    tagsText: Array.isArray(item?.tags) ? item.tags.join(", ") : "",
    category_id: item?.category_id ?? "",
    check_method: item?.check_method || "http",
    check_target: item?.check_target || "",
  });
  const [error, setError] = useState("");
  const [access,setAccess]=useState(isEdit?{visibility:item?.visibility||'public',grants:[]}:{inherit:true,visibility:'public',grants:[]});
  const [accessLoading,setAccessLoading]=useState(isEdit&&scope==='public');
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
  useEffect(()=>{if(!isEdit||scope!=='public')return;let active=true;api.getItemAccess(item.id).then(value=>{if(active)setAccess(value);}).catch(err=>{if(active)setError(errorMessage(err));}).finally(()=>{if(active)setAccessLoading(false);});return()=>{active=false;};},[isEdit,item?.id,scope,errorMessage]);
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
    setSaving(true);
    setError("");
    try {
      let submission = { ...form };
      if (!isEdit && submission.url.trim()) {
        try {
          let metadata = null;
          if (activeInspection.current) metadata = await activeInspection.current;
          else if (lastInspectedUrl.current !== submission.url.trim()) {
            setMetadataLoading(true);
            metadata = await api.inspectItemUrl(scope, submission.url.trim());
          }
          if (metadata) {
            submission = {
              ...submission,
              url: metadata.url || submission.url,
              name:
                metadata.name &&
                (!submission.name.trim() || !dirtyFields.current.has("name"))
                  ? metadata.name
                  : submission.name,
              description:
                metadata.description &&
                (!submission.description.trim() ||
                  !dirtyFields.current.has("description"))
                  ? metadata.description
                  : submission.description,
              icon:
                metadata.icon && !dirtyFields.current.has("icon")
                  ? metadata.icon
                  : submission.icon,
            };
            lastInspectedUrl.current = form.url.trim();
            setForm(submission);
            setMetadataMessage(metadataWords.success);
          }
        } catch {
          /* Metadata failure must not prevent a valid manual resource create. */
        } finally {
          setMetadataLoading(false);
        }
        try {
          const parsed = new URL(
            /^https?:\/\//i.test(submission.url.trim())
              ? submission.url.trim()
              : `https://${submission.url.trim()}`,
          );
          submission.url = parsed.toString();
          if (!submission.name.trim())
            submission.name = parsed.hostname.replace(/^www\./i, "");
        } catch {
          /* The API will return the localized URL validation error. */
        }
      }
      if (!submission.name.trim() || !submission.url.trim()) {
        setError(t("item.required"));
        return;
      }
      const { tagsText, ...fields } = submission;
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
        category_id:
          submission.category_id === "" ? null : Number(submission.category_id),
        // The method is the single source of truth: HTTP/TCP enables checking,
        // while “none” disables it.
        check_enabled: submission.check_method === "none" ? 0 : 1,
        ...(scope==='public'&&!access.inherit?{access}:{})
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-mask" onClick={onClose}>
      <div
        className={`modal item-form-modal ${scope === "public" ? "with-access" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="item-form-header">
          <h3 id="item-form-title">
            {t(isEdit ? "item.editTitle" : "item.addTitle")}
          </h3>
          <p className="modal-sub">{t("item.description")}</p>
        </header>
        <form className="item-form-shell" onSubmit={submit}>
          <div className={`item-form-body ${scope === "public" ? "has-access" : ""}`}>
          <section
            className="item-form-main-panel"
            aria-label={locale === "en" ? "Basic information" : "基本信息"}
          >
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
                <VectorIconPicker
                  value={form.icon}
                  onChange={(icon) => userUpdate("icon", icon)}
                  label={t("item.icon")}
                  allowCustom
                  iconOnly
                />
                <input
                  value={form.icon}
                  onChange={(e) => userUpdate("icon", e.target.value)}
                  placeholder="https://example.com/favicon.ico"
                  aria-label={`${t("item.icon")} URL`}
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
          </section>
          {scope === "public" && (
            <aside
              className="item-form-access-panel"
              aria-labelledby="item-access-title"
            >
              <header>
                <span><Icon name="shield" size={17} /></span>
                <div>
                  <h4 id="item-access-title">
                    {locale === "en" ? "Visibility and access" : "可见范围与授权"}
                  </h4>
                  <p>
                    {locale === "en"
                      ? "Control who can find and open this public resource."
                      : "控制哪些用户可以发现并访问这个公共资源。"}
                  </p>
                </div>
              </header>
              <div className="item-form-access-content">
                {accessLoading ? (
                  <div className="hint">{t("common.loading")}</div>
                ) : (
                  <AccessEditor
                    value={access}
                    onChange={setAccess}
                    allowInherit={!isEdit}
                  />
                )}
              </div>
            </aside>
          )}
          </div>
          {error && <div className="item-form-error error-text">{error}</div>}
          <div className="modal-actions item-form-actions">
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
