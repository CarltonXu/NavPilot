import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { useI18n } from "../i18n/LocaleContext.jsx";
import Icon from "./Icon.jsx";

const words = {
  "zh-CN": {
    title: "个人空间工具",
    subtitle: "共享、导入和导出你的资源",
    share: "共享资源",
    inbox: "共享记录",
    import: "导入资源",
    export: "导出资源",
    selection: "选择资源范围",
    selected: "已勾选的 {count} 个链接",
    directory: "按目录选择",
    directoryHint: "勾选一个或多个目录，将自动包含其下级目录和资源",
    all: "整个个人空间",
    recipients: "接收用户",
    recipientHint: "输入用户名或用户 ID，多个用户用逗号或换行分隔",
    send: "发送共享",
    sent: "我发出的",
    received: "共享给我的",
    pending: "待处理",
    accepted: "已接受",
    rejected: "已拒绝",
    from: "来自",
    to: "发送给",
    structure: "保留原分类结构",
    target: "导入到",
    root: "个人空间根目录",
    accept: "接受并导入",
    reject: "拒绝",
    none: "暂无共享记录",
    items: "资源",
    categories: "分类",
    duplicates: "已存在",
    selectAll: "选择全部可导入资源",
    importNow: "导入选中资源",
    imported: "成功导入 {count} 个，跳过 {skipped} 个重复资源",
    exportRange: "选择导出范围",
    download: "下载 JSON",
    sentOk: "共享请求已发送",
    standard: "NavPilot 标准 JSON 会保留目录结构，可以随时再次导入。",
    standardJson: "标准 JSON",
    standardJsonDesc: "选择 NavPilot 导出的 JSON 文件",
    chrome: "Chrome Bookmarks",
    chromeDesc: "通过 NavPilot Chrome 扩展直接读取浏览器书签",
    chooseFile: "选择 JSON 文件",
    preview: "解析并检查",
    readChrome: "读取 Chrome 书签",
    readingChrome: "正在读取…",
    downloadExtension: "下载 Chrome 扩展",
    installTitle: "首次使用请安装扩展",
    installSteps: [
      "下载并解压 NavPilot Chrome 扩展",
      "打开 chrome://extensions，开启右上角开发者模式",
      "点击“加载已解压的扩展程序”，选择解压后的目录，然后刷新本页",
    ],
    installedHint: "已经安装并刷新页面？现在可以直接读取浏览器书签。",
    chromeUnavailable:
      "当前浏览器没有检测到 NavPilot 书签扩展。普通网页受浏览器安全限制，无法直接读取书签。",
    chromeInstall: "请先下载并安装 NavPilot Chrome 扩展，然后刷新本页面。",
    back: "重新选择导入类型",
    chooseDirectory: "请至少选择一个目录",
    sharedAt: "共享时间",
    respondedAt: "处理时间",
    viewDetail: "查看详情",
    detailTitle: "共享详情",
    sharedResources: "共享资源明细",
    sharedCategories: "共享目录结构",
    noCategory: "未分类",
  },
  en: {
    title: "My Space tools",
    subtitle: "Share, import and export your resources",
    share: "Share",
    inbox: "Sharing",
    import: "Import",
    export: "Export",
    selection: "Select resource scope",
    selected: "{count} selected links",
    directory: "Choose folders",
    directoryHint:
      "Select one or more folders; descendants and resources are included",
    all: "Entire My Space",
    recipients: "Recipients",
    recipientHint:
      "Enter usernames or user IDs, separated by commas or new lines",
    send: "Send share",
    sent: "Sent",
    received: "Received",
    pending: "Pending",
    accepted: "Accepted",
    rejected: "Rejected",
    from: "From",
    to: "To",
    structure: "Preserve category structure",
    target: "Import into",
    root: "My Space root",
    accept: "Accept and import",
    reject: "Reject",
    none: "No sharing records",
    items: "Items",
    categories: "Categories",
    duplicates: "Already imported",
    selectAll: "Select all importable items",
    importNow: "Import selected",
    imported: "Imported {count}; skipped {skipped} duplicates",
    exportRange: "Choose export scope",
    download: "Download JSON",
    sentOk: "Sharing request sent",
    standard:
      "NavPilot JSON preserves folder structure and can be imported again.",
    standardJson: "Standard JSON",
    standardJsonDesc: "Choose a JSON file exported by NavPilot",
    chrome: "Chrome Bookmarks",
    chromeDesc:
      "Read browser bookmarks directly with the NavPilot Chrome extension",
    chooseFile: "Choose JSON file",
    preview: "Parse and check",
    readChrome: "Read Chrome bookmarks",
    readingChrome: "Reading…",
    downloadExtension: "Download Chrome extension",
    installTitle: "Install the extension first",
    installSteps: [
      "Download and unzip the NavPilot Chrome extension",
      "Open chrome://extensions and enable Developer mode",
      "Choose Load unpacked, select the unzipped folder, then refresh this page",
    ],
    installedHint:
      "Already installed and refreshed? You can now read your browser bookmarks.",
    chromeUnavailable:
      "The NavPilot bookmarks extension was not detected. Browser security prevents a normal website from reading bookmarks directly.",
    chromeInstall:
      "Download and install the NavPilot Chrome extension, then refresh this page.",
    back: "Choose another import type",
    chooseDirectory: "Select at least one folder",
    sharedAt: "Shared",
    respondedAt: "Responded",
    viewDetail: "View details",
    detailTitle: "Sharing details",
    sharedResources: "Shared resources",
    sharedCategories: "Shared folders",
    noCategory: "Uncategorized",
  },
};

