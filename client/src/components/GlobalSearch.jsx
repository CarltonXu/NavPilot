import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { useI18n } from "../i18n/LocaleContext.jsx";
import { possibleURL } from "../utils/urlSuggestion.js";
import Icon, { ContentIcon } from "./Icon.jsx";

const copy = {
  "zh-CN": {
    title: "全局搜索",
    placeholder: "搜索公共空间、个人空间、分类或网址…",
    public: "公共空间",
    personal: "个人空间",
    empty: "没有找到相关资源",
    hint: "输入关键词开始搜索",
    searching: "正在搜索…",
    ai: "AI 建议",
    create: "创建这个网址",
    organize: "让 AI 帮我整理相关资源",
    refine: "尝试搜索更具体的关键词",
    pending: "执行前需要你确认",
    result: "个结果",
    shortcut: "⌘ / Ctrl K",
    uncategorized: "未分类",
  },
  en: {
    title: "Global search",
    placeholder: "Search spaces, folders or URLs…",
    public: "Public",
    personal: "Personal",
    empty: "No matching resources",
    hint: "Type to search",
    searching: "Searching…",
    ai: "AI suggestions",
    create: "Create this URL",
    organize: "Ask AI to organize related resources",
    refine: "Try a more specific search",
    pending: "Your confirmation is required",
    result: "results",
    shortcut: "⌘ / Ctrl K",
    uncategorized: "Uncategorized",
  },
};

export function openGlobalSearch(query = "") {
  window.dispatchEvent(new CustomEvent("navpilot:global-search", { detail: { query } }));
}

export default function GlobalSearch() {
  const auth = useAuth();
  const { locale, t } = useI18n();
  const c = copy[locale] || copy["zh-CN"];
  const inputRef = useRef(null),
    requestRef = useRef(0);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [results, setResults] = useState([]),
    [loading, setLoading] = useState(false),
    [active, setActive] = useState(0);

  useEffect(() => {
    function show(event) {
      if (typeof event.detail?.query === "string") setQuery(event.detail.query);
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
    function key(event) {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k" &&
        !event.isComposing
      ) {
        event.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      } else if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", key);
    window.addEventListener("navpilot:global-search", show);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("navpilot:global-search", show);
    };
  }, [open]);
  useEffect(() => {
    if (!open || !query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    const id = ++requestRef.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      api
        .searchItems(query.trim())
        .then((items) => {
          if (id === requestRef.current) {
            setResults(items);
            setActive(0);
          }
        })
        .catch(() => {
          if (id === requestRef.current) setResults([]);
        })
        .finally(() => {
          if (id === requestRef.current) setLoading(false);
        });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  const url = useMemo(() => possibleURL(query), [query]);
  function openResult(item, index) {
    api
      .clickItem(item.id, {
        surface: "global-search",
        viewMode: "command",
        position: index + 1,
        searchEventId: item.searchEventId,
        eventId: `${Date.now()}-${item.id}-${Math.random().toString(36).slice(2)}`,
      })
      .catch(() => {});
    window.open(item.url, "_blank", "noopener,noreferrer");
    setOpen(false);
  }
  function askAssistant(kind) {
    if (!auth.authenticated) {
      setOpen(false);
      auth.setLoginOpen(true);
      return;
    }
    let text;
    if (kind === "create") {
      let name = query.trim();
      try {
        name = new URL(url).host;
      } catch {
        /* keep query */
      }
      text = t("searchSuggestion.prompt", {
        space: t("space.personal"),
        name,
        url,
      });
    } else
      text =
        locale === "en"
          ? `Review resources related to "${query.trim()}" and suggest a clearer category structure. Do not execute before I confirm.`
          : `检查与“${query.trim()}”相关的资源，建议更清晰的分类整理方案，在我确认前不要执行。`;
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent("navpilot:assistant-request", {
        detail: { scope: "personal", text },
      }),
    );
  }
  function onKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => Math.min(results.length - 1, value + 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => Math.max(0, value - 1));
    }
    if (event.key === "Enter" && results[active]) {
      event.preventDefault();
      openResult(results[active], active);
    }
  }
  if (!open) return null;
  return (
    <div
      className="global-search-backdrop"
      onMouseDown={(event) =>
        event.target === event.currentTarget && setOpen(false)
      }
    >
      <section
        className="global-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={c.title}
      >
        <header>
          <Icon name="search" size={21} />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={c.placeholder}
          />
          <kbd>ESC</kbd>
        </header>
        <div className="global-search-content">
          <div className="global-search-results">
            <div className="global-search-section-label">
              <span>{c.title}</span>
              {query && !loading && (
                <small>
                  {results.length} {c.result}
                </small>
              )}
            </div>
            {!query && (
              <div className="global-search-empty">
                <Icon name="search" size={30} />
                <span>{c.hint}</span>
                <kbd>{c.shortcut}</kbd>
              </div>
            )}
            {loading && (
              <div className="global-search-empty">{c.searching}</div>
            )}
            {!loading && query && !results.length && (
              <div className="global-search-empty">
                <Icon name="search" size={26} />
                <span>{c.empty}</span>
              </div>
            )}
            {!loading &&
              results.map((item, index) => (
                <button
                  key={`${item.scope}-${item.id}`}
                  className={active === index ? "active" : ""}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => openResult(item, index)}
                >
                  <span className="global-result-icon">
                    <ContentIcon value={item.icon} size={20} />
                  </span>
                  <span className="global-result-copy">
                    <strong title={item.name}>{item.name}</strong>
                    <span
                      className="global-result-path"
                      title={item.categoryPath || item.categoryName || c.uncategorized}
                    >
                      <Icon name="folder" size={12} />
                      <span>
                        {item.categoryPath || item.categoryName || c.uncategorized}
                      </span>
                    </span>
                    <em className="global-result-url" title={item.url}>
                      {item.url}
                    </em>
                  </span>
                  <i className={`scope-chip ${item.scope}`}>
                    {item.scope === "personal" ? c.personal : c.public}
                  </i>
                  <Icon name="chevronRight" size={14} />
                </button>
              ))}
          </div>
          {query && (
            <aside className="global-ai-suggestions">
              <div className="global-search-section-label">
                <span>
                  <Icon name="assistant" size={14} />
                  {c.ai}
                </span>
              </div>
              {url && (
                <button onClick={() => askAssistant("create")}>
                  <span>
                    <Icon name="plus" size={15} />
                  </span>
                  <div>
                    <strong>{c.create}</strong>
                    <small>{c.pending}</small>
                  </div>
                  <Icon name="chevronRight" size={14} />
                </button>
              )}
              <button onClick={() => askAssistant("organize")}>
                <span>
                  <Icon name="assistant" size={15} />
                </span>
                <div>
                  <strong>{results.length ? c.organize : c.refine}</strong>
                  <small>{c.pending}</small>
                </div>
                <Icon name="chevronRight" size={14} />
              </button>
            </aside>
          )}
        </div>
        <footer>
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {locale === "en" ? "Navigate" : "选择"}
          </span>
          <span>
            <kbd>Enter</kbd> {locale === "en" ? "Open" : "打开"}
          </span>
        </footer>
      </section>
    </div>
  );
}
