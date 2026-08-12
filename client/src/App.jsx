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
import GlobalSearch, { openGlobalSearch } from "./components/GlobalSearch.jsx";
import DropdownMenu from "./components/DropdownMenu.jsx";
import RecognitionResultDialog from "./components/RecognitionResultDialog.jsx";
import ResourceOverview from "./components/ResourceOverview.jsx";
import { browserPreference } from "./utils/browserPreference.js";
import AiWorkspace,{launchAiWorkspace}from"./components/AiWorkspace.jsx";
import PublicInsights from"./components/PublicInsights.jsx";

const validView = (value) => {
  const migrated = ["dense", "board"].includes(value) ? "overview" : value;
  return ["card", "compact", "overview"].includes(migrated) ? migrated : "card";
};
const defaultFavicon = document.querySelector('link[rel="icon"]')?.href || "";
const FAVORITES_FILTER = "__navpilot_favorites__";

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
  onAi,
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
          {onAi&&<button className="icon-btn" disabled={deleting||recognizing} onClick={onAi}><Icon name="assistant" size={14}/>{locale==='en'?'Ask AI':'交给 AI'}</button>}
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
  const { t, errorMessage, locale } = useI18n();
  const generation = useRef(0);
  const favoriteDefaultKey = useRef(null);
  const tagTrackRef = useRef(null);
  const identityKey = auth.loading
    ? null
    : auth.user
      ? `user:${auth.user.id}`
      : "anonymous";
  const [selection, setSelection] = useState({
    identityKey: null,
    space: null,
  });
  const initialPortalFilter=useRef(()=>{const params=new URLSearchParams(location.search);return{category:params.get('category'),tag:params.get('tag')}});
  const [snapshot, setSnapshot] = useState({
    key: null,
    status: "idle",
    categories: [],
    items: [],
  });
  const [viewMode, setViewMode] = useState(() => {
      const cached = localStorage.getItem("navpilot_view_mode_v1");
      return cached === null ? null : validView(cached);
    }),
    [activeCategory, setActiveCategory] = useState("all"),
    [activeTag, setActiveTag] = useState(""),
    [query, setQuery] = useState(""),
    [publicEditMode, setPublicEditMode] = useState(false),
    [personalEditMode, setPersonalEditMode] = useState(false),
    [editingItem, setEditingItem] = useState(null),
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
    [favoriteBusy, setFavoriteBusy] = useState(new Set()),
    [tagsOverflowing, setTagsOverflowing] = useState(false),
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
        context: event.detail?.context || null,
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
    setChecking(new Set());
    setDeleteImpact(null);
    setSelectedIds(new Set());
    setBatchCategory("");
    setRecognitionResult(null);
    setShowRecognitionResult(false);
    setFavoriteBusy(new Set());
    favoriteDefaultKey.current = null;
    const preferred =
        browserPreference(
          localStorage.getItem(`navpilot_space_v1:${auth.user?.id}`),
          auth.user?.preferences?.defaultSpace,
          "public",
        ),
      nextSpace =
        identityKey === "anonymous"
          ? "public"
          : preferred === "personal"
            ? "personal"
            : "public";
    const cachedView = localStorage.getItem("navpilot_view_mode_v1");
    setViewMode(
      validView(
        browserPreference(
          cachedView,
          auth.user?.preferences?.viewMode,
          "card",
        ),
      ),
    );
    setSelection({ identityKey, space: nextSpace });
  }, [identityKey, auth.user?.id]);
  useEffect(() => {
    const apply = (event) => {
      if (
        event.detail?.viewMode &&
        localStorage.getItem("navpilot_view_mode_v1") === null
      )
        setViewMode(validView(event.detail.viewMode));
      const spaceKey = auth.user?.id
        ? `navpilot_space_v1:${auth.user.id}`
        : null;
      if (
        spaceKey &&
        event.detail?.defaultSpace &&
        localStorage.getItem(spaceKey) === null
      ) {
        const nextSpace =
          event.detail.defaultSpace === "personal" ? "personal" : "public";
        exitEditModes();
        generation.current += 1;
        setSelection({ identityKey, space: nextSpace });
        setSnapshot({ key: null, status: "idle", categories: [], items: [] });
        setActiveCategory("all");
        setActiveTag("");
        setQuery("");
      }
    };
    window.addEventListener("navpilot:preferences-updated", apply);
    return () => window.removeEventListener("navpilot:preferences-updated", apply);
  }, [auth.user?.id, identityKey]);
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
  const favoriteItems = useMemo(() => items.filter(item=>item.is_favorite).sort((a,b)=>Number(b.favorite_at_ms||0)-Number(a.favorite_at_ms||0)),[items]);
  useEffect(() => {
    if (!ready || !expectedKey || favoriteDefaultKey.current === expectedKey) return;
    favoriteDefaultKey.current = expectedKey;
    setActiveTag(items.some((item) => item.is_favorite) ? FAVORITES_FILTER : "");
  }, [ready, expectedKey, items]);
  useEffect(()=>{
    if(!ready)return;
    const filter=initialPortalFilter.current();
    if(filter.category&&categories.some(category=>category.id===Number(filter.category)))setActiveCategory(Number(filter.category));
    if(filter.tag)setActiveTag(filter.tag);
    if(filter.category||filter.tag){history.replaceState(null,'','/');initialPortalFilter.current=()=>({category:null,tag:null});}
  },[ready,categories]);
  useEffect(() => {
    if (
      ready &&
      activeTag === FAVORITES_FILTER &&
      !items.some((item) => item.is_favorite)
    )
      setActiveTag("");
  }, [ready, activeTag, items]);
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
  useEffect(() => {
    const track = tagTrackRef.current;
    if (!track) {
      setTagsOverflowing(false);
      return;
    }
    const measure = () =>
      setTagsOverflowing(track.scrollWidth > track.clientWidth + 2);
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(track);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [allTags, favoriteItems.length]);
  const filtered = useMemo(
    () =>
      filterByCategory(items, categories, activeCategory).filter((item) => {
        const tags = Array.isArray(item.tags) ? item.tags : [];
        const tagMatch = activeTag === FAVORITES_FILTER
          ? Boolean(item.is_favorite)
          : !activeTag ||
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
  const canUseSpaceTools = isPersonalOwner || canEditPublic;
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
    if (auth.user?.id)
      localStorage.setItem(`navpilot_space_v1:${auth.user.id}`, next);
    setSelection({ identityKey, space: next });
    setSnapshot({ key: null, status: "idle", categories: [], items: [] });
    favoriteDefaultKey.current = null;
    setActiveCategory("all");
    setActiveTag("");
    setQuery("");
  }
  function changeViewMode(next) {
    const normalized = validView(next);
    localStorage.setItem("navpilot_view_mode_v1", normalized);
    setViewMode(normalized);
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
    setChecking(new Set(items.map((item) => item.id)));
    try {
      const result = await api.checkAll(space);
      toastMessage(t("toast.checkCompleted", result));
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCheckingAll(false);
      setChecking(new Set());
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
  async function toggleFavorite(item) {
    if (!auth.authenticated) {
      auth.setLoginOpen(true);
      return;
    }
    if (favoriteBusy.has(item.id)) return;
    const next=!item.is_favorite,previousAt=item.favorite_at_ms||null;
    setFavoriteBusy(current=>new Set(current).add(item.id));
    setSnapshot(previous=>({...previous,items:previous.items.map(value=>value.id===item.id?{...value,is_favorite:next,favorite_at_ms:next?Date.now():null}:value)}));
    try {
      const result=await api.setItemFavorite(item.id,next);
      setSnapshot(previous=>({...previous,items:previous.items.map(value=>value.id===item.id?{...value,is_favorite:result.favorite,favorite_at_ms:result.favoriteAtMs}:value)}));
    } catch (error) {
      setSnapshot(previous=>({...previous,items:previous.items.map(value=>value.id===item.id?{...value,is_favorite:item.is_favorite,favorite_at_ms:previousAt}:value)}));
      setError(errorMessage(error));
    } finally {
      setFavoriteBusy(current=>{const value=new Set(current);value.delete(item.id);return value;});
    }
  }
  const renderItems = (list) => (
    <div
      className={
        viewMode === "compact"
          ? "compact-list"
          : viewMode === "overview"
            ? "overview-resource-list"
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
          canFavorite
          favoriteBusy={favoriteBusy.has(item.id)}
          onToggleFavorite={() => toggleFavorite(item)}
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
      setEditingItem({
        name,
        url,
        category_id: typeof activeCategory === "number" ? activeCategory : null,
      });
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
      context: assistantContext,
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
  const assistantContext = (() => {
    const category = categories.find((item) => item.id === activeCategory);
    const selected = items.filter((item) => selectedIds.has(item.id)).slice(0, 30);
    const spaceName = locale === "en" ? (space === "public" ? "Public Space" : "My Space") : (space === "public" ? "公共空间" : "个人空间");
    const categoryName = category?.path_label || category?.name || "";
    const label = [spaceName, categoryName && (locale === "en" ? `Category: ${categoryName}` : `分类：${categoryName}`), selected.length && (locale === "en" ? `${selectedIds.size} selected` : `已选 ${selectedIds.size} 项`)].filter(Boolean).join(" · ");
    const details = [locale === "en" ? `Current space: ${spaceName}.` : `当前空间：${spaceName}。`];
    if (categoryName) details.push(locale === "en" ? `Current category: ${categoryName}.` : `当前分类：${categoryName}。`);
    if (selected.length) details.push(locale === "en" ? `Selected resources: ${selected.map((item) => item.name).join(", ")}.` : `当前选中资源：${selected.map((item) => item.name).join("、")}。`);
    details.push(locale === "en" ? "Use this context only when the user refers to the current category or selected resources." : "仅当用户提到当前分类或选中资源时使用以上上下文，不要擅自缩小其他指令的范围。");
    return { label, text:details.join(" ") };
  })();
  const spaceActions = <>
    {space==='public'&&publicSettings.publicInsights?.enabled&&(publicSettings.publicInsights.anonymousEnabled||auth.authenticated)&&<button className="icon-btn public-insights-entry" onClick={()=>{location.href='/insights/public'}}><Icon name="insights" size={16}/>{locale==='en'?'Space insights':'空间洞察'}</button>}
    {auth.authenticated&&!auth.user?.mustChangePassword&&<button className="icon-btn ai-assistant-entry" title={locale==='en'?'Open AI Assistant · Ctrl/⌘ J':'打开 AI 助手 · Ctrl/⌘ J'} onClick={()=>setAssistantRequest({id:Date.now(),scope:space,text:'',context:assistantContext})}><Icon name="assistant" size={16}/>{locale==='en'?'AI Assistant':'AI 助手'}</button>}
    {auth.isAdmin&&<button className="icon-btn ai-workspace-entry" onClick={()=>{const category=categories.find(item=>item.id===activeCategory);launchAiWorkspace({scope:space,text:category?(locale==='en'?`Analyze the current category “${category.path_label||category.name}” and suggest improvements before creating any plan.`:`请先分析当前分类「${category.path_label||category.name}」的结构和资源，给出优化建议，暂时不要执行修改。`):''});}}><Icon name="grid" size={16}/>{locale==='en'?'AI Workspace':'AI 工作台'}</button>}
    {canUseSpaceTools&&<button className="icon-btn" disabled={recognizing} onClick={()=>{setPersonalToolsTab("inbox");setShowPersonalTools(true);}}><Icon name="folder" size={16}/>{locale==='en'?'Space tools':'空间工具'}</button>}
    {canManage&&<><button className="icon-btn" disabled={recognizing} onClick={()=>setEditingItem({category_id:typeof activeCategory==="number"?activeCategory:null})}><Icon name="plus" size={16}/>{t("nav.add")}</button><button className="icon-btn" disabled={checkingAll||recognizing} onClick={checkAll}><Icon name="refresh" size={16}/>{t(checkingAll?"category.checkingAll":"nav.checkAll")}</button></>}
  </>;
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Brand branding={branding} />
        </div>
        <button
          type="button"
          className="topbar-search-trigger"
          onClick={() => openGlobalSearch(query)}
          aria-label={locale === "en" ? "Open global search" : "打开全局搜索"}
        >
          <Icon name="search" size={17} />
          <span>{locale === "en" ? "Search all resources…" : "搜索全部资源…"}</span>
          <kbd>{navigator.platform?.includes("Mac") ? "⌘ K" : "Ctrl K"}</kbd>
        </button>
        <div className="topbar-actions">
          <LocaleSwitcher />
          <ThemeSwitcher theme={theme} onChange={onThemeChange} />
          <AccountMenu disabled={recognizing} />
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
        actions={spaceActions}
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
            onShare={() => {
              setPersonalToolsTab("share");
              setShowPersonalTools(true);
            }}
            onAi={()=>{const names=items.filter(item=>selectedIds.has(item.id)).slice(0,30).map(item=>`「${item.name}」`).join('、');setAssistantRequest({id:Date.now(),scope:space,text:locale==='en'?`Analyze these selected resources and prepare an approval plan to categorize, tag, or improve them: ${names}`:`请分析我选中的这些资源，并生成分类、打标签或完善信息的待授权方案：${names}`,context:assistantContext});}}
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
        <ViewModeSwitcher value={viewMode} onChange={changeViewMode} />
      </div>
      {(allTags.length > 0 || favoriteItems.length > 0) && (
        <div className="tag-filter-bar">
          <span className="tag-filter-label">
            <Icon name="tag" size={14} />
            {locale === "en" ? "Tags" : "标签"}
          </span>
          <div
            className="tag-filter-track"
            ref={tagTrackRef}
            onWheel={(event) => {
              const track = event.currentTarget;
              if (
                track.scrollWidth > track.clientWidth &&
                Math.abs(event.deltaY) > Math.abs(event.deltaX)
              ) {
                track.scrollLeft += event.deltaY;
                event.preventDefault();
              }
            }}
          >
            <button
              className={!activeTag ? "active" : ""}
              onClick={() => setActiveTag("")}
            >
              {locale === "en" ? "All" : "全部"}
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
          {tagsOverflowing && (
            <DropdownMenu
              className="tag-overflow-menu"
              menuClassName="tag-overflow-panel"
              trigger={
                <button
                  className="tag-overflow-trigger"
                  aria-label={locale === "en" ? "Show all tags" : "展开全部标签"}
                  title={locale === "en" ? "Show all tags" : "展开全部标签"}
                >
                  <Icon name="chevronDown" size={14} />
                </button>
              }
            >
              <header>
                <strong>{locale === "en" ? "All tags" : "全部标签"}</strong>
                <small>{allTags.length}</small>
              </header>
              <div className="tag-overflow-options">
                <button
                  role="menuitem"
                  className={!activeTag ? "active" : ""}
                  onClick={() => setActiveTag("")}
                >
                  {locale === "en" ? "All" : "全部"}
                </button>
                {allTags.map((tag) => (
                  <button
                    role="menuitem"
                    key={tag}
                    className={activeTag === tag ? "active" : ""}
                    onClick={() => setActiveTag(tag)}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </DropdownMenu>
          )}
          {favoriteItems.length > 0 && <button
            className={`tag-filter-favorite ${activeTag === FAVORITES_FILTER ? "active" : ""}`}
            onClick={() => setActiveTag(FAVORITES_FILTER)}
          >
            <Icon name="star" size={13}/>
            {locale === "en" ? "Favorites" : "我的收藏"}
            <strong>{favoriteItems.length}</strong>
          </button>}
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
          ) : viewMode === "overview" ? (
            <ResourceOverview
              items={filtered}
              renderItems={renderItems}
              onTagSelect={setActiveTag}
            />
          ) : activeCategory !== "all" ? (
            renderItems(filtered)
          ) : (
            <div>
              {[...grouped.entries()].map(([key, list]) => {
                const label = categoryLabel(key);
                return (
                  <section className="category-section" key={key}>
                    <h2 className="category-heading">
                      <ContentIcon value={label.icon} size={18} />
                      <span className="eyebrow">{label.name}</span>
                      <span className="sub">{t("app.itemsCount", { count: list.length })}</span>
                    </h2>
                    {renderItems(list)}
                  </section>
                );
              })}
            </div>
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
      {showPersonalTools && (
        <PersonalToolsModal
          scope={space}
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
        activeContext={assistantContext}
        launchRequest={assistantRequest}
        onChanged={load}
      />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default function App() {
  const auth = useAuth();
  const { setDefaultLocale } = useI18n();
  const [theme, setTheme] = useState(
    () => browserPreference(localStorage.getItem("navpilot_theme"), null, "dark"),
  );
  const changeTheme = useCallback((next) => {
    localStorage.setItem("navpilot_theme", next);
    setTheme(next);
  }, []);
  const [publicSettings, setPublicSettings] = useState(() =>
    window.__NAVPILOT_BOOTSTRAP__ || {
      ai_personal_enabled: false,
      branding: { siteName: "NavPilot", logoUrl: "", faviconUrl: "" },
      publicInsights:{enabled:true,anonymousEnabled:false,searchMinCount:3},
    },
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const preferences = auth.user?.preferences;
    if (!preferences) return;
    if (localStorage.getItem("navpilot_theme") === null && preferences.theme) {
      setTheme(preferences.theme);
    }
    if (preferences.locale) setDefaultLocale(preferences.locale);
  }, [
    auth.user?.id,
    auth.user?.preferences?.theme,
    auth.user?.preferences?.locale,
    setDefaultLocale,
  ]);
  useEffect(() => {
    const apply = (event) => {
      if (
        event.detail?.theme &&
        localStorage.getItem("navpilot_theme") === null
      )
        setTheme(event.detail.theme);
    };
    window.addEventListener("navpilot:preferences-updated", apply);
    return () => window.removeEventListener("navpilot:preferences-updated", apply);
  }, []);
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
  const admin = location.pathname.startsWith("/admin"),aiWorkspace=location.pathname.startsWith('/ai'),publicInsights=location.pathname.startsWith('/insights/public');
  const branding = publicSettings.branding || {
    siteName: "NavPilot",
    logoUrl: "",
    faviconUrl: "",
  };
  const canAccessWorkspace = !auth.authenticated || auth.isAdmin;
  return (
    <>
      {admin ? (
        <AdminWorkspace
          theme={theme}
          onThemeChange={changeTheme}
          branding={branding}
          onBrandingChange={(next) =>
            setPublicSettings((current) => ({ ...current, branding: next }))
          }
          publicInsights={publicSettings.publicInsights}
          onPublicInsightsChange={(next)=>setPublicSettings(current=>({...current,publicInsights:next}))}
        />
      ) : publicInsights ? <PublicInsights theme={theme} onThemeChange={changeTheme} branding={branding} settings={publicSettings.publicInsights}/> : aiWorkspace ? (canAccessWorkspace?<AiWorkspace theme={theme} onThemeChange={changeTheme} branding={branding} aiPersonalEnabled={Boolean(publicSettings.ai_personal_enabled)}/>:<div className="workspace-access-denied"><Icon name="shield" size={34}/><h2>AI 工作台仅限管理员</h2><p>普通用户请返回主页面，通过顶部“AI 助手”或 Ctrl/⌘ + J 使用快捷指令。</p><button className="icon-btn primary" onClick={()=>{location.href='/'}}>返回主页面</button></div>) : (
        <PortalWorkspace
          theme={theme}
          onThemeChange={changeTheme}
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
