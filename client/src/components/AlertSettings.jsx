import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useI18n } from "../i18n/LocaleContext.jsx";
import { useToast } from "./ToastProvider.jsx";
import Icon from "./Icon.jsx";

const emptyPolicy = { failureThreshold:3, cooldownMinutes:30, notifyRecovery:true, enabled:true, titleTemplate:"[NavPilot] {status} · {resource}" };
function blankChannel(type, email = "") {
  return type === "email"
    ? { type, name:"Email", enabled:true, config:{ to:email, smtpHost:"", smtpPort:587, smtpSecure:false, smtpUser:"", smtpPassword:"", from:"" } }
    : { type, name:"Webhook", enabled:true, config:{ url:"", headers:{} } };
}

export default function AlertSettings({ scope = "personal", defaultEmail = "" }) {
  const { locale } = useI18n();
  const zh = locale !== "en";
  const toast = useToast();
  const [config, setConfig] = useState({ channels:[], policy:emptyPolicy });
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [testingId, setTestingId] = useState(null);
  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([api.getAlertConfig(scope), api.getAlertEvents(scope, 20)])
      .then(([next, history]) => { if (live) { setConfig(next); setEvents(history.events || []); } })
      .catch((cause) => live && setError(cause.message))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [scope]);
  function updateChannel(index, patch) {
    setConfig((current) => ({ ...current, channels:current.channels.map((channel, channelIndex) => channelIndex === index ? { ...channel, ...patch, config:{ ...channel.config, ...(patch.config || {}) } } : channel) }));
  }
  function addChannel(type) {
    setConfig((current) => current.channels.some((channel) => channel.type === type)
      ? current
      : ({ ...current, channels:[...current.channels, blankChannel(type, defaultEmail)] }));
  }
  function removeChannel(index) {
    setConfig((current) => ({ ...current, channels:current.channels.filter((_, channelIndex) => channelIndex !== index) }));
  }
  async function save() {
    setBusy(true); setError(""); setMessage("");
    try { const next = await api.saveAlertConfig(scope, config); setConfig(next); setMessage(zh ? "告警设置已保存" : "Alert settings saved"); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  async function test(channel) {
    if (!channel.id) { setError(zh ? "请先保存告警设置" : "Save the alert settings first"); return; }
    setBusy(true); setError(""); setMessage("");
    setTestingId(channel.id);
    try { await api.testAlertChannel(scope, channel.id); setMessage(zh ? "测试通知已发送" : "Test notification sent"); toast.show(zh ? "测试通知发送成功" : "Test notification sent", "success"); }
    catch (cause) { setError(cause.message); toast.show(zh ? `测试通知发送失败：${cause.message}` : `Test notification failed: ${cause.message}`, "error"); }
    finally { setTestingId(null); setBusy(false); }
  }
  if (loading) return <div className="empty-state">{zh ? "正在加载告警设置…" : "Loading alert settings…"}</div>;
  const hasEmail = config.channels.some((channel) => channel.type === "email");
  const hasWebhook = config.channels.some((channel) => channel.type === "webhook");
  return <div className="alert-settings">
    <div className="alert-settings-intro"><Icon name="bell" size={18}/><div><strong>{zh ? "轻量告警" : "Lightweight alerts"}</strong><small>{zh ? "连续探测失败后通知，恢复时自动发送恢复消息。" : "Notify after consecutive failures and send a recovery message."}</small></div></div>
      <section className="alert-settings-section">
      <header><div><h5>{zh ? "通知渠道" : "Notification channels"}</h5><p>{zh ? "支持 Email 和 Webhook，每种渠道可配置一个。" : "Configure one Email channel and one Webhook channel."}</p></div><div className="alert-settings-actions"><button type="button" className="icon-btn alert-channel-add email" disabled={hasEmail} onClick={() => addChannel("email")}><Icon name={hasEmail ? "check" : "mail"} size={14}/>{hasEmail ? (zh ? "Email 已添加" : "Email added") : (zh ? "添加 Email" : "Add Email")}</button><button type="button" className="icon-btn alert-channel-add webhook" disabled={hasWebhook} onClick={() => addChannel("webhook")}><Icon name={hasWebhook ? "check" : "globe"} size={14}/>{hasWebhook ? (zh ? "Webhook 已添加" : "Webhook added") : (zh ? "添加 Webhook" : "Add Webhook")}</button></div></header>
      {!config.channels.length && <div className="alert-settings-empty">{zh ? "尚未配置通知渠道" : "No notification channels configured"}</div>}
      {config.channels.map((channel, index) => <article className="alert-channel-card" key={channel.id || `new-${index}`}>
        <div className="alert-channel-heading"><Icon name={channel.type === "email" ? "mail" : "globe"} size={16}/><input value={channel.name || ""} onChange={(event) => updateChannel(index, { name:event.target.value })}/><label><input type="checkbox" checked={channel.enabled !== false} onChange={(event) => updateChannel(index, { enabled:event.target.checked })}/>{zh ? "启用" : "Enabled"}</label><button type="button" className="mini-btn" onClick={() => removeChannel(index)} aria-label={zh ? "删除渠道" : "Remove channel"}>×</button></div>
        {channel.type === "email" ? <div className="form-grid-2 alert-channel-fields"><div className="form-row"><label>{zh ? "接收邮箱" : "Recipient"}</label><input type="email" value={channel.config.to || ""} onChange={(event) => updateChannel(index, { config:{ to:event.target.value } })}/></div><div className="form-row"><label>SMTP Host</label><input value={channel.config.smtpHost || ""} onChange={(event) => updateChannel(index, { config:{ smtpHost:event.target.value } })}/></div><div className="form-row"><label>SMTP Port</label><input type="number" value={channel.config.smtpPort || 587} onChange={(event) => updateChannel(index, { config:{ smtpPort:event.target.value } })}/></div><div className="form-row"><label>{zh ? "发件人" : "From"}</label><input type="email" value={channel.config.from || ""} onChange={(event) => updateChannel(index, { config:{ from:event.target.value } })}/></div><div className="form-row"><label>{zh ? "SMTP 用户名" : "SMTP user"}</label><input value={channel.config.smtpUser || ""} onChange={(event) => updateChannel(index, { config:{ smtpUser:event.target.value } })}/></div><div className="form-row"><label>{zh ? "SMTP 密码" : "SMTP password"}</label><input type="password" value={channel.config.smtpPassword || ""} placeholder={channel.id ? "••••••••" : ""} onChange={(event) => updateChannel(index, { config:{ smtpPassword:event.target.value } })}/></div><label className="alert-policy-check"><input type="checkbox" checked={Boolean(channel.config.smtpSecure)} onChange={(event) => updateChannel(index, { config:{ smtpSecure:event.target.checked } })}/>{zh ? "启用 SSL/TLS（465 端口通常需要）" : "Use SSL/TLS (usually required for port 465)"}</label></div>
          : <div className="form-row"><label>Webhook URL</label><input value={channel.config.url || ""} placeholder="https://example.com/hooks/navpilot" onChange={(event) => updateChannel(index, { config:{ url:event.target.value } })}/></div>}
        <div className="alert-channel-footer"><small>{channel.type === "email" ? (zh ? "需要 SMTP 服务配置" : "SMTP service required") : (zh ? "发送 JSON POST 请求" : "Sends JSON POST requests")}</small><button type="button" className="icon-btn alert-test-button" aria-busy={testingId === channel.id} disabled={busy || !channel.id} onClick={() => test(channel)}><Icon name={testingId === channel.id ? "refresh" : "send"} size={13} className={testingId === channel.id ? "batch-identify-spinner" : ""}/>{testingId === channel.id ? (zh ? "发送中…" : "Sending…") : (zh ? "发送测试" : "Send test")}</button></div>
      </article>)}
    </section>
    <section className="alert-settings-section"><header><div><h5>{zh ? "告警策略" : "Alert policy"}</h5><p>{zh ? "建议使用 3 次失败和 30 分钟冷却，避免网络抖动造成骚扰。" : "Three failures and a 30-minute cooldown are good defaults."}</p></div></header><div className="form-grid-2 alert-policy-fields"><div className="form-row alert-title-template"><label>{zh ? "告警标题模板" : "Alert title template"}</label><input value={config.policy.titleTemplate || "[NavPilot] {status} · {resource}"} onChange={(event) => setConfig({ ...config, policy:{ ...config.policy, titleTemplate:event.target.value } })}/><small>{zh ? "可用变量：{status}、{resource}、{event}" : "Variables: {status}, {resource}, {event}"}</small></div><div className="form-row"><label>{zh ? "连续失败次数" : "Failure threshold"}</label><input type="number" min="1" max="20" value={config.policy.failureThreshold} onChange={(event) => setConfig({ ...config, policy:{ ...config.policy, failureThreshold:event.target.value } })}/></div><div className="form-row"><label>{zh ? "冷却时间（分钟）" : "Cooldown (minutes)"}</label><input type="number" min="0" max="1440" value={config.policy.cooldownMinutes} onChange={(event) => setConfig({ ...config, policy:{ ...config.policy, cooldownMinutes:event.target.value } })}/></div><label className="alert-policy-check"><input type="checkbox" checked={config.policy.notifyRecovery !== false} onChange={(event) => setConfig({ ...config, policy:{ ...config.policy, notifyRecovery:event.target.checked } })}/>{zh ? "服务恢复时发送通知" : "Notify when recovered"}</label></div></section>
    {error && <div className="error-text">{error}</div>}{message && <div className="settings-saved">{message}</div>}
    <div className="settings-actions"><button type="button" className="icon-btn primary" disabled={busy} onClick={save}>{zh ? "保存告警设置" : "Save alert settings"}</button></div>
    <section className="alert-settings-section alert-history"><header><div><h5>{zh ? "最近告警" : "Recent alerts"}</h5></div></header>{!events.length ? <div className="alert-settings-empty">{zh ? "暂无告警记录" : "No alert events"}</div> : events.map((event) => <div className="alert-history-row" key={event.id}><span className={`availability-state ${event.eventType === "recovered" ? "online" : "offline"}`}><i/>{event.eventType === "recovered" ? (zh ? "已恢复" : "Recovered") : (zh ? "不可用" : "Down")}</span><strong>{event.itemName || event.itemId}</strong><small>{event.message} · {new Date(event.createdAtMs).toLocaleString(locale)}</small></div>)}</section>
  </div>;
}
