import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "./api.js";
import { useAuth } from "./auth/AuthContext.jsx";
import { useI18n } from "./i18n/LocaleContext.jsx";
import ThemeSwitcher from "./components/ThemeSwitcher.jsx";
import LocaleSwitcher from "./components/LocaleSwitcher.jsx";
import CategoryNav from "./components/CategoryNav.jsx";
import NavCard from "./components/NavCard.jsx";
import ItemFormModal from "./components/ItemFormModal.jsx";
import SpaceSwitcher from "./components/SpaceSwitcher.jsx";
import AiAssistantWidget from "./components/AiAssistantWidget.jsx";
import AiAddModal from "./components/AiAddModal.jsx";
import ViewModeSwitcher from "./components/ViewModeSwitcher.jsx";
import AdminWorkspace from "./components/AdminWorkspace.jsx";
import { DeleteCategoryDialog } from "./components/PublicContentManager.jsx";
import {
  AccountMenu,
  LoginDialog,
  PasswordChangeDialog,
} from "./components/AuthDialogs.jsx";
import Icon, { ContentIcon } from "./components/Icon.jsx";
import {
  categoryCounts,
  categorySelectionStates,
  filterByCategory,
} from "./utils/categoryTree.js";
import { possibleURL } from "./utils/urlSuggestion.js";
import {
  beginWorkspaceLoad,
  failWorkspaceLoad,
} from "./utils/workspaceSnapshot.js";
import PersonalToolsModal from "./components/PersonalToolsModal.jsx";
import GlobalSearch from "./components/GlobalSearch.jsx";
import RecognitionResultDialog from "./components/RecognitionResultDialog.jsx";

const validView = (value) =>
  ["card", "compact", "dense"].includes(value) ? value : "card";
const defaultFavicon = document.querySelector('link[rel="icon"]')?.href || "";

function Brand({ branding }) {
  return (
    <>
      <span className="brand-mark">
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt="" />
        ) : (
          <Icon name="assistant" size={17} />
        )}
      </span>
      {branding.siteName}
      <span className="brand-tag">NAV</span>
    </>
  );
}

function BatchMoveBar({
  selectedCount,
  visibleCount,
  allVisibleSelected,
  categories,
  target,
  onTarget,
  onToggleAll,
  onClear,
  onMove,
  onRecognize,
  onDelete,
  onShare,
  moving,
  deleting,
  recognizing,
  recognitionProgress,
  hasRecognitionResult,
  onShowRecognitionResult,
}) {
  const { t, locale } = useI18n();
  return (
    <div className="batch-move-bar">
      <span>{t("batch.selected", { count: selectedCount })}</span>
      <button
        className={`icon-btn batch-select-toggle ${allVisibleSelected ? "active" : ""}`}
        disabled={!visibleCount || moving || deleting || recognizing}
        onClick={onToggleAll}
      >
        <span className="batch-select-box">
          {allVisibleSelected && <Icon name="check" size={12} />}
        </span>
        {t(
          allVisibleSelected ? "batch.unselectVisible" : "batch.selectVisible",
        )}
      </button>
      {selectedCount > 0 && (
        <>
          <select
            aria-label={t("batch.targetCategory")}
            value={target}
            disabled={recognizing}
            onChange={(event) => onTarget(event.target.value)}
          >
            <option value="">{t("batch.chooseCategory")}</option>
            <option value="uncategorized">{t("category.uncategorized")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.path_label || category.name}
              </option>
            ))}
          </select>
          <button
            className="icon-btn primary"
            disabled={moving || deleting || recognizing || !target}
            onClick={onMove}
          >
            <Icon name="folder" size={14} />
            {t(moving ? "batch.moving" : "batch.move")}
          </button>
          <button
            className="icon-btn batch-identify-btn"
            disabled={moving || deleting || recognizing}
            onClick={onRecognize}
          >
            <Icon
              name={recognizing ? "refresh" : "globe"}
              size={14}
              className={recognizing ? "batch-identify-spinner" : ""}
            />
            {recognizing
              ? t("batch.identifyingProgress", recognitionProgress)
              : t("batch.identify")}
          </button>
          {recognizing && recognitionProgress && (
            <span className="batch-identify-progress" role="status">
              <span className="batch-progress-track">
                <span
                  style={{
                    width: `${Math.round(
                      (recognitionProgress.processed /
                        recognitionProgress.total) *
                        100,
                    )}%`,
                  }}
                />
              </span>
              {t("batch.identifyStats", recognitionProgress)}
            </span>
          )}
          {onShare && (
            <button
              className="icon-btn"
              disabled={deleting || recognizing}
              onClick={onShare}
            >
              <Icon name="link" size={14} />
              {locale === "en" ? "Share" : "共享"}
            </button>
          )}
          <button
            className="icon-btn batch-delete-btn"
            disabled={moving || deleting || recognizing}
            onClick={onDelete}
          >
            <Icon name="trash" size={14} />
            {t(deleting ? "batch.deleting" : "batch.delete")}
          </button>
          <button className="text-btn" disabled={recognizing} onClick={onClear}>
            {t("batch.clear")}
          </button>
        </>
      )}
      {hasRecognitionResult && !recognizing && (
        <button className="text-btn batch-result-trigger" onClick={onShowRecognitionResult}>
          <Icon name="docs" size={14} />
          {t("batch.viewIdentifyDetails")}
        </button>
      )}
    </div>
  );
}

