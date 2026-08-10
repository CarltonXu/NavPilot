import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { useI18n } from "../i18n/LocaleContext.jsx";
import Icon from "./Icon.jsx";

function initials(user) {
  return String(user?.displayName || user?.username || "?")
    .trim()
    .slice(0, 1)
    .toUpperCase();
}

function PasswordResult({ value }) {
  const { t } = useI18n();
  return (
    <div className="temporary-password">
      <span className="temporary-password-icon">
        <Icon name="shield" size={18} />
      </span>
      <div>
        <strong>{t("admin.tempPassword")}</strong>
        <code>{value}</code>
        <small>{t("admin.tempPasswordHint")}</small>
      </div>
    </div>
  );
}

function CreateUserDialog({
  form,
  setForm,
  password,
  busy,
  error,
  onSubmit,
  onClose,
}) {
  const { t } = useI18n();
  return (
    <div
      className="modal-mask"
      onMouseDown={(event) =>
        event.target === event.currentTarget && !busy && onClose()
      }
    >
      <div
        className="modal account-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-account-title"
      >
        <div className="account-dialog-heading">
          <span>
            <Icon name="user" size={20} />
          </span>
          <div>
            <h3 id="create-account-title">
              {password ? t("admin.accountCreated") : t("admin.createUser")}
            </h3>
            <p className="modal-sub">
              {t(password ? "admin.tempPasswordHint" : "admin.createUserDesc")}
            </p>
          </div>
          <button
            type="button"
            className="mini-btn"
            disabled={busy}
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
        {error && (
          <div className="admin-inline-error">
            <Icon name="shield" size={16} />
            <span>{error}</span>
          </div>
        )}
        {password ? (
          <>
            <PasswordResult value={password} />
            <div className="modal-actions">
              <button
                type="button"
                className="icon-btn primary"
                onClick={onClose}
              >
                {t("common.close")}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <div className="form-row">
              <label>{t("auth.username")}</label>
              <input
                autoFocus
                value={form.username}
                onChange={(event) =>
                  setForm({ ...form, username: event.target.value })
                }
                placeholder={t("auth.usernamePlaceholder")}
              />
            </div>
            <div className="form-row">
              <label>{t("auth.displayName")}</label>
              <input
                value={form.displayName}
                onChange={(event) =>
                  setForm({ ...form, displayName: event.target.value })
                }
                placeholder={t("auth.displayNamePlaceholder")}
              />
            </div>
            <div className="form-row">
              <label>{t("auth.role")}</label>
              <select
                value={form.role}
                onChange={(event) =>
                  setForm({ ...form, role: event.target.value })
                }
              >
                <option value="user">{t("admin.roleUser")}</option>
                <option value="admin">{t("admin.roleAdmin")}</option>
              </select>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="icon-btn"
                disabled={busy}
                onClick={onClose}
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                className="icon-btn primary"
                disabled={
                  busy || !form.username.trim() || !form.displayName.trim()
                }
              >
                <Icon name="plus" size={15} />
                {t(busy ? "common.saving" : "admin.createUser")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function UserManagement() {
  const { t, errorMessage, locale } = useI18n();
  const [users, setUsers] = useState([]),
    [legacy, setLegacy] = useState([]),
    [selected, setSelected] = useState(null),
    [draft, setDraft] = useState(null);
  const [createForm, setCreateForm] = useState({
      username: "",
      displayName: "",
      role: "user",
    }),
    [createPassword, setCreatePassword] = useState(""),
    [detailPassword, setDetailPassword] = useState("");
  const [showCreate, setShowCreate] = useState(false),
    [query, setQuery] = useState(""),
    [statusFilter, setStatusFilter] = useState("all"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  async function refresh() {
    const [nextUsers, nextLegacy] = await Promise.all([
      api.listUsers(),
      api.listLegacySpaces(),
    ]);
    setUsers(nextUsers);
    setLegacy(nextLegacy);
  }
  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([api.listUsers(), api.listLegacySpaces()])
      .then(([nextUsers, nextLegacy]) => {
        if (live) {
          setUsers(nextUsers);
          setLegacy(nextLegacy);
        }
      })
      .catch((e) => live && setError(errorMessage(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [errorMessage]);
  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((user) => user.status === "active").length,
      admins: users.filter((user) => user.role === "admin").length,
      disabled: users.filter((user) => user.status === "disabled").length,
    }),
    [users],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter(
      (user) =>
        (statusFilter === "all" || user.status === statusFilter) &&
        (!needle ||
          `${user.displayName} ${user.username}`
            .toLowerCase()
            .includes(needle)),
    );
  }, [users, query, statusFilter]);
  const formatDate = (value) => {
    if (!value) return t("admin.neverLoggedIn");
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
      ? `${value.replace(" ", "T")}Z`
      : value;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime())
      ? String(value)
      : new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(date);
  };
  function closeCreate() {
    if (busy) return;
    setShowCreate(false);
    setCreatePassword("");
    setCreateForm({ username: "", displayName: "", role: "user" });
  }
  function closeDetail() {
    if (busy) return;
    setSelected(null);
    setDraft(null);
    setDetailPassword("");
  }
  async function createUser(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.createUser(createForm);
      setCreatePassword(result.temporaryPassword);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function openUser(id) {
    setBusy(true);
    setError("");
    try {
      const detail = await api.getUser(id);
      setSelected(detail);
      setDraft({ ...detail.user });
      setDetailPassword("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function reloadDetail(id) {
    const detail = await api.getUser(id);
    setSelected(detail);
    setDraft({ ...detail.user });
  }
  async function saveUser() {
    setBusy(true);
    setError("");
    try {
      await api.updateUser(draft.id, {
        displayName: draft.displayName,
        role: draft.role,
        status: draft.status,
      });
      await Promise.all([refresh(), reloadDetail(draft.id)]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function resetPassword() {
    if (!confirm(t("admin.confirmResetPassword", { name: draft.displayName })))
      return;
    setBusy(true);
    setError("");
    try {
      const result = await api.resetUserPassword(draft.id);
      setDetailPassword(result.temporaryPassword);
      await Promise.all([refresh(), reloadDetail(draft.id)]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function removeUser() {
    if (!confirm(t("admin.confirmDeleteUser", { name: draft.displayName })))
      return;
    setBusy(true);
    setError("");
    try {
      await api.deleteUser(draft.id);
      setSelected(null);
      setDraft(null);
      setDetailPassword("");
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function assign(space) {
    const userId = prompt(t("admin.assignPrompt"));
    if (!userId) return;
    setBusy(true);
    setError("");
    try {
      await api.assignLegacySpace(space.id, userId);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const statCards = [
    ["total", "user", "admin.totalAccounts"],
    ["active", "check", "admin.activeAccounts"],
    ["admins", "shield", "admin.adminAccounts"],
    ["disabled", "minus", "admin.disabledAccounts"],
  ];
  return (
    <div className="user-management">
      <div className="account-page-heading">
        <div className="settings-page-icon">
          <Icon name="user" size={22} />
        </div>
        <div>
          <h2>{t("admin.users")}</h2>
          <p>{t("admin.accountsDescription")}</p>
        </div>
        <button
          className="icon-btn primary"
          onClick={() => {
            setError("");
            setCreatePassword("");
            setShowCreate(true);
          }}
        >
          <Icon name="plus" size={15} />
          {t("admin.createUser")}
        </button>
      </div>
      {error && !showCreate && !selected && (
        <div className="admin-inline-error">
          <Icon name="shield" size={16} />
          <span>{error}</span>
        </div>
      )}
      <div className="account-stat-grid">
        {statCards.map(([key, icon, label]) => (
          <article key={key}>
            <span>
              <Icon name={icon} size={17} />
            </span>
            <div>
              <strong>{stats[key]}</strong>
              <small>{t(label)}</small>
            </div>
          </article>
        ))}
      </div>
      <section className="admin-panel account-directory">
        <div className="account-directory-toolbar">
          <div className="search-box">
            <Icon name="search" size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("admin.searchAccounts")}
            />
          </div>
          <select
            aria-label={t("admin.accountStatus")}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">{t("admin.allStatuses")}</option>
            <option value="active">{t("admin.active")}</option>
            <option value="disabled">{t("admin.disabled")}</option>
          </select>
          <span>
            {filtered.length} / {users.length}
          </span>
        </div>
        <div className="account-list-header">
          <span>{t("admin.accountColumn")}</span>
          <span>{t("auth.role")}</span>
          <span>{t("admin.accountStatus")}</span>
          <span>{t("admin.lastLoginAt")}</span>
          <span />
        </div>
        <div className={`account-list ${loading ? "loading" : ""}`}>
          {loading ? (
            <div className="account-list-empty">{t("common.loading")}</div>
          ) : filtered.length ? (
            filtered.map((user) => (
              <button
                type="button"
                className="account-row"
                key={user.id}
                disabled={busy}
                onClick={() => openUser(user.id)}
              >
                <span className="account-identity">
                  <i>{initials(user)}</i>
                  <span>
                    <strong>{user.displayName}</strong>
                    <small>@{user.username}</small>
                  </span>
                </span>
                <span className={`role-badge ${user.role}`}>
                  <Icon
                    name={user.role === "admin" ? "shield" : "user"}
                    size={13}
                  />
                  {t(
                    user.role === "admin"
                      ? "admin.roleAdmin"
                      : "admin.roleUser",
                  )}
                </span>
                <span className={`user-status ${user.status}`}>
                  <i />
                  {t(`admin.${user.status}`)}
                </span>
                <span
                  className={`account-last-login ${user.lastLoginAt ? "" : "never"}`}
                >
                  {formatDate(user.lastLoginAt)}
                </span>
                <Icon name="chevronRight" size={15} />
              </button>
            ))
          ) : (
            <div className="account-list-empty">{t("analytics.noData")}</div>
          )}
        </div>
      </section>
      {legacy.length > 0 && (
        <section className="admin-panel legacy-panel">
          <div className="panel-heading-inline">
            <div>
              <h2>{t("admin.legacy")}</h2>
              <p>{t("category.manageDesc")}</p>
            </div>
            <span className="chart-tag">{legacy.length}</span>
          </div>
          <div className="legacy-list">
            {legacy.map((space) => (
              <div className="legacy-row" key={space.id}>
                <span className="legacy-icon">
                  <Icon name="folder" size={17} />
                </span>
                <div>
                  <strong>
                    {space.observedLabel || space.legacyOwnerKey.slice(0, 8)}
                  </strong>
                  <small>
                    {space.itemCount} items ·{" "}
                    {space.assignedToUserId
                      ? t("admin.assigned")
                      : t("admin.pending")}
                  </small>
                </div>
                {!space.assignedToUserId && (
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={busy}
                    onClick={() => assign(space)}
                  >
                    {t("admin.assign")}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {showCreate && (
        <CreateUserDialog
          form={createForm}
          setForm={setCreateForm}
          password={createPassword}
          busy={busy}
          error={error}
          onSubmit={createUser}
          onClose={closeCreate}
        />
      )}{" "}
      {selected && draft && (
        <div
          className="modal-mask"
          onMouseDown={(event) =>
            event.target === event.currentTarget && closeDetail()
          }
        >
          <div
            className="modal user-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-detail-title"
          >
            <header className="user-detail-header">
              <span className="user-detail-avatar">
                {initials(selected.user)}
              </span>
              <div>
                <div>
                  <h3 id="user-detail-title">{selected.user.displayName}</h3>
                  <span className={`user-status ${selected.user.status}`}>
                    <i />
                    {t(`admin.${selected.user.status}`)}
                  </span>
                </div>
                <p>
                  @{selected.user.username} ·{" "}
                  {t(
                    selected.user.role === "admin"
                      ? "admin.roleAdmin"
                      : "admin.roleUser",
                  )}
                </p>
              </div>
              <button
                type="button"
                className="mini-btn"
                disabled={busy}
                aria-label={t("common.close")}
                onClick={closeDetail}
              >
                <Icon name="close" size={15} />
              </button>
            </header>
            <div className="user-detail-body">
              {error && (
                <div className="admin-inline-error">
                  <Icon name="shield" size={16} />
                  <span>{error}</span>
                </div>
              )}
              <div className="user-detail-stats">
                {Object.entries(selected.stats).map(([key, value]) => (
                  <div key={key}>
                    <span>
                      <Icon
                        name={
                          key === "activeSessions"
                            ? "shield"
                            : key === "aiPlans"
                              ? "assistant"
                              : key === "personalCategories"
                                ? "folder"
                                : "link"
                        }
                        size={15}
                      />
                    </span>
                    <div>
                      <strong>{value}</strong>
                      <small>{t(`admin.userStats.${key}`)}</small>
                    </div>
                  </div>
                ))}
              </div>
              <section className="user-detail-section">
                <div>
                  <h4>{t("admin.accountInfo")}</h4>
                  <p>{t("admin.accountInfoDesc")}</p>
                </div>
                <div className="user-edit-grid">
                  <div className="form-row">
                    <label>{t("auth.username")}</label>
                  <input
                    value={draft.username}
                    readOnly
                    aria-readonly="true"
                  />
                  </div>
                  <div className="form-row">
                    <label>{t("auth.displayName")}</label>
                    <input
                      value={draft.displayName}
                      onChange={(event) =>
                        setDraft({ ...draft, displayName: event.target.value })
                      }
                    />
                  </div>
                  <div className="form-row">
                    <label>{t("admin.authorization")}</label>
                    <select
                      value={draft.role}
                      onChange={(event) =>
                        setDraft({ ...draft, role: event.target.value })
                      }
                    >
                      <option value="user">{t("admin.roleUser")}</option>
                      <option value="admin">{t("admin.roleAdmin")}</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <label>{t("admin.accountStatus")}</label>
                    <select
                      value={draft.status}
                      onChange={(event) =>
                        setDraft({ ...draft, status: event.target.value })
                      }
                    >
                      <option value="active">{t("admin.active")}</option>
                      <option value="disabled">{t("admin.disabled")}</option>
                    </select>
                  </div>
                </div>
              </section>
              <div className="user-meta-grid">
                <div>
                  <span>{t("admin.createdAt")}</span>
                  <strong>{formatDate(selected.user.createdAt)}</strong>
                </div>
                <div>
                  <span>{t("admin.lastLoginAt")}</span>
                  <strong>{formatDate(selected.user.lastLoginAt)}</strong>
                </div>
                <div>
                  <span>{t("admin.passwordChangedAt")}</span>
                  <strong>{formatDate(selected.user.passwordChangedAt)}</strong>
                </div>
              </div>
              {detailPassword && <PasswordResult value={detailPassword} />}
            </div>
            <footer className="user-detail-footer">
              <button
                type="button"
                className="icon-btn danger-outline"
                disabled={busy}
                onClick={removeUser}
              >
                <Icon name="minus" size={15} />
                {t("admin.deleteUser")}
              </button>
              <div>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={busy}
                  onClick={resetPassword}
                >
                  <Icon name="refresh" size={15} />
                  {t("admin.resetPassword")}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={busy}
                  onClick={closeDetail}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  className="icon-btn primary"
                  disabled={
                    busy || !draft.username.trim() || !draft.displayName.trim()
                  }
                  onClick={saveUser}
                >
                  <Icon name="check" size={15} />
                  {t(busy ? "common.saving" : "admin.saveChanges")}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
