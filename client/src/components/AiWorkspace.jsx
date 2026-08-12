import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { useI18n } from "../i18n/LocaleContext.jsx";
import Icon from "./Icon.jsx";
import ThemeSwitcher from "./ThemeSwitcher.jsx";
import LocaleSwitcher from "./LocaleSwitcher.jsx";
import { AccountMenu } from "./AuthDialogs.jsx";
import AiCommandPanel from "./AiCommandPanel.jsx";
import AiInstructionPanel from "./AiInstructionPanel.jsx";
import AiRunUsage from "./AiRunUsage.jsx";

const LAUNCH_KEY = "navpilot_ai_workspace_launch_v1";
const copy = {
  "zh-CN": {
    title: "AI 工作台",
    subtitle: "讨论、分析并把确认后的结论转成安全的执行方案",
    back: "返回导航",
    chat: "智能对话",
    newChat: "新建对话",
    history: "最近对话",
    emptyHistory: "还没有对话",
    public: "公共空间",
    personal: "个人空间",
    scope: "当前工作空间",
    discuss: "发送讨论",
    discussing: "AI 正在分析…",
    placeholder: "描述你想分析、整理或创建的内容。讨论阶段不会修改资源。",
    plan: "转成执行方案",
    planEmpty: "讨论清楚后，再把结论转成分类、移动、标签或资源修改方案。",
    planTitle: "执行方案",
    planHint: "方案不会自动执行，需要你检查并明确授权。",
    login: "登录后使用 AI 工作台",
    loginDesc: "登录后可以保存讨论，并在授权后执行资源操作。",
    disabled: "个人空间 AI 尚未开启",
    disabledDesc: "管理员开启个人空间 AI 后即可讨论和生成方案。",
    publicReadOnly: "你可以讨论公共空间，但只有管理员可以生成和执行公共空间方案。",
    welcome: "你想让 AI 帮你做什么？",
    welcomeDesc: "AI 会结合当前空间的分类、标签、域名和相关资源提供建议。",
    starters: [
      "帮我评估当前分类结构并提出改进建议",
      "帮我规划一套公司内部导航分类体系",
      "分析当前资源的标签体系如何长期维护",
      "我想添加一批资源，先帮我梳理分类和信息",
    ],
    ready: "讨论结果已准备好，可以继续追问或转成执行方案。",
    discussionMode: "讨论模式",
    executionMode: "执行方案",
    commandMode: "指令模式",
    commandTitle: "直接执行",
    commandDesc: "自然语言查询、统计或生成待授权操作",
    newInstruction: "新建指令",
    instructionHistory: "最近指令",
    emptyInstructionHistory: "还没有指令记录",
    changed: "方案已执行，返回导航页面即可查看最新资源。",
    stop: "停止生成",
    stopped: "生成已停止",
  },
  en: {
    title: "AI Workspace",
    subtitle: "Discuss, analyze, and turn approved conclusions into safe actions",
    back: "Back to portal",
    chat: "Advisory chat",
    newChat: "New conversation",
    history: "Recent conversations",
    emptyHistory: "No conversations yet",
    public: "Public Space",
    personal: "My Space",
    scope: "Current workspace",
    discuss: "Send for discussion",
    discussing: "AI is analyzing…",
    placeholder: "Describe what you want to analyze, organize, or create. Discussion never changes resources.",
    plan: "Turn into plan",
    planEmpty: "Once the direction is clear, turn it into a category, move, tag, or resource plan.",
    planTitle: "Execution plan",
    planHint: "Plans never run automatically. Review and explicitly authorize them first.",
    login: "Sign in to use AI Workspace",
    loginDesc: "Sign in to save discussions and authorize resource operations.",
    disabled: "Personal-space AI is disabled",
    disabledDesc: "An administrator must enable personal-space AI before you can use it.",
    publicReadOnly: "You can discuss Public Space, but only administrators can create and execute public plans.",
    welcome: "What would you like AI to help with?",
    welcomeDesc: "AI uses the current taxonomy, tags, domains, and relevant resources as context.",
    starters: [
      "Assess the current taxonomy and suggest improvements",
      "Design a taxonomy for an internal company portal",
      "Help create a maintainable tagging system",
      "I want to add a group of resources; help organize them first",
    ],
    ready: "The discussion is ready for follow-up or conversion into a plan.",
    discussionMode: "Discussion",
    executionMode: "Execution plan",
    commandMode: "Command mode",
    commandTitle: "Direct commands",
    commandDesc: "Query, report, or create approval-ready actions",
    newInstruction: "New command",
    instructionHistory: "Recent commands",
    emptyInstructionHistory: "No command history yet",
    changed: "The plan was executed. Return to the portal to see the latest resources.",
    stop: "Stop",
    stopped: "Generation stopped",
  },
};

