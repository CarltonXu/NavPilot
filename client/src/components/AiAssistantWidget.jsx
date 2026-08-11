import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { useI18n } from "../i18n/LocaleContext.jsx";
import Icon from "./Icon.jsx";
import { launchAiWorkspace } from "./AiWorkspace.jsx";
import AiInstructionPanel from "./AiInstructionPanel.jsx";

export default function AiAssistantWidget({
  aiPersonalEnabled,
  activeSpace = "public",
  activeContext = null,
  launchRequest,
  onChanged,
}) {
  const auth = useAuth();
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [viewport, setViewport] = useState(null);
  const [scope, setScope] = useState("personal");
  const [draft, setDraft] = useState("");
  const [context, setContext] = useState(null);
  const [instructionVersion, setInstructionVersion] = useState(0);

  const close = useCallback(() => setOpen(false), []);
  const chooseScope = useCallback(
    (requested) => requested === "public" ? "public" : "personal",
    [],
  );
  const start = useCallback((requestedScope, text = "", nextContext = null) => {
    setScope(chooseScope(requestedScope));
    setDraft(text);
    setContext(nextContext);
    setInstructionVersion((value) => value + 1);
    setOpen(true);
  }, [chooseScope]);

  useEffect(() => {
    function key(event) {
      const shortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j";
      if (shortcut && !event.isComposing) {
        event.preventDefault();
        start(activeSpace, "", activeContext);
      } else if (event.key === "Escape" && open) {
        event.preventDefault();
        close();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [activeContext, activeSpace, open, close, start]);

  useEffect(() => {
    if (!launchRequest?.id) return;
    start(launchRequest.scope, launchRequest.text || "", launchRequest.context || null);
  }, [launchRequest, start]);

  useEffect(() => {
    if (!open || !window.visualViewport) {
      setViewport(null);
      return;
    }
    const update = () => {
      const view = window.visualViewport;
      setViewport({ left:view.offsetLeft, top:view.offsetTop, width:view.width, height:view.height });
    };
    update();
    window.visualViewport.addEventListener("resize", update);
    window.visualViewport.addEventListener("scroll", update);
    return () => {
      window.visualViewport.removeEventListener("resize", update);
      window.visualViewport.removeEventListener("scroll", update);
    };
  }, [open]);

  function changeScope(next) {
    setScope(next);
    setDraft("");
    setContext(null);
    setInstructionVersion((value) => value + 1);
  }

  const gate = !auth.authenticated ? (
    <div className="assistant-gate">
      <Icon name="user" size={36}/>
      <h4>{t("assistant.loginTitle")}</h4>
      <p>{t("assistant.loginDesc")}</p>
      <button className="icon-btn primary" onClick={() => { close(); auth.setLoginOpen(true); }}>{t("auth.login")}</button>
    </div>
  ) : auth.user.mustChangePassword ? (
    <div className="assistant-gate"><h4>{t("auth.changeRequired")}</h4></div>
  ) : scope === "personal" && !aiPersonalEnabled ? (
    <div className="assistant-gate">
      <Icon name="assistant" size={36}/>
      <h4>{t("assistant.disabledTitle")}</h4>
      <p>{t("assistant.disabledDesc")}</p>
    </div>
  ) : null;

  if (!open) return null;
  return <div
    className="assistant-backdrop assistant-dialog-backdrop"
    style={viewport ? { left:viewport.left, top:viewport.top, width:viewport.width, height:viewport.height, right:"auto", bottom:"auto" } : undefined}
    onMouseDown={(event) => event.target === event.currentTarget && close()}
  >
    <section className="ai-widget-panel assistant-command assistant-command-dialog" role="dialog" aria-modal="true" aria-labelledby="assistant-title">
      <header className="assistant-dialog-header">
        <div className="assistant-dialog-brand">
          <div className="assistant-avatar"><Icon name="assistant" size={23}/></div>
          <div><strong id="assistant-title">{t("assistant.title")}</strong><small>{locale === "en" ? "Query and manage resources with natural language" : "使用自然语言查询和管理资源"}</small></div>
        </div>
        <div className="assistant-dialog-actions">
          <kbd>Ctrl/⌘ J</kbd>
          {auth.isAdmin&&<button className="assistant-workspace-link" title={locale === "en" ? "Open AI Workspace" : "进入 AI 工作台"} onClick={() => launchAiWorkspace({ scope, text:draft.trim() })}><Icon name="grid" size={13}/>{locale === "en" ? "Workspace" : "工作台"}</button>}
          <button className="mini-btn assistant-dialog-close" aria-label={t("common.close")} onClick={close}><Icon name="close" size={15}/></button>
        </div>
      </header>
      <div className="ai-widget-body assistant-body assistant-operation-body">
        <div className="assistant-control-strip">
          <div className="assistant-scope-switch">
            <span>{t("assistant.targetSpace")}</span>
            <div>
              <button className={scope === "public" ? "active" : ""} onClick={() => changeScope("public")}><Icon name="building" size={14}/>{t("space.public")}</button>
              <button className={scope === "personal" ? "active" : ""} onClick={() => changeScope("personal")}><Icon name="user" size={14}/>{t("space.personal")}</button>
            </div>
          </div>
          <span className="assistant-safety"><Icon name="shield" size={14}/>{locale === "en" ? "Changes require approval" : "修改操作需要确认"}</span>
          {context?.label&&<div className="assistant-context" title={context.label}><Icon name="target" size={13}/><span>{context.label}</span></div>}
        </div>
        {gate || <div className="assistant-quick-command">
          <div className="assistant-prompt-heading"><strong>{locale === "en" ? "Enter a command" : "输入你的指令"}</strong><span>{locale === "en" ? "Queries return directly; changes become an approval plan" : "查询直接返回结果，修改会先生成待确认方案"}</span></div>
          <AiInstructionPanel key={`${scope}-${instructionVersion}`} scope={scope} initialText={draft} contextText={context?.text||""} quick compact canMutate={scope === "personal" || auth.isAdmin} onDraftChange={setDraft} onExecuted={onChanged}/>
        </div>}
      </div>
    </section>
  </div>;
}
