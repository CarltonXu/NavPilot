import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { useI18n } from "../i18n/LocaleContext.jsx";
import Icon from "./Icon.jsx";

const copy = {
  "zh-CN": {
    title: "个人账户设置",
    subtitle: "管理个人资料、显示偏好与账户安全",
    profile: "个人资料",
    profileDesc: "这些信息用于账户展示",
    preferences: "偏好设置",
    preferencesDesc: "作为没有本地选择时的默认值；当前浏览器的手动调整优先保留",
    security: "账户安全",
    securityDesc: "定期更新密码可以提高账户安全性",
    username: "用户名",
    immutable: "用户名是唯一登录标识，注册后不可修改",
    displayName: "显示名",
    avatar: "头像地址",
    avatarHint: "支持 HTTPS 图片地址",
    phone: "手机号",
    email: "邮箱",
    theme: "界面主题",
    language: "界面语言",
    view: "资源展示方式",
    space: "默认进入空间",
    public: "公共空间",
    personal: "个人空间",
    card: "卡片",
    compact: "紧凑列表",
    overview: "智能总览",
    save: "保存设置",
    saved: "账户设置已保存",
    current: "当前密码",
    next: "新密码",
    nextHint: "至少 10 位字符",
    confirm: "确认新密码",
    change: "修改密码",
    mismatch: "两次输入的新密码不一致",
  },
  en: {
    title: "Account settings",
    subtitle: "Manage your profile, preferences and security",
    profile: "Profile",
    profileDesc: "Information shown across your account",
    preferences: "Preferences",
    preferencesDesc: "Defaults for browsers without local choices; manual choices in this browser take priority",
    security: "Security",
    securityDesc: "Keep your account secure with a strong password",
    username: "Username",
    immutable: "Your unique sign-in name cannot be changed",
    displayName: "Display name",
    avatar: "Avatar URL",
    avatarHint: "Use an HTTPS image URL",
    phone: "Phone",
    email: "Email",
    theme: "Theme",
    language: "Language",
    view: "Resource view",
    space: "Default space",
    public: "Public Space",
    personal: "My Space",
    card: "Cards",
    compact: "Compact",
    overview: "Smart overview",
    save: "Save settings",
    saved: "Account settings saved",
    current: "Current password",
    next: "New password",
    nextHint: "At least 10 characters",
    confirm: "Confirm password",
    change: "Change password",
    mismatch: "The passwords do not match",
  },
};