const interpolate = (text, values = {}) =>
  text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`);

function selectionBody(mode, selectedIds, categoryIds) {
  if (mode === "selected") return { itemIds: selectedIds };
  if (mode === "directory") return { categoryIds: [...categoryIds] };
  return { all: true };
}

function CategoryScopeTree({ categories, checked, onChange }) {
  const roots = useMemo(() => {
    const children = new Map();
    categories.forEach((row) => {
      const parent = row.parent_id ?? null;
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(row);
    });
    return children;
  }, [categories]);
  function toggle(id) {
    const next = new Set(checked);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next);
  }
  function render(parent = null, depth = 0) {
    return (roots.get(parent) || []).map((category) => (
      <React.Fragment key={category.id}>
        <label className="scope-tree-row" style={{ "--tree-depth": depth }}>
          <input
            type="checkbox"
            checked={checked.has(category.id)}
            onChange={() => toggle(category.id)}
          />
          <span className="scope-tree-icon">
            <Icon name="folder" size={14} />
          </span>
          <span>{category.name}</span>
          {checked.has(category.id) && <small>包含下级</small>}
        </label>
        {render(category.id, depth + 1)}
      </React.Fragment>
    ));
  }
  return <div className="scope-tree">{render()}</div>;
}

function requestChromeBookmarks() {
  return new Promise((resolve, reject) => {
    const requestId = `navpilot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("CHROME_EXTENSION_UNAVAILABLE"));
    }, 2500);
    function cleanup() {
      window.clearTimeout(timer);
      window.removeEventListener("message", receive);
    }
    function receive(event) {
      if (
        event.source !== window ||
        event.data?.type !== "NAVPILOT_BOOKMARKS_RESPONSE" ||
        event.data.requestId !== requestId
      )
        return;
      cleanup();
      if (event.data.error) reject(new Error(event.data.error));
      else
        resolve({
          roots: {
            chrome_root: {
              id: "chrome-root",
              name: "Chrome",
              children: event.data.tree || [],
            },
          },
        });
    }
    window.addEventListener("message", receive);
    window.postMessage({ type: "NAVPILOT_BOOKMARKS_REQUEST", requestId }, "*");
  });
}

function importCategoryPath(preview, key) {
  const byKey = new Map(
      (preview?.categories || []).map((row) => [row.key, row]),
    ),
    names = [],
    seen = new Set();
  let current = key;
  while (current && byKey.has(current) && !seen.has(current)) {
    seen.add(current);
    const row = byKey.get(current);
    names.unshift(row.name);
    current = row.parentKey;
  }
  return names.join(" / ");
}