function SearchCreateSuggestion({ query, url, onCreate }) {
  const { t } = useI18n();
  if (!url) return <div className="empty-state">{t("app.noMatch")}</div>;
  let host = query;
  try {
    host = new URL(url).host;
  } catch {
    /* keep query */
  }
  return (
    <div className="empty-state search-create-suggestion">
      <Icon name="search" size={28} />
      <strong>{t("searchSuggestion.title")}</strong>
      <span>{t("searchSuggestion.url", { url: host })}</span>
      <button className="icon-btn primary" onClick={() => onCreate(url)}>
        <Icon name="plus" size={15} />
        {t("searchSuggestion.create")}
      </button>
    </div>
  );
}

function PortalWorkspace({ theme, onThemeChange, branding, publicSettings }) {
  const auth = useAuth();
  const { t, errorMessage } = useI18n();
  const generation = useRef(0);
  const identityKey = auth.loading
    ? null
    : auth.user
      ? `user:${auth.user.id}`
      : "anonymous";
  const [selection, setSelection] = useState({
    identityKey: null,
    space: null,
  });
  const [snapshot, setSnapshot] = useState({
    key: null,
    status: "idle",
    categories: [],
    items: [],
  });
  const [viewMode, setViewMode] = useState(() =>
      validView(localStorage.getItem("navpilot_view_mode_v1")),
    ),
    [activeCategory, setActiveCategory] = useState("all"),
    [activeTag, setActiveTag] = useState(""),
    [query, setQuery] = useState(""),
    [publicEditMode, setPublicEditMode] = useState(false),
    [personalEditMode, setPersonalEditMode] = useState(false),
    [editingItem, setEditingItem] = useState(null),
    [showPublicAi, setShowPublicAi] = useState(false),
    [showPersonalTools, setShowPersonalTools] = useState(false),
    [personalToolsTab, setPersonalToolsTab] = useState("share"),
    [checkingAll, setCheckingAll] = useState(false),
    [checking, setChecking] = useState(new Set()),
    [toast, setToast] = useState(""),
    [deleteImpact, setDeleteImpact] = useState(null),
    [error, setError] = useState(""),
    [selectedIds, setSelectedIds] = useState(new Set()),
    [batchCategory, setBatchCategory] = useState(""),
    [moving, setMoving] = useState(false),
    [deleting, setDeleting] = useState(false),
    [recognizing, setRecognizing] = useState(false),
    [recognitionProgress, setRecognitionProgress] = useState(null),
    [recognitionResult, setRecognitionResult] = useState(null),
    [showRecognitionResult, setShowRecognitionResult] = useState(false),
    [assistantRequest, setAssistantRequest] = useState(null);
  const spaceReady =
    identityKey !== null &&
    selection.identityKey === identityKey &&
    selection.space;
  useEffect(() => {
    const launch = (event) =>
      setAssistantRequest({
        id: Date.now(),
        scope: event.detail?.scope || "personal",
        text: event.detail?.text || "",
      });
    window.addEventListener("navpilot:assistant-request", launch);
    return () =>
      window.removeEventListener("navpilot:assistant-request", launch);
  }, []);
  useEffect(() => {
    if (!recognizing) return undefined;
    const preventLeave = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventLeave);
    return () => window.removeEventListener("beforeunload", preventLeave);
  }, [recognizing]);
  const space = spaceReady ? selection.space : null;
  useEffect(() => {
    if (identityKey === null) return;
    generation.current += 1;
    setSnapshot({ key: null, status: "idle", categories: [], items: [] });
    setActiveCategory("all");
    setActiveTag("");
    setQuery("");
    setPublicEditMode(false);
    setPersonalEditMode(false);
    setEditingItem(null);
    setShowPublicAi(false);
    setChecking(new Set());
    setDeleteImpact(null);
    setSelectedIds(new Set());
    setBatchCategory("");
    setRecognitionResult(null);
    setShowRecognitionResult(false);
    const preferred =
        auth.user?.preferences?.defaultSpace ||
        localStorage.getItem(`navpilot_space_v1:${auth.user?.id}`),
      nextSpace =
        identityKey === "anonymous"
          ? "public"
          : preferred === "personal"
            ? "personal"
            : "public";
    if (auth.user?.preferences?.viewMode)
      setViewMode(validView(auth.user.preferences.viewMode));
    setSelection({ identityKey, space: nextSpace });
  }, [identityKey, auth.user?.id]);
  useEffect(() => {
    if (spaceReady && auth.user)
      localStorage.setItem(`navpilot_space_v1:${auth.user.id}`, space);
  }, [spaceReady, space, auth.user?.id]);
  useEffect(
    () => localStorage.setItem("navpilot_view_mode_v1", viewMode),
    [viewMode],
  );
  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!spaceReady) return;
      const key = `${identityKey}:${space}`,
        current = ++generation.current;
      setSnapshot((previous) => beginWorkspaceLoad(previous, key));
      try {
        const [categories, items] = await Promise.all([
          api.listCategories(space),
          api.listItems(space),
        ]);
        if (current !== generation.current) return;
        setSnapshot({ key, status: "ready", categories, items });
        setError("");
      } catch (e) {
        if (current === generation.current) {
          setSnapshot((previous) => failWorkspaceLoad(previous, key));
          if (!silent) setError(errorMessage(e));
        }
      }
    },
    [spaceReady, identityKey, space, errorMessage],
  );
  useEffect(() => {
    if (!spaceReady) return;
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load({ silent: true });
    }, 30000);
    return () => clearInterval(timer);
  }, [spaceReady, load]);
  const expectedKey = spaceReady ? `${identityKey}:${space}` : null,
    ready = snapshot.key === expectedKey && snapshot.status === "ready";
  const categories = ready ? snapshot.categories : [],
    items = ready ? snapshot.items : [];
  const counts = useMemo(() => {
    const value = categoryCounts(categories, items);
    return {
      ...value.aggregate,
      uncategorized: value.direct.uncategorized || 0,
      all: items.length,
    };
  }, [categories, items]);
  const allTags = useMemo(
    () =>
      [
        ...new Set(
          items.flatMap((item) => (Array.isArray(item.tags) ? item.tags : [])),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [items],
  );
  const filtered = useMemo(
    () =>
      filterByCategory(items, categories, activeCategory).filter((item) => {
        const tags = Array.isArray(item.tags) ? item.tags : [];
        const tagMatch =
          !activeTag ||
          tags.some(
            (tag) => tag.toLocaleLowerCase() === activeTag.toLocaleLowerCase(),
          );
        const textMatch =
          !query.trim() ||
          `${item.name} ${item.url} ${item.description} ${tags.join(" ")}`
            .toLowerCase()
            .includes(query.trim().toLowerCase());
        return tagMatch && textMatch;
      }),
    [items, categories, activeCategory, activeTag, query],
  );
  const categorySelections = useMemo(
    () => categorySelectionStates(categories, items, selectedIds),
    [categories, items, selectedIds],
  );
  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((item) => {
      const key = item.category_id ?? "uncategorized";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return map;
  }, [filtered]);
  const isPersonalOwner = space === "personal" && auth.authenticated && ready;
  const canEditPublic =
    space === "public" &&
    auth.isAdmin &&
    !auth.user?.mustChangePassword &&
    ready;
  const canManage =
    (canEditPublic && publicEditMode) || (isPersonalOwner && personalEditMode);
  function exitEditModes() {
    if (recognizing) {
      toastMessage(t("batch.recognitionLocked"));
      return;
    }
    setPublicEditMode(false);
    setPersonalEditMode(false);
    setEditingItem(null);
    setShowPublicAi(false);
    setDeleteImpact(null);
    setChecking(new Set());
    setSelectedIds(new Set());
    setBatchCategory("");
  }
  function toastMessage(message) {
    setToast(message);
    setTimeout(() => setToast(""), 2400);
  }
  function switchSpace(next) {
    if (recognizing) {
      toastMessage(t("batch.recognitionLocked"));
      return;
    }
    if (next === "personal" && !auth.authenticated) {
      auth.setLoginOpen(true);
      return;
    }
    exitEditModes();
    setRecognitionResult(null);
    setShowRecognitionResult(false);
    generation.current += 1;
    setSelection({ identityKey, space: next });
    setSnapshot({ key: null, status: "idle", categories: [], items: [] });
    setActiveCategory("all");
    setActiveTag("");
    setQuery("");
  }
  async function saveItem(form) {
    if (!canManage) return;
    if (editingItem?.id) await api.updateItem(editingItem.id, form);
    else await api.createItem({ ...form, scope: space });
    setEditingItem(null);
    await load();
  }
  async function deleteItem(item) {
    if (!canManage) return;
    if (!confirm(t("confirm.deleteItem", { name: item.name }))) return;
    await api.deleteItem(item.id);
    setEditingItem(null);
    await load();
  }
  async function recheck(item) {
    if (!canManage) return;
    setChecking((current) => new Set(current).add(item.id));
    try {
      await api.checkItem(item.id);
      await load();
    } finally {
      setChecking((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }
  async function createCategory(body) {
    if (!canManage) return;
    await api.createCategory({ ...body, scope: space });
    await load();
  }
  async function renameCategory(category, name) {
    if (!canManage) return;
    await api.updateCategory(category.id, {
      name,
      expectedVersion: category.version,
    });
    await load();
  }
  function toggleSelected(id) {
    if (recognizing) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleVisible() {
    if (recognizing) return;
    setSelectedIds((current) => {
      const next = new Set(current),
        all =
          filtered.length > 0 && filtered.every((item) => next.has(item.id));
      filtered.forEach((item) =>
        all ? next.delete(item.id) : next.add(item.id),
      );
      return next;
    });
  }
  function toggleCategorySelection(categoryId) {
    if (moving || deleting || recognizing) return;
    const categoryItems = filterByCategory(items, categories, categoryId);
    if (!categoryItems.length) return;
    setSelectedIds((current) => {
      const next = new Set(current),
        allSelected = categoryItems.every((item) => next.has(item.id));
      categoryItems.forEach((item) =>
        allSelected ? next.delete(item.id) : next.add(item.id),
      );
      return next;
    });
  }
  function startDrag(event, item) {
    if (recognizing) {
      event.preventDefault();
      return;
    }
    const ids = selectedIds.has(item.id) ? [...selectedIds] : [item.id];
    if (!selectedIds.has(item.id)) setSelectedIds(new Set(ids));
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      "application/x-navpilot-item-ids",
      JSON.stringify(ids),
    );
    event.dataTransfer.setData("text/plain", ids.join(","));
  }
  async function moveItems(ids, categoryId) {
    if (!canManage || !ids.length || moving || deleting || recognizing) return;
    setMoving(true);
    setError("");
    try {
      await api.bulkUpdateItems(space, ids, { category_id: categoryId });
      setSelectedIds(new Set());
      setBatchCategory("");
      toastMessage(t("batch.moved", { count: ids.length }));
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setMoving(false);
    }
  }
  async function recognizeSelectedItems() {
    const ids = [...selectedIds];
    if (!canManage || !ids.length || moving || deleting || recognizing) return;
    if (!confirm(t("batch.confirmIdentify", { count: ids.length }))) return;
    const beforeById = new Map(
        items.filter((item) => selectedIds.has(item.id)).map((item) => [item.id, item]),
      ),
      successes = [],
      failureDetails = [],
      metadataFields = ["name", "description", "icon"];
    setRecognizing(true);
    setRecognitionResult(null);
    setShowRecognitionResult(false);
    setRecognitionProgress({
      processed: 0,
      total: ids.length,
      updated: 0,
      failed: 0,
    });
    setError("");
    let processed = 0,
      updated = 0,
      failed = 0,
      lastError = null;
    try {
      const chunkSize = 12;
      for (let offset = 0; offset < ids.length; offset += chunkSize) {
        const chunk = ids.slice(offset, offset + chunkSize);
        try {
          const result = await api.bulkInspectItems(space, chunk);
          result.items.forEach((after) => {
            const before = beforeById.get(after.id) || after;
            successes.push({
              id: after.id,
              before,
              after,
              changedFields: metadataFields.filter(
                (field) => String(before[field] || "") !== String(after[field] || ""),
              ),
            });
          });
          result.failures.forEach((failure) => {
            const before = beforeById.get(failure.id);
            failureDetails.push({
              ...failure,
              url: before?.url || "",
              error: failure.error || t("errors.generic"),
            });
          });
          updated = successes.length;
          failed = failureDetails.length;
          const replacements = new Map(
            result.items.map((item) => [item.id, item]),
          );
          setSnapshot((previous) => ({
            ...previous,
            items: previous.items.map(
              (item) => replacements.get(item.id) || item,
            ),
          }));
        } catch (e) {
          lastError = e;
          const failedIds =
            e.status === 401 || e.status === 403 ? ids.slice(offset) : chunk;
          failedIds.forEach((id) => {
            const before = beforeById.get(id);
            failureDetails.push({
              id,
              name: before?.name || `#${id}`,
              url: before?.url || "",
              code: e.code || "ITEM_BULK_METADATA_FAILED",
              error: errorMessage(e),
            });
          });
          failed = failureDetails.length;
          if (e.status === 401 || e.status === 403) {
            processed = ids.length;
            setRecognitionProgress({
              processed,
              total: ids.length,
              updated,
              failed,
            });
            break;
          }
        }
        processed += chunk.length;
        setRecognitionProgress({
          processed,
          total: ids.length,
          updated,
          failed,
        });
      }
      const detail = {
        total: ids.length,
        successes,
        failures: failureDetails,
        finishedAt: Date.now(),
      };
      setRecognitionResult(detail);
      setShowRecognitionResult(true);
      toastMessage(
        t("batch.identified", {
          updated,
          failed,
        }),
      );
      if (!updated && lastError) setError(errorMessage(lastError));
      await load().catch((e) => setError(errorMessage(e)));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRecognizing(false);
      setRecognitionProgress(null);
    }
  }
  async function deleteSelectedItems() {
    const ids = [...selectedIds];
    if (!canManage || !ids.length || moving || deleting || recognizing) return;
    if (!confirm(t("batch.confirmDelete", { count: ids.length }))) return;
    setDeleting(true);
    setError("");
    try {
      const result = await api.bulkDeleteItems(space, ids);
      setSelectedIds(new Set());
      setBatchCategory("");
      toastMessage(t("batch.deleted", { count: result.deletedCount }));
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  }
  function dropItems(event, categoryId) {
    let ids = [];
    try {
      ids = JSON.parse(
        event.dataTransfer.getData("application/x-navpilot-item-ids") || "[]",
      );
    } catch {
      /* invalid drag payload */
    }
    const visibleIds = new Set(items.map((item) => item.id));
    moveItems(
      ids.map(Number).filter((id) => visibleIds.has(id)),
      categoryId,
    );
  }
  async function checkAll() {
    if (!canManage || checkingAll) return;
    setCheckingAll(true);
    try {
      await api.checkAll(space);
      toastMessage(t("toast.checkingAll"));
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCheckingAll(false);
    }
  }
  async function requestDelete(category) {
    if (!canManage) return;
    try {
      setDeleteImpact(await api.getCategoryImpact(category.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function confirmDelete() {
    if (!canManage || !deleteImpact) return;
    await api.deleteCategory(deleteImpact.category.id, {
      expectedVersion: deleteImpact.category.version,
      impactHash: deleteImpact.impactHash,
      confirmSubtree: true,
    });
    setDeleteImpact(null);
    setActiveCategory("all");
    await load();
  }
  function categoryLabel(key) {
    if (key === "uncategorized")
      return { name: t("category.uncategorized"), icon: "📎" };
    return (
      categories.find((category) => category.id === key) || {
        name: t("category.uncategorized"),
        icon: "📎",
      }
    );
  }
  const renderItems = (list) => (
    <div
      className={
        viewMode === "compact"
          ? "compact-list"
          : viewMode === "dense"
            ? "dense-grid"
            : "grid"
      }
    >
      {list.map((item, index) => (
        <NavCard
          key={item.id}
          item={item}
          viewMode={viewMode}
          checking={checking.has(item.id)}
          canManage={canManage && !recognizing}
          selected={selectedIds.has(item.id)}
          onToggleSelect={() => toggleSelected(item.id)}
          onDragStart={(event) => startDrag(event, item)}
          onClick={() =>
            api
              .clickItem(item.id, {
                surface: `portal-${viewMode}`,
                viewMode,
                position: index + 1,
                eventId: `${Date.now()}-${item.id}-${Math.random().toString(36).slice(2)}`,
              })
              .catch(() => {})
          }
          onEdit={() => setEditingItem(item)}
          onDelete={() => deleteItem(item)}
          onRecheck={() => recheck(item)}
        />
      ))}
    </div>
  );
  function suggestCreate(url) {
    let name = query.trim();
    try {
      name = new URL(url).host;
    } catch {
      /* keep query */
    }
    if (canManage) {
      setEditingItem({ name, url });
      return;
    }
    if (!auth.authenticated) {
      auth.setLoginOpen(true);
      return;
    }
    const targetScope =
      space === "public" && auth.isAdmin ? "public" : "personal";
    setAssistantRequest({
      id: Date.now(),
      scope: targetScope,
      text: localeText(targetScope, name, url),
    });
  }
  function localeText(targetScope, name, url) {
    return t("searchSuggestion.prompt", {
      space: t(targetScope === "public" ? "space.public" : "space.personal"),
      name,
      url,
    });
  }
  if (!spaceReady)
    return (
      <div className="app workspace-loading">
        <header className="topbar">
          <div className="brand">
            <Brand branding={branding} />
          </div>
          <div className="topbar-actions">
            <LocaleSwitcher />
            <ThemeSwitcher theme={theme} onChange={onThemeChange} />
          </div>
        </header>
        <div className="empty-state">{t("app.loading")}</div>
      </div>
    );
  const allVisibleSelected =
    filtered.length > 0 && filtered.every((item) => selectedIds.has(item.id));
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Brand branding={branding} />
        </div>
        <div className="search-box">
          <Icon name="search" size={17} />
          <input
            placeholder={t("app.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="topbar-actions">
          {isPersonalOwner && (
            <button
              className="icon-btn"
              disabled={recognizing}
              onClick={() => {
                setPersonalToolsTab("inbox");
                setShowPersonalTools(true);
              }}
            >
              <Icon name="folder" size={16} />
              {auth.user?.preferences?.locale === "en"
                ? "My Space tools"
                : "个人空间工具"}
            </button>
          )}
          {canManage && (
            <>
              <button className="icon-btn" disabled={recognizing} onClick={() => setEditingItem({})}>
                <Icon name="plus" size={16} />
                {t("nav.add")}
              </button>
              {space === "public" && (
                <button
                  className="icon-btn"
                  disabled={recognizing}
                  onClick={() => setShowPublicAi(true)}
                >
                  <Icon name="assistant" size={16} />
                  {t("nav.aiAdd")}
                </button>
              )}
              <button
                className="icon-btn"
                disabled={checkingAll || recognizing}
                onClick={checkAll}
              >
                <Icon name="refresh" size={16} />
                {t(checkingAll ? "category.checkingAll" : "nav.checkAll")}
              </button>
            </>
          )}
          <AccountMenu disabled={recognizing} />
          <LocaleSwitcher />
          <ThemeSwitcher theme={theme} onChange={onThemeChange} />
        </div>
      </header>
      <SpaceSwitcher
        space={space}
        onChange={switchSpace}
        userName={auth.user?.displayName}
        canEditPublic={canEditPublic}
        publicEditMode={publicEditMode}
        onEnterPublicEdit={() => setPublicEditMode(true)}
        onExitPublicEdit={exitEditModes}
        isPersonalOwner={isPersonalOwner}
        personalEditMode={personalEditMode}
        onEnterPersonalEdit={() => setPersonalEditMode(true)}
        onExitPersonalEdit={exitEditModes}
        locked={recognizing}
        lockLabel={t("batch.recognitionLocked")}
      />
      <div className={`content-toolbar ${canManage ? "editing" : ""}`}>
        {canManage ? (
          <BatchMoveBar
            selectedCount={selectedIds.size}
            visibleCount={filtered.length}
            allVisibleSelected={allVisibleSelected}
            categories={categories}
            target={batchCategory}
            onTarget={setBatchCategory}
            onToggleAll={toggleVisible}
            onClear={() => setSelectedIds(new Set())}
            moving={moving}
            deleting={deleting}
            recognizing={recognizing}
            recognitionProgress={recognitionProgress}
            hasRecognitionResult={Boolean(recognitionResult)}
            onShowRecognitionResult={() => setShowRecognitionResult(true)}
            onShare={
              space === "personal"
                ? () => {
                    setPersonalToolsTab("share");
                    setShowPersonalTools(true);
                  }
                : null
            }
            onMove={() =>
              moveItems(
                [...selectedIds],
                batchCategory === "uncategorized"
                  ? null
                  : Number(batchCategory),
              )
            }
            onDelete={deleteSelectedItems}
            onRecognize={recognizeSelectedItems}
          />
        ) : (
          <span>{t("app.total", { count: items.length })}</span>
        )}
        <ViewModeSwitcher value={viewMode} onChange={setViewMode} />
      </div>
      {allTags.length > 0 && (
        <div className="tag-filter-bar">
          <span>
            <Icon name="tag" size={14} />
            {auth.user?.preferences?.locale === "en" ? "Tags" : "标签"}
          </span>
          <button
            className={!activeTag ? "active" : ""}
            onClick={() => setActiveTag("")}
          >
            {auth.user?.preferences?.locale === "en" ? "All" : "全部"}
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              className={activeTag === tag ? "active" : ""}
              onClick={() => setActiveTag(tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}
      {error && <div className="error-text portal-error">{error}</div>}
      <div className="main-layout">
        <CategoryNav
          categories={categories}
          counts={counts}
          active={activeCategory}
          onSelect={setActiveCategory}
          manageable={canManage && !recognizing}
          onCreate={createCategory}
          onRename={renameCategory}
          onDelete={requestDelete}
          onDropItems={dropItems}
          selectionStates={canManage ? categorySelections : null}
          onToggleSelection={canManage ? toggleCategorySelection : null}
          selectionDisabled={moving || deleting || recognizing}
        />
        <main className="content">
          {!ready ? (
            <div className="empty-state">{t("app.loading")}</div>
          ) : !filtered.length ? (
            query ? (
              <SearchCreateSuggestion
                query={query}
                url={possibleURL(query)}
                onCreate={suggestCreate}
              />
            ) : (
              <div className="empty-state">
                {t(
                  space === "personal"
                    ? personalEditMode
                      ? "app.personalEmpty"
                      : "app.personalViewEmpty"
                    : "app.publicEmpty",
                )}
              </div>
            )
          ) : activeCategory !== "all" ? (
            renderItems(filtered)
          ) : (
            [...grouped.entries()].map(([key, list]) => {
              const label = categoryLabel(key);
              return (
                <section className="category-section" key={key}>
                  <h2 className="category-heading">
                    <ContentIcon value={label.icon} size={18} />
                    <span className="eyebrow">{label.name}</span>
                    <span className="sub">
                      {t("app.itemsCount", { count: list.length })}
                    </span>
                  </h2>
                  {renderItems(list)}
                </section>
              );
            })
          )}
        </main>
      </div>
      {editingItem !== null && (
        <ItemFormModal
          item={editingItem}
          categories={categories}
          scope={space}
          onClose={() => setEditingItem(null)}
          onSubmit={saveItem}
          onDelete={() => deleteItem(editingItem)}
        />
      )}{" "}
      {deleteImpact && (
        <DeleteCategoryDialog
          impact={deleteImpact}
          onCancel={() => setDeleteImpact(null)}
          onConfirm={confirmDelete}
        />
      )}{" "}
      {showPublicAi && (
        <AiAddModal
          onClose={() => setShowPublicAi(false)}
          onCreated={async () => {
            setShowPublicAi(false);
            toastMessage(t("toast.saved"));
            await load();
          }}
        />
      )}
      {showPersonalTools && (
        <PersonalToolsModal
          categories={categories}
          selectedIds={[...selectedIds]}
          activeCategory={activeCategory}
          initialTab={personalToolsTab}
          onClose={() => setShowPersonalTools(false)}
          onChanged={async () => {
            toastMessage(t("toast.saved"));
            await load();
          }}
        />
      )}
      {showRecognitionResult && recognitionResult && (
        <RecognitionResultDialog
          result={recognitionResult}
          onClose={() => setShowRecognitionResult(false)}
        />
      )}
      <AiAssistantWidget
        aiPersonalEnabled={Boolean(publicSettings.ai_personal_enabled)}
        activeSpace={space}
        launchRequest={assistantRequest}
        onResourcesChanged={async (changedScope) => {
          toastMessage(t("toast.saved"));
          if (space === changedScope) await load();
        }}
      />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default function App() {
  const auth = useAuth();
  const { setLocale } = useI18n();
  const [theme, setTheme] = useState(
    () => localStorage.getItem("navpilot_theme") || "dark",
  );
  const [publicSettings, setPublicSettings] = useState({
    ai_personal_enabled: false,
    branding: { siteName: "NavPilot", logoUrl: "", faviconUrl: "" },
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("navpilot_theme", theme);
  }, [theme]);
  useEffect(() => {
    const preferences = auth.user?.preferences;
    if (!preferences) return;
    if (preferences.theme) setTheme(preferences.theme);
    if (preferences.locale) setLocale(preferences.locale);
    if (preferences.viewMode)
      localStorage.setItem("navpilot_view_mode_v1", preferences.viewMode);
    if (preferences.defaultSpace)
      localStorage.setItem(
        `navpilot_space_v1:${auth.user.id}`,
        preferences.defaultSpace,
      );
  }, [
    auth.user?.id,
    auth.user?.preferences?.theme,
    auth.user?.preferences?.locale,
    auth.user?.preferences?.viewMode,
    auth.user?.preferences?.defaultSpace,
    setLocale,
  ]);
  useEffect(() => {
    api
      .getPublicSettings()
      .then(setPublicSettings)
      .catch(() => {});
  }, []);
  useEffect(() => {
    const branding = publicSettings.branding || {};
    document.title = branding.siteName || "NavPilot";
    const icon = document.querySelector('link[rel="icon"]');
    if (icon)
      icon.href = branding.faviconUrl || branding.logoUrl || defaultFavicon;
  }, [publicSettings.branding]);
  const admin = location.pathname.startsWith("/admin");
  const branding = publicSettings.branding || {
    siteName: "NavPilot",
    logoUrl: "",
    faviconUrl: "",
  };
  return (
    <>
      {admin ? (
        <AdminWorkspace
          theme={theme}
          onThemeChange={setTheme}
          branding={branding}
          onBrandingChange={(next) =>
            setPublicSettings((current) => ({ ...current, branding: next }))
          }
        />
      ) : (
        <PortalWorkspace
          theme={theme}
          onThemeChange={setTheme}
          branding={branding}
          publicSettings={publicSettings}
        />
      )}
      <LoginDialog />
      <PasswordChangeDialog />
      <GlobalSearch />
    </>
  );
}