export default function UserProfileModal({ onClose }) {
  const auth = useAuth();
  const { locale, errorMessage, t } = useI18n();
  const c = copy[locale] || copy["zh-CN"];
  const closeRef = useRef(null);
  const [tab, setTab] = useState("profile");
  const [draft, setDraft] = useState({
    displayName: auth.user.displayName || auth.user.username,
    avatarUrl: auth.user.avatarUrl || "",
    phone: auth.user.phone || "",
    email: auth.user.email || "",
    preferences: {
      theme:
        auth.user.preferences?.theme ||
        localStorage.getItem("navpilot_theme") ||
        "dark",
      locale: auth.user.preferences?.locale || locale,
      viewMode: (() => {
        const value = auth.user.preferences?.viewMode || localStorage.getItem("navpilot_view_mode_v1") || "card";
        return ["dense", "board"].includes(value) ? "overview" : value;
      })(),
      defaultSpace: auth.user.preferences?.defaultSpace || "public",
    },
  });
  const [password, setPassword] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    closeRef.current?.focus();
    const key = (event) => event.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [busy, onClose]);

  async function save() {
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const user = await auth.updateProfile(draft);
      window.dispatchEvent(new CustomEvent("navpilot:preferences-updated", {
        detail: user.preferences,
      }));
      setSaved(c.saved);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function change() {
    if (password.next !== password.confirm) {
      setError(c.mismatch);
      return;
    }
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await auth.changePassword(password.current, password.next);
      setPassword({ current: "", next: "", confirm: "" });
      setSaved(t("toast.passwordChanged"));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const tabs = [
    ["profile", "user", c.profile],
    ["preferences", "settings", c.preferences],
    ["security", "shield", c.security],
  ];
  const descriptions = {
    profile: c.profileDesc,
    preferences: c.preferencesDesc,
    security: c.securityDesc,
  };
  return createPortal(
    <div
      className="modal-mask profile-mask"
      onMouseDown={(event) =>
        event.target === event.currentTarget && !busy && onClose()
      }
    >
      <div
        className="modal profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
      >
        <header className="profile-heading">
          <div className="profile-avatar">
            {draft.avatarUrl ? (
              <img
                src={draft.avatarUrl}
                alt=""
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <span>
                {String(draft.displayName || auth.user.username)
                  .slice(0, 1)
                  .toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <h3 id="profile-title">{c.title}</h3>
            <p>{c.subtitle}</p>
          </div>
          <button
            ref={closeRef}
            className="mini-btn"
            onClick={onClose}
            disabled={busy}
            aria-label={t("common.close")}
          >
            <Icon name="close" size={15} />
          </button>
        </header>
        <div className="profile-layout">
          <nav className="profile-tabs" aria-label={c.title}>
            {tabs.map(([key, icon, label]) => (
              <button
                key={key}
                className={tab === key ? "active" : ""}
                onClick={() => {
                  setTab(key);
                  setError("");
                  setSaved("");
                }}
              >
                <Icon name={icon} size={16} />
                <span>{label}</span>
                <Icon name="chevronRight" size={13} />
              </button>
            ))}
          </nav>
          <section className="profile-body">
            <div className="profile-section-title">
              <h4>{tabs.find(([key]) => key === tab)?.[2]}</h4>
              <p>{descriptions[tab]}</p>
            </div>
            {tab === "profile" && (
              <>
                <div className="form-row">
                  <label>{c.username}</label>
                  <input
                    value={auth.user.username}
                    readOnly
                    aria-readonly="true"
                  />
                  <div className="hint">{c.immutable}</div>
                </div>
                <div className="form-row">
                  <label>{c.displayName}</label>
                  <input
                    value={draft.displayName}
                    onChange={(e) =>
                      setDraft({ ...draft, displayName: e.target.value })
                    }
                  />
                </div>
                <div className="form-row">
                  <label>{c.avatar}</label>
                  <input
                    value={draft.avatarUrl}
                    placeholder="https://..."
                    onChange={(e) =>
                      setDraft({ ...draft, avatarUrl: e.target.value })
                    }
                  />
                  <div className="hint">{c.avatarHint}</div>
                </div>
                <div className="form-grid-2">
                  <div className="form-row">
                    <label>{c.phone}</label>
                    <input
                      type="tel"
                      value={draft.phone}
                      onChange={(e) =>
                        setDraft({ ...draft, phone: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-row">
                    <label>{c.email}</label>
                    <input
                      type="email"
                      value={draft.email}
                      onChange={(e) =>
                        setDraft({ ...draft, email: e.target.value })
                      }
                    />
                  </div>
                </div>
              </>
            )}
            {tab === "preferences" && (
              <div className="form-grid-2">
                <div className="form-row">
                  <label>{c.theme}</label>
                  <select
                    value={draft.preferences.theme}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        preferences: {
                          ...draft.preferences,
                          theme: e.target.value,
                        },
                      })
                    }
                  >
                    <option value="dark">{t("theme.dark")}</option>
                    <option value="light">{t("theme.light")}</option>
                    <option value="midnight">{t("theme.midnight")}</option>
                    <option value="eyecare">{t("theme.eyecare")}</option>
                  </select>
                </div>
                <div className="form-row">
                  <label>{c.language}</label>
                  <select
                    value={draft.preferences.locale}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        preferences: {
                          ...draft.preferences,
                          locale: e.target.value,
                        },
                      })
                    }
                  >
                    <option value="zh-CN">中文</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div className="form-row">
                  <label>{c.view}</label>
                  <select
                    value={draft.preferences.viewMode}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        preferences: {
                          ...draft.preferences,
                          viewMode: e.target.value,
                        },
                      })
                    }
                  >
                    <option value="card">{c.card}</option>
                    <option value="compact">{c.compact}</option>
                    <option value="overview">{c.overview}</option>
                  </select>
                </div>
                <div className="form-row">
                  <label>{c.space}</label>
                  <select
                    value={draft.preferences.defaultSpace}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        preferences: {
                          ...draft.preferences,
                          defaultSpace: e.target.value,
                        },
                      })
                    }
                  >
                    <option value="public">{c.public}</option>
                    <option value="personal">{c.personal}</option>
                  </select>
                </div>
              </div>
            )}
            {tab === "security" && (
              <div className="profile-security-form">
                <div className="form-row">
                  <label>{c.current}</label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password.current}
                    onChange={(e) =>
                      setPassword({ ...password, current: e.target.value })
                    }
                  />
                </div>
                <div className="form-row">
                  <label>{c.next}</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password.next}
                    onChange={(e) =>
                      setPassword({ ...password, next: e.target.value })
                    }
                  />
                  <div className="hint">{c.nextHint}</div>
                </div>
                <div className="form-row">
                  <label>{c.confirm}</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password.confirm}
                    onChange={(e) =>
                      setPassword({ ...password, confirm: e.target.value })
                    }
                  />
                </div>
              </div>
            )}
            {error && <div className="error-text">{error}</div>}
            {saved && <div className="settings-saved">{saved}</div>}
          </section>
        </div>
        <footer>
          <button className="icon-btn" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button
            className="icon-btn primary"
            disabled={busy}
            onClick={tab === "security" ? change : save}
          >
            <Icon name={tab === "security" ? "shield" : "check"} size={15} />
            {busy ? t("common.saving") : tab === "security" ? c.change : c.save}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