function readLaunch() {
  try {
    const value = JSON.parse(sessionStorage.getItem(LAUNCH_KEY) || "null");
    sessionStorage.removeItem(LAUNCH_KEY);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export function launchAiWorkspace({ scope = "personal", text = "" } = {}) {
  sessionStorage.setItem(
    LAUNCH_KEY,
    JSON.stringify({ scope, text, createdAt: Date.now() }),
  );
  location.href = "/ai";
}

export default function AiWorkspace({
  theme,
  onThemeChange,
  branding,
  aiPersonalEnabled = false,
}) {
  const auth = useAuth();
  const { locale, errorMessage } = useI18n();
  const c = copy[locale] || copy["zh-CN"];
  const launch = useRef(readLaunch()).current;
  const [scope, setScope] = useState(
    launch?.scope === "public" ? "public" : "personal",
  );
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState(launch?.text || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [planSeed, setPlanSeed] = useState("");
  const [planVersion, setPlanVersion] = useState(0);
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState("discussion");
  const [instructionRecord, setInstructionRecord] = useState(null);
  const [activeInstructionId, setActiveInstructionId] = useState(null);
  const [instructionVersion, setInstructionVersion] = useState(0);
  const messageListRef = useRef(null);
  const streamController = useRef(null);

  const canDiscuss =
    auth.authenticated &&
    !auth.user?.mustChangePassword &&
    (scope === "public" || aiPersonalEnabled);
  const canPlan = canDiscuss && (scope === "personal" || auth.isAdmin);
  const visibleConversations = useMemo(
    () => conversations.filter((item) => item.scope === scope && (item.mode || "discussion") === mode),
    [conversations, scope, mode],
  );

  const refreshHistory = useCallback(() => {
    if (!auth.authenticated) return;
    api.listAiConversations().then(setConversations).catch(() => {});
  }, [auth.authenticated]);

  useEffect(() => refreshHistory(), [refreshHistory]);
  useEffect(() => () => streamController.current?.abort(), []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const element = messageListRef.current;
      if (element) element.scrollTop = element.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages]);

  function resetConversation(nextScope = scope) {
    streamController.current?.abort();
    streamController.current = null;
    setBusy(false);
    setScope(nextScope);
    setConversationId(null);
    setMessages([]);
    setDraft("");
    setPlanSeed("");
    setPlanVersion(0);
    setError("");
    setNotice("");
    setInstructionRecord(null);
    setActiveInstructionId(null);
    setInstructionVersion((value) => value + 1);
  }

  async function openConversation(item) {
    setBusy(true);
    setError("");
    try {
      const value = await api.getAiConversation(item.id);
      const rows = value.messages || [];
      setScope(value.scope);
      setConversationId(value.id);
      setMessages(rows);
      setPlanSeed(
        rows.length
          ? locale === "en"
            ? "Turn the confirmed conclusions in this conversation into a safe executable plan."
            : "请把这个对话中已经确认的结论转成安全的可执行方案。"
          : "",
      );
      setPlanVersion(0);
    } catch (value) {
      setError(errorMessage(value));
    } finally {
      setBusy(false);
    }
  }

  async function openInstruction(item) {
    setBusy(true);
    setError("");
    try {
      const value = await api.getAiConversation(item.id);
      const rows = value.messages || [];
      const prompt = [...rows].reverse().find((message) => message.role === "user")?.content || "";
      const answer = [...rows].reverse().find((message) => message.role === "assistant" && message.metadata?.mode === "instruction");
      let result = answer?.metadata?.kind === "query" ? answer.metadata.result : null;
      if (answer?.metadata?.kind === "plan" && answer.planId)
        result = { kind:"plan", plan:await api.getAiPlan(answer.planId) };
      if (answer?.metadata?.kind === "report" && answer.metadata.reportId)
        result = await api.getAiReport(answer.metadata.reportId);
      if (answer?.metadata?.kind === "error")
        result = { kind:"error", error:answer.content, code:answer.metadata.code };
      if (result && answer?.metadata?.usage) result = { ...result, run:answer.metadata.usage };
      else if (result && answer?.metadata?.runId) {
        try { result = { ...result, run:await api.getAiRun(answer.metadata.runId) }; } catch { /* legacy history has no run snapshot */ }
      }
      setScope(value.scope);
      setInstructionRecord({ id:value.id, prompt, result, updatedAt:value.updatedAt || item.updatedAt });
      setActiveInstructionId(value.id);
    } catch (value) {
      setError(errorMessage(value));
    } finally {
      setBusy(false);
    }
  }

  function newInstruction() {
    setInstructionRecord(null);
    setActiveInstructionId(null);
    setInstructionVersion((value) => value + 1);
    setError("");
    setNotice("");
  }

  async function sendDiscussion() {
    const text = draft.trim();
    if (!text || !canDiscuss) return;
    setBusy(true);
    setError("");
    setNotice("");
    const createdAt=Date.now(),streamId=`stream-${createdAt}-${Math.random().toString(36).slice(2)}`;
    const controller=new AbortController();streamController.current=controller;
    const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    let pendingContent='',renderFrame=0;
    const appendContent=content=>setMessages(current=>current.map(message=>message.localId===streamId?{...message,content:message.content+content}:message));
    const flushPending=()=>{
      renderFrame=0;
      if(controller.signal.aborted||!pendingContent)return;
      const content=pendingContent;pendingContent='';appendContent(content);
    };
    const enqueueContent=content=>{if(!content)return;if(reducedMotion){appendContent(content);return;}pendingContent+=content;if(!renderFrame)renderFrame=requestAnimationFrame(flushPending);};
    const finishStreamRender=()=>{if(renderFrame){cancelAnimationFrame(renderFrame);renderFrame=0;}flushPending();};
    setMessages((current) => [...current,
      { role: "user", content: text, createdAt },
      { role: "assistant", content: "", createdAt:createdAt+1, streaming:true, localId:streamId },
    ]);
    setDraft("");
    try {
      const completed=await api.discussAiStream(scope,text,locale,conversationId,{
        signal:controller.signal,
        onMeta:value=>setConversationId(value.conversationId),
        onDelta:enqueueContent,
        onUsage:event=>setMessages(current=>current.map(message=>message.localId===streamId?{...message,run:event.run}:message)),
      });
      finishStreamRender();
      setMessages(current=>current.map(message=>message.localId===streamId?{...message,streaming:false,run:completed.run||message.run,metadata:{mode:"discussion",streamed:true,usage:completed.run||message.run}}:message));
      setPlanSeed(
        locale === "en"
          ? "Turn the confirmed conclusions from our discussion into a safe executable plan. Do not delete resources unless explicitly requested."
          : "请把以上讨论中已经确认的结论转成安全的可执行方案；除非我明确要求，否则不要删除任何资源。",
      );
      setPlanVersion(0);
      setNotice(c.ready);
      refreshHistory();
    } catch (value) {
      if(renderFrame)cancelAnimationFrame(renderFrame);
      if(value?.name==='AbortError'){
        setMessages(current=>current.map(message=>message.localId===streamId?{...message,streaming:false,cancelled:true}:message));
        setNotice(c.stopped);
        refreshHistory();
        return;
      }
      setMessages(current=>current.map(message=>message.localId===streamId?{...message,streaming:false,failed:true}:message));
      setError(errorMessage(value));
    } finally {
      if(streamController.current===controller){streamController.current=null;setBusy(false);}
    }
  }

  function createPlan() {
    if (!canPlan || !planSeed) return;
    setPlanVersion((value) => value + 1);
    setNotice("");
  }

  function switchMode(nextMode) {
    streamController.current?.abort();
    streamController.current = null;
    setBusy(false);
    setMode(nextMode);
    setError("");
    setNotice("");
  }

  const header = (
    <header className="topbar ai-workspace-topbar">
      <button className="brand ai-workspace-brand" onClick={() => { location.href = "/"; }}>
        <span className="brand-mark">
          {branding.logoUrl ? <img src={branding.logoUrl} alt="" /> : <Icon name="assistant" size={17} />}
        </span>
        {branding.siteName || "NavPilot"}
        <span className="brand-tag">AI</span>
      </button>
      <div className="ai-workspace-heading">
        <strong>{c.title}</strong>
        <small>{c.subtitle}</small>
      </div>
      <div className="topbar-actions">
        <button className="icon-btn" onClick={() => { location.href = "/"; }}>
          <Icon name="chevronLeft" size={15} />
          {c.back}
        </button>
        <LocaleSwitcher />
        <ThemeSwitcher theme={theme} onChange={onThemeChange} />
        <AccountMenu />
      </div>
    </header>
  );

  if (auth.loading) {
    return <div className="app ai-workspace-shell">{header}<div className="empty-state">Loading…</div></div>;
  }
  if (!auth.authenticated) {
    return (
      <div className="app ai-workspace-shell">
        {header}
        <div className="ai-workspace-gate">
          <Icon name="assistant" size={42} />
          <h2>{c.login}</h2>
          <p>{c.loginDesc}</p>
          <button className="icon-btn primary" onClick={() => auth.setLoginOpen(true)}>
            {locale === "en" ? "Sign in" : "登录"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app ai-workspace-shell">
      {header}
      <div className="ai-workspace-context">
        <div>
          <span>{c.scope}</span>
          <button disabled={busy} className={scope === "personal" ? "active" : ""} onClick={() => resetConversation("personal")}>
            <Icon name="user" size={14} />{c.personal}
          </button>
          <button disabled={busy} className={scope === "public" ? "active" : ""} onClick={() => resetConversation("public")}>
            <Icon name="building" size={14} />{c.public}
          </button>
        </div>
        <div className="ai-workspace-mode-switch" role="tablist" aria-label={locale === "en" ? "AI mode" : "AI 模式"}>
          <button role="tab" aria-selected={mode === "discussion"} className={mode === "discussion" ? "active" : ""} disabled={busy} onClick={() => switchMode("discussion")}><Icon name="assistant" size={13}/>{c.discussionMode}</button>
          <button role="tab" aria-selected={mode === "instruction"} className={mode === "instruction" ? "active" : ""} disabled={busy} onClick={() => switchMode("instruction")}><Icon name="tools" size={13}/>{c.commandMode}</button>
        </div>
      </div>
      <div className="ai-workspace-layout">
        <aside className="ai-workspace-sidebar">
          {mode === "discussion" ? <>
            <div className="ai-sidebar-label"><Icon name="assistant" size={15} />{c.chat}</div>
            <button className="icon-btn ai-new-chat" disabled={busy} onClick={() => resetConversation()}>
              <Icon name="plus" size={14} />{c.newChat}
            </button>
            <div className="ai-conversation-list">
              <strong>{c.history}</strong>
              {!visibleConversations.length ? (
                <small>{c.emptyHistory}</small>
              ) : visibleConversations.map((item) => (
                <button disabled={busy} className={conversationId === item.id ? "active" : ""} key={item.id} onClick={() => openConversation(item)}>
                  <span>{item.title}</span>
                  <small>{new Date(item.updatedAt).toLocaleString(locale)}</small>
                </button>
              ))}
            </div>
          </> : <>
            <div className="ai-sidebar-label"><Icon name="tools" size={15}/>{c.commandTitle}</div>
            <button className="icon-btn ai-new-chat" disabled={busy} onClick={newInstruction}><Icon name="plus" size={14}/>{c.newInstruction}</button>
            <div className="ai-conversation-list">
              <strong>{c.instructionHistory}</strong>
              {!visibleConversations.length ? <small>{c.emptyInstructionHistory}</small> : visibleConversations.map((item) => <button disabled={busy} className={activeInstructionId === item.id ? "active" : ""} key={item.id} onClick={() => openInstruction(item)}><span>{item.title}</span><small>{new Date(item.updatedAt).toLocaleString(locale)}</small></button>)}
            </div>
            <div className="ai-instruction-sidebar-note"><Icon name="shield" size={13}/><span>{locale === "en" ? "Queries run immediately; mutations require approval." : "查询立即执行，修改仍需授权。"}</span></div>
          </>}
        </aside>
        <main className="ai-workspace-main">
          {mode === "instruction" ? <AiInstructionPanel key={`${scope}-${instructionVersion}-${instructionRecord?.id || "new"}`} scope={scope} canMutate={scope === "personal" || auth.isAdmin} initialRecord={instructionRecord} onCreated={(id) => { setActiveInstructionId(id); refreshHistory(); }} onExecuted={() => { setNotice(c.changed); refreshHistory(); }}/> : <div className="ai-chat-grid">
            <section className="ai-discussion-column">
              <header>
                <div><span className="ai-step-number">1</span><div><strong>{c.chat}</strong><small>{c.welcomeDesc}</small></div></div>
                {conversationId && <code>{conversationId.slice(0, 8)}</code>}
              </header>
              {scope === "personal" && !aiPersonalEnabled ? (
                <div className="ai-workspace-inline-gate">
                  <Icon name="shield" size={34} /><strong>{c.disabled}</strong><p>{c.disabledDesc}</p>
                </div>
              ) : (
                <>
                  <div className="ai-discussion-messages" ref={messageListRef}>
                    {!messages.length ? (
                      <div className="ai-discussion-welcome">
                        <Icon name="assistant" size={32} />
                        <h3>{c.welcome}</h3>
                        <p>{c.welcomeDesc}</p>
                        <div>{c.starters.map((text) => <button key={text} onClick={() => setDraft(text)}>{text}<Icon name="chevronRight" size={13} /></button>)}</div>
                      </div>
                    ) : messages.map((message, index) => (
                      <article className={`${message.role} ${message.streaming ? "streaming" : ""} ${message.failed ? "failed" : ""}`} key={`${message.createdAt || index}-${index}`}>
                        <span>{message.role === "user" ? (locale === "en" ? "You" : "你") : "AI"}</span>
                        <div>{message.content}{message.streaming&&<i className="ai-stream-caret" aria-label={locale==='en'?'Generating':'正在生成'}/>}</div>
                        {message.cancelled&&<small>{c.stopped}</small>}
                        {message.planId && <small>{locale === "en" ? "Execution plan" : "执行方案"} · {message.planId.slice(0, 8)}</small>}
                        {(message.run||message.metadata?.usage)&&<AiRunUsage run={message.run||message.metadata.usage} locale={locale} live={message.streaming} compact/>}
                      </article>
                    ))}
                  </div>
                  <footer>
                    <textarea value={draft} disabled={busy} placeholder={c.placeholder} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") sendDiscussion(); }} />
                    <div className="ai-composer-feedback" aria-live="polite">
                      {error ? <span className="error-text">{error}</span> : notice ? <span className="settings-saved">{notice}</span> : null}
                    </div>
                    <div className="ai-discussion-actions"><small>Ctrl/⌘ + Enter</small>{busy?<button className="icon-btn ai-discussion-submit" onClick={()=>streamController.current?.abort()}><Icon name="close" size={14}/>{c.stop}</button>:<button className="icon-btn primary ai-discussion-submit" disabled={!draft.trim() || !canDiscuss} onClick={sendDiscussion}><Icon name="assistant" size={14} />{c.discuss}</button>}</div>
                  </footer>
                </>
              )}
            </section>
            <aside className="ai-plan-column">
              <header><div><span className="ai-step-number">2</span><div><strong>{c.planTitle}</strong><small>{c.planHint}</small></div></div></header>
              {scope === "public" && !auth.isAdmin ? (
                <div className="ai-plan-placeholder"><Icon name="shield" size={30} /><p>{c.publicReadOnly}</p></div>
              ) : planVersion === 0 ? (
                <div className="ai-plan-placeholder"><Icon name="tools" size={34} /><p>{c.planEmpty}</p><button className="icon-btn primary" disabled={!planSeed || !canPlan} onClick={createPlan}>{c.plan}</button></div>
              ) : (
                <AiCommandPanel key={`${scope}-${planVersion}`} scope={scope} initialText={planSeed} initialConversationId={conversationId} workspace onExecuted={() => { setNotice(c.changed); refreshHistory(); }} />
              )}
            </aside>
          </div>}
        </main>
      </div>
    </div>
  );
}