function ShareDetail({ share, words: w, locale, onClose }) {
  const categories = new Map(
    (share.snapshot?.categories || []).map((row) => [row.key, row]),
  );
  function categoryPath(key) {
    const names = [],
      seen = new Set();
    let current = key;
    while (current && categories.has(current) && !seen.has(current)) {
      seen.add(current);
      const row = categories.get(current);
      names.unshift(row.name);
      current = row.parentKey;
    }
    return names.join(" / ") || w.noCategory;
  }
  const format = (value) =>
    value
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "medium",
        }).format(new Date(value))
      : "—";
  return (
    <div
      className="share-detail-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="share-detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-detail-title"
      >
        <header>
          <div>
            <span className={`share-status ${share.status}`}>
              {w[share.status]}
            </span>
            <h3 id="share-detail-title">{w.detailTitle}</h3>
            <p>
              {share.sender.displayName} → {share.recipient.displayName}
            </p>
          </div>
          <button className="mini-btn" onClick={onClose}>
            <Icon name="close" size={15} />
          </button>
        </header>
        <div className="share-detail-meta">
          <div>
            <span>{w.sharedAt}</span>
            <strong>{format(share.createdAt)}</strong>
          </div>
          <div>
            <span>{w.respondedAt}</span>
            <strong>{format(share.respondedAt)}</strong>
          </div>
          <div>
            <span>{w.categories}</span>
            <strong>{share.summary.categories}</strong>
          </div>
          <div>
            <span>{w.items}</span>
            <strong>{share.summary.items}</strong>
          </div>
        </div>
        <div className="share-detail-body">
          {(share.snapshot?.categories || []).length > 0 && (
            <>
              <h4>{w.sharedCategories}</h4>
              <div className="share-category-list">
                {share.snapshot.categories.map((category) => (
                  <span key={category.key}>
                    <Icon name="folder" size={12} />
                    {categoryPath(category.key)}
                  </span>
                ))}
              </div>
            </>
          )}
          <h4>{w.sharedResources}</h4>
          {(share.snapshot?.items || []).map((item) => (
            <article key={item.key}>
              <span>
                <Icon name="link" size={16} />
              </span>
              <div>
                <strong>{item.name}</strong>
                <small>{item.url}</small>
                <p>{item.description || "—"}</p>
                <div className="share-resource-tags">
                  {(item.tags || []).map((tag) => (
                    <i key={tag}>#{tag}</i>
                  ))}
                </div>
              </div>
              <em>{categoryPath(item.categoryKey)}</em>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function PersonalToolsModal({
  categories,
  selectedIds = [],
  activeCategory,
  onClose,
  onChanged,
  initialTab = "share",
}) {
  const { locale, errorMessage, t } = useI18n();
  const w = words[locale] || words["zh-CN"];
  const initialCategories =
    typeof activeCategory === "number" ? new Set([activeCategory]) : new Set();
  const [tab, setTab] = useState(initialTab);
  const [mode, setMode] = useState(
    selectedIds.length
      ? "selected"
      : initialCategories.size
        ? "directory"
        : "all",
  );
  const [categoryIds, setCategoryIds] = useState(initialCategories);
  const [recipients, setRecipients] = useState("");
  const [shares, setShares] = useState({ sent: [], received: [] });
  const [shareDetail, setShareDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [importType, setImportType] = useState(null);
  const [filePayload, setFilePayload] = useState(null);
  const [preview, setPreview] = useState(null);
  const [chosen, setChosen] = useState(new Set());
  const [target, setTarget] = useState("");
  const [preserve, setPreserve] = useState(true);
  const categoryOptions = useMemo(
    () =>
      categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.path_label || category.name}
        </option>
      )),
    [categories],
  );

  async function loadShares() {
    try {
      setShares(await api.listShares());
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    loadShares();
  }, []);

  function body() {
    if (mode === "directory" && !categoryIds.size)
      throw new Error(w.chooseDirectory);
    return selectionBody(mode, selectedIds, categoryIds);
  }
  async function sendShare() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await api.createShare({
        recipients: recipients
          .split(/[\n,，]+/)
          .map((value) => value.trim())
          .filter(Boolean),
        selection: body(),
      });
      setRecipients("");
      setMessage(w.sentOk);
      await loadShares();
      setTab("inbox");
    } catch (e) {
      setError(e.message === w.chooseDirectory ? e.message : errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  async function respond(share, action) {
    setLoading(true);
    setError("");
    try {
      await api.respondShare(share.id, {
        action,
        targetCategoryId: target ? Number(target) : null,
        preserveStructure: preserve,
      });
      await loadShares();
      if (action === "accept") onChanged?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  async function openShareDetail(share) {
    setLoading(true);
    setError("");
    try {
      setShareDetail(await api.getShare(share.id));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  async function chooseFile(event) {
    setError("");
    setPreview(null);
    setChosen(new Set());
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setFilePayload(JSON.parse(await file.text()));
    } catch {
      setFilePayload(null);
      setError(locale === "en" ? "Invalid JSON file" : "JSON 文件格式无效");
    }
  }
  async function parsePayload(payload, format) {
    setLoading(true);
    setError("");
    try {
      const value = await api.previewImport(payload, format);
      setPreview(value);
      setChosen(
        new Set(
          value.items.filter((item) => !item.duplicate).map((item) => item.key),
        ),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  async function readChrome() {
    setLoading(true);
    setError("");
    setPreview(null);
    try {
      const payload = await requestChromeBookmarks();
      setFilePayload(payload);
      await parsePayload(payload, "chrome");
    } catch {
      setError(`${w.chromeUnavailable} ${w.chromeInstall}`);
      setLoading(false);
    }
  }
  function toggle(key) {
    setChosen((current) => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  async function importNow() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const result = await api.importResources({
        payload: preview,
        selectedKeys: [...chosen],
        targetCategoryId: target ? Number(target) : null,
        preserveStructure: preserve,
      });
      setMessage(
        interpolate(w.imported, {
          count: result.imported,
          skipped: result.skipped,
        }),
      );
      await onChanged?.();
      setPreview(null);
      setFilePayload(null);
      setChosen(new Set());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  async function download() {
    setLoading(true);
    setError("");
    try {
      const payload = await api.exportResources(body());
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `navpilot-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message === w.chooseDirectory ? e.message : errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  const scopeChoices = (
    <>
      <div className="tool-scope-grid">
        {selectedIds.length > 0 && (
          <button
            className={mode === "selected" ? "active" : ""}
            onClick={() => setMode("selected")}
          >
            <Icon name="check" size={17} />
            <span>
              <strong>
                {interpolate(w.selected, { count: selectedIds.length })}
              </strong>
            </span>
          </button>
        )}
        <button
          className={mode === "directory" ? "active" : ""}
          onClick={() => setMode("directory")}
        >
          <Icon name="folder" size={17} />
          <span>
            <strong>{w.directory}</strong>
            <small>
              {categoryIds.size
                ? `${categoryIds.size} ${w.categories}`
                : w.directoryHint}
            </small>
          </span>
        </button>
        <button
          className={mode === "all" ? "active" : ""}
          onClick={() => setMode("all")}
        >
          <Icon name="grid" size={17} />
          <span>
            <strong>{w.all}</strong>
          </span>
        </button>
      </div>
      {mode === "directory" && (
        <div className="scope-tree-panel">
          <div>
            <strong>{w.directory}</strong>
            <small>{w.directoryHint}</small>
          </div>
          <CategoryScopeTree
            categories={categories}
            checked={categoryIds}
            onChange={setCategoryIds}
          />
        </div>
      )}
    </>
  );
  const importPreview = preview && (
    <>
      <div className="import-summary">
        <span>
          {preview.summary.items} {w.items}
        </span>
        <span>
          {preview.summary.categories} {w.categories}
        </span>
        <span>
          {preview.summary.duplicates} {w.duplicates}
        </span>
      </div>
      <label className="tool-check">
        <input
          type="checkbox"
          checked={
            chosen.size ===
            preview.items.filter((item) => !item.duplicate).length
          }
          onChange={(e) =>
            setChosen(
              new Set(
                e.target.checked
                  ? preview.items
                      .filter((item) => !item.duplicate)
                      .map((item) => item.key)
                  : [],
              ),
            )
          }
        />
        {w.selectAll}
      </label>
      <div className="import-list">
        {preview.items.map((item) => (
          <label className={item.duplicate ? "duplicate" : ""} key={item.key}>
            <input
              type="checkbox"
              disabled={item.duplicate}
              checked={!item.duplicate && chosen.has(item.key)}
              onChange={() => toggle(item.key)}
            />
            <span>
              <strong>{item.name}</strong>
              <small>{item.url}</small>
              {importCategoryPath(preview, item.categoryKey) && (
                <em>
                  <Icon name="folder" size={11} />
                  {importCategoryPath(preview, item.categoryKey)}
                </em>
              )}
            </span>
            {item.duplicate && <i>{w.duplicates}</i>}
          </label>
        ))}
      </div>
      <div className="tool-import-options">
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">{w.root}</option>
          {categoryOptions}
        </select>
        <label>
          <input
            type="checkbox"
            checked={preserve}
            onChange={(e) => setPreserve(e.target.checked)}
          />
          {w.structure}
        </label>
      </div>
      <button
        className="icon-btn primary tool-primary"
        disabled={loading || !chosen.size}
        onClick={importNow}
      >
        {w.importNow}
      </button>
    </>
  );

  return (
    <div
      className="modal-mask personal-tools-mask"
      onMouseDown={(e) => e.target === e.currentTarget && !loading && onClose()}
    >
      <div
        className="modal personal-tools-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="personal-tools-title"
      >
        <header>
          <span>
            <Icon name="folder" size={21} />
          </span>
          <div>
            <h3 id="personal-tools-title">{w.title}</h3>
            <p>{w.subtitle}</p>
          </div>
          <button className="mini-btn" disabled={loading} onClick={onClose}>
            <Icon name="close" size={15} />
          </button>
        </header>
        <nav>
          {[
            ["share", "link", w.share],
            ["inbox", "user", w.inbox],
            ["import", "plus", w.import],
            ["export", "docs", w.export],
          ].map(([key, icon, label]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => {
                setTab(key);
                setError("");
                setMessage("");
              }}
            >
              <Icon name={icon} size={15} />
              {label}
              {key === "inbox" &&
                shares.received.filter((item) => item.status === "pending")
                  .length > 0 && (
                  <i>
                    {
                      shares.received.filter(
                        (item) => item.status === "pending",
                      ).length
                    }
                  </i>
                )}
            </button>
          ))}
        </nav>
        <main>
          {tab === "share" && (
            <>
              <label className="tool-label">{w.selection}</label>
              {scopeChoices}
              <div className="form-row">
                <label>{w.recipients}</label>
                <textarea
                  rows="3"
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  placeholder={w.recipientHint}
                />
              </div>
              <button
                className="icon-btn primary tool-primary"
                disabled={loading || !recipients.trim()}
                onClick={sendShare}
              >
                <Icon name="link" size={15} />
                {w.send}
              </button>
            </>
          )}
          {tab === "inbox" && (
            <div className="share-boxes">
              <section>
                <h4>{w.received}</h4>
                {shares.received.length ? (
                  shares.received.map((share) => (
                    <article className="share-record" key={share.id}>
                      <div>
                        <span className={`share-status ${share.status}`}>
                          {w[share.status]}
                        </span>
                        <strong>
                          {w.from} {share.sender.displayName}{" "}
                          <small>@{share.sender.username}</small>
                        </strong>
                        <p>
                          {share.summary.items} {w.items} ·{" "}
                          {share.summary.categories} {w.categories}
                        </p>
                        <time>
                          {w.sharedAt} ·{" "}
                          {new Date(share.createdAt).toLocaleString(locale)}
                        </time>
                        {share.respondedAt && (
                          <time>
                            {w.respondedAt} ·{" "}
                            {new Date(share.respondedAt).toLocaleString(locale)}
                          </time>
                        )}
                        <button
                          className="share-detail-link"
                          onClick={() => openShareDetail(share)}
                        >
                          {w.viewDetail}
                        </button>
                      </div>
                      {share.status === "pending" && (
                        <div className="share-response">
                          <select
                            value={target}
                            onChange={(e) => setTarget(e.target.value)}
                          >
                            <option value="">{w.root}</option>
                            {categoryOptions}
                          </select>
                          <label>
                            <input
                              type="checkbox"
                              checked={preserve}
                              onChange={(e) => setPreserve(e.target.checked)}
                            />
                            {w.structure}
                          </label>
                          <div>
                            <button
                              className="icon-btn"
                              disabled={loading}
                              onClick={() => respond(share, "reject")}
                            >
                              {w.reject}
                            </button>
                            <button
                              className="icon-btn primary"
                              disabled={loading}
                              onClick={() => respond(share, "accept")}
                            >
                              {w.accept}
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  ))
                ) : (
                  <div className="tool-empty">{w.none}</div>
                )}
              </section>
              <section>
                <h4>{w.sent}</h4>
                {shares.sent.length ? (
                  shares.sent.map((share) => (
                    <article className="share-record compact" key={share.id}>
                      <div>
                        <span className={`share-status ${share.status}`}>
                          {w[share.status]}
                        </span>
                        <strong>
                          {w.to} {share.recipient.displayName}{" "}
                          <small>@{share.recipient.username}</small>
                        </strong>
                        <p>
                          {share.summary.items} {w.items} ·{" "}
                          {share.summary.categories} {w.categories}
                        </p>
                        <time>
                          {w.sharedAt} ·{" "}
                          {new Date(share.createdAt).toLocaleString(locale)}
                        </time>
                        {share.respondedAt && (
                          <time>
                            {w.respondedAt} ·{" "}
                            {new Date(share.respondedAt).toLocaleString(locale)}
                          </time>
                        )}
                        <button
                          className="share-detail-link"
                          onClick={() => openShareDetail(share)}
                        >
                          {w.viewDetail}
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="tool-empty">{w.none}</div>
                )}
              </section>
            </div>
          )}
          {tab === "import" && (
            <>
              {!importType ? (
                <div className="import-type-grid">
                  <button onClick={() => setImportType("json")}>
                    <span>
                      <Icon name="docs" size={22} />
                    </span>
                    <strong>{w.standardJson}</strong>
                    <small>{w.standardJsonDesc}</small>
                    <Icon name="chevronRight" size={15} />
                  </button>
                  <button onClick={() => setImportType("chrome")}>
                    <span>
                      <Icon name="globe" size={22} />
                    </span>
                    <strong>{w.chrome}</strong>
                    <small>{w.chromeDesc}</small>
                    <Icon name="chevronRight" size={15} />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    className="text-btn import-back"
                    onClick={() => {
                      setImportType(null);
                      setPreview(null);
                      setFilePayload(null);
                      setError("");
                    }}
                  >
                    {w.back}
                  </button>
                  {importType === "json" && !preview && (
                    <div className="import-drop">
                      <Icon name="docs" size={26} />
                      <strong>{w.chooseFile}</strong>
                      <small>{w.standardJsonDesc}</small>
                      <input
                        type="file"
                        accept="application/json,.json"
                        onChange={chooseFile}
                      />
                      {filePayload && (
                        <button
                          className="icon-btn primary"
                          disabled={loading}
                          onClick={() => parsePayload(filePayload, "navpilot")}
                        >
                          {w.preview}
                        </button>
                      )}
                    </div>
                  )}
                  {importType === "chrome" && !preview && (
                    <div className="chrome-import-panel">
                      <span>
                        <Icon name="globe" size={28} />
                      </span>
                      <h4>{w.chrome}</h4>
                      <p>{w.chromeDesc}</p>
                      <div className="chrome-install-guide">
                        <strong>{w.installTitle}</strong>
                        <ol>
                          {w.installSteps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      </div>
                      <a
                        className="icon-btn chrome-download-btn"
                        href="/downloads/navpilot-bookmarks-extension.zip"
                        download
                      >
                        <Icon name="docs" size={15} />
                        {w.downloadExtension}
                      </a>
                      <small>{w.installedHint}</small>
                      <button
                        className="icon-btn primary"
                        disabled={loading}
                        onClick={readChrome}
                      >
                        <Icon name="folder" size={15} />
                        {loading ? w.readingChrome : w.readChrome}
                      </button>
                    </div>
                  )}
                  {importPreview}
                </>
              )}
            </>
          )}
          {tab === "export" && (
            <>
              <label className="tool-label">{w.exportRange}</label>
              {scopeChoices}
              <div className="settings-note">
                <Icon name="docs" size={17} />
                <span>{w.standard}</span>
              </div>
              <button
                className="icon-btn primary tool-primary"
                disabled={loading}
                onClick={download}
              >
                <Icon name="docs" size={15} />
                {w.download}
              </button>
            </>
          )}
          {error && <div className="error-text tool-error">{error}</div>}
          {message && <div className="settings-saved">{message}</div>}
        </main>
      </div>
      {shareDetail && (
        <ShareDetail
          share={shareDetail}
          words={w}
          locale={locale}
          onClose={() => setShareDetail(null)}
        />
      )}
    </div>
  );
}
