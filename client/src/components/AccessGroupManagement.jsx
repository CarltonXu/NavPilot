import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { useI18n } from "../i18n/LocaleContext.jsx";
import Icon from "./Icon.jsx";
import AdminPageHeader from "./AdminPageHeader.jsx";
import AuthorizationOverview from "./AuthorizationOverview.jsx";

function initials(user) {
  return String(user?.displayName || user?.username || "?")
    .trim()
    .slice(0, 1)
    .toUpperCase();
}

function groupDraft(group) {
  return {
    name: group.name,
    description: group.description || "",
    userIds: (group.members || [])
      .filter((member) => member.role !== "admin")
      .map((member) => member.id),
  };
}

export default function AccessGroupManagement({ refreshToken = 0 }) {
  const { locale, errorMessage } = useI18n();
  const zh = locale !== "en";
  const [data, setData] = useState({ groups: [], stats: {} });
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState("all");
  const [detailTab, setDetailTab] = useState("members");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [groups, userRows] = await Promise.all([
        api.listAccessGroups(),
        api.listUsers(),
      ]);
      setData(groups);
      setUsers(userRows.filter((user) => user.role !== "admin"));
      setSelected((current) =>
        current && !groups.groups.some((group) => group.id === current.id)
          ? null
          : current,
      );
      return groups.groups;
    } catch (e) {
      setError(errorMessage(e));
      return [];
    } finally {
      setLoading(false);
    }
  }, [errorMessage]);

  const open = useCallback(
    async (group) => {
      setError("");
      setSearch("");
      setMemberFilter("all");
      setDetailTab("members");
      try {
        const detail = await api.getAccessGroup(group.id);
        setSelected(detail);
        setDraft(groupDraft(detail));
      } catch (e) {
        setError(errorMessage(e));
      }
    },
    [errorMessage],
  );

  useEffect(() => {
    let active = true;
    load().then((groups) => {
      if (active && groups[0]) open(groups[0]);
    });
    return () => {
      active = false;
    };
  }, [load, open, refreshToken]);

  function create() {
    setSelected(null);
    setDraft({ name: "", description: "", userIds: [] });
    setSearch("");
    setMemberFilter("all");
    setDetailTab("members");
    setError("");
  }

  function reset() {
    if (selected) setDraft(groupDraft(selected));
    else if (data.groups[0]) open(data.groups[0]);
    else setDraft(null);
    setSearch("");
    setMemberFilter("all");
  }

  async function save() {
    if (!draft?.name.trim()) return;
    setSaving(true);
    setError("");
    try {
      let group;
      if (selected) {
        group = await api.updateAccessGroup(selected.id, {
          name: draft.name,
          description: draft.description,
          expectedVersion: selected.version,
        });
        group = await api.updateAccessGroupMembers(group.id, {
          userIds: draft.userIds,
          expectedVersion: group.version,
        });
      } else {
        group = await api.createAccessGroup({
          name: draft.name,
          description: draft.description,
        });
        group = await api.updateAccessGroupMembers(group.id, {
          userIds: draft.userIds,
          expectedVersion: group.version,
        });
      }
      setSelected(group);
      setDraft(groupDraft(group));
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!selected) return;
    const message = zh
      ? `删除“${selected.name}”将撤销其 ${selected.resourceCount || 0} 个资源授权，确认继续？`
      : `Deleting “${selected.name}” revokes access to ${selected.resourceCount || 0} resources. Continue?`;
    if (!window.confirm(message)) return;
    setSaving(true);
    try {
      await api.deleteAccessGroup(selected.id, true);
      setSelected(null);
      setDraft(null);
      const groups = await load();
      if (groups[0]) await open(groups[0]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const memberIds = useMemo(() => new Set(draft?.userIds || []), [draft?.userIds]);
  const filteredUsers = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return users
      .filter((user) => {
        const isMember = memberIds.has(user.id);
        if (memberFilter === "selected" && !isMember) return false;
        if (memberFilter === "available" && isMember) return false;
        return (
          !needle ||
          `${user.displayName} ${user.username}`
            .toLocaleLowerCase()
            .includes(needle)
        );
      })
      .sort((left, right) => {
        const membershipOrder =
          Number(memberIds.has(right.id)) - Number(memberIds.has(left.id));
        return (
          membershipOrder ||
          String(left.displayName || left.username).localeCompare(
            String(right.displayName || right.username),
            locale,
          )
        );
      });
  }, [locale, memberFilter, memberIds, search, users]);

  function toggle(id) {
    setDraft((current) => ({
      ...current,
      userIds: current.userIds.includes(id)
        ? current.userIds.filter((value) => value !== id)
        : [...current.userIds, id],
    }));
  }

  const statCards = [
    ["groupCount", "users", zh ? "授权组" : "Groups"],
    ["membershipCount", "user", zh ? "成员关系" : "Memberships"],
    ["resourceCount", "link", zh ? "受控资源" : "Resources"],
  ];
  const filters = [
    ["all", zh ? "全部账户" : "All accounts", users.length],
    ["selected", zh ? "已加入" : "Members", draft?.userIds.length || 0],
    [
      "available",
      zh ? "未加入" : "Available",
      Math.max(0, users.length - (draft?.userIds.length || 0)),
    ],
  ];

  return (
    <div className="access-group-admin">
      <AdminPageHeader
        icon="users"
        title={zh ? "授权组管理" : "Access groups"}
        description={
          zh
            ? "将账户组织成可复用的授权组，统一控制公共资源的可见范围。"
            : "Organize accounts into reusable groups for public-resource access."
        }
        actions={
          <button className="icon-btn primary" onClick={create}>
            <Icon name="plus" size={15} />
            {zh ? "新建授权组" : "New access group"}
          </button>
        }
      />

      {error && (
        <div className="admin-inline-error">
          <Icon name="shield" size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="account-stat-grid access-group-stat-grid">
        {statCards.map(([key, icon, label]) => (
          <article key={key}>
            <span><Icon name={icon} size={17} /></span>
            <div>
              <strong>{data.stats[key] || 0}</strong>
              <small>{label}</small>
            </div>
          </article>
        ))}
      </div>

      <div className="access-group-workspace">
        <aside className="access-group-sidebar">
          <header>
            <div>
              <strong>{zh ? "授权组" : "Access groups"}</strong>
              <small>
                {zh
                  ? `${data.groups.length} 个分组`
                  : `${data.groups.length} groups`}
              </small>
            </div>
            <button
              type="button"
              className="mini-btn"
              onClick={create}
              aria-label={zh ? "新建授权组" : "New access group"}
            >
              <Icon name="plus" size={14} />
            </button>
          </header>
          <div className="access-group-sidebar-list">
            {loading && !data.groups.length ? (
              <div className="access-group-sidebar-empty">
                {zh ? "正在加载…" : "Loading…"}
              </div>
            ) : data.groups.length ? (
              data.groups.map((group) => (
                <button
                  type="button"
                  key={group.id}
                  className={selected?.id === group.id ? "active" : ""}
                  onClick={() => open(group)}
                >
                  <span className="access-group-sidebar-icon">
                    <Icon name="users" size={15} />
                  </span>
                  <span>
                    <strong>{group.name}</strong>
                    <small>
                      {group.description || (zh ? "暂无说明" : "No description")}
                    </small>
                  </span>
                  <em>{group.memberCount}</em>
                </button>
              ))
            ) : (
              <div className="access-group-sidebar-empty">
                <Icon name="users" size={22} />
                <span>{zh ? "还没有授权组" : "No access groups yet"}</span>
              </div>
            )}
          </div>
        </aside>

        <section className="access-group-detail">
          {draft ? (
            <>
              <header className="access-group-detail-head">
                <span><Icon name="users" size={19} /></span>
                <div>
                  <h3>
                    {selected
                      ? zh
                        ? "编辑授权组"
                        : "Edit access group"
                      : zh
                        ? "新建授权组"
                        : "New access group"}
                  </h3>
                  <p>
                    {zh
                      ? "组名和说明仅供管理员识别，成员关系会影响资源访问权限。"
                      : "Names and descriptions are admin-only; membership controls resource access."}
                  </p>
                </div>
                {selected && (
                  <div className="access-group-detail-metrics">
                    <span>
                      <strong>{draft.userIds.length}</strong>
                      <small>{zh ? "成员" : "Members"}</small>
                    </span>
                    <span>
                      <strong>{selected.resourceCount || 0}</strong>
                      <small>{zh ? "资源" : "Resources"}</small>
                    </span>
                  </div>
                )}
              </header>

              <div className="access-group-form-grid">
                <div className="form-row">
                  <label>{zh ? "组名" : "Group name"}</label>
                  <input
                    value={draft.name}
                    placeholder={zh ? "例如：研发团队" : "e.g. Engineering"}
                    onChange={(event) =>
                      setDraft({ ...draft, name: event.target.value })
                    }
                  />
                </div>
                <div className="form-row">
                  <label>{zh ? "说明" : "Description"}</label>
                  <input
                    value={draft.description}
                    placeholder={
                      zh ? "说明该组的用途或成员范围" : "Purpose or member scope"
                    }
                    onChange={(event) =>
                      setDraft({ ...draft, description: event.target.value })
                    }
                  />
                </div>
              </div>

              {selected && (
                <div className="access-group-detail-tabs" role="tablist">
                  <button type="button" role="tab" aria-selected={detailTab === "members"} className={detailTab === "members" ? "active" : ""} onClick={() => setDetailTab("members")}>
                    <Icon name="users" size={14} />{zh ? "成员管理" : "Members"}<span>{draft.userIds.length}</span>
                  </button>
                  <button type="button" role="tab" aria-selected={detailTab === "authorization"} className={detailTab === "authorization" ? "active" : ""} onClick={() => setDetailTab("authorization")}>
                    <Icon name="shield" size={14} />{zh ? "授权详情" : "Authorization"}<span>{(selected.authorization?.summary.resourceCount || 0) + (selected.authorization?.summary.categoryCount || 0)}</span>
                  </button>
                </div>
              )}

              {!selected || detailTab === "members" ? (
              <section className="access-member-directory">
                <header>
                  <div>
                    <h4>{zh ? "组成员" : "Group members"}</h4>
                    <p>
                      {zh
                        ? "已加入的账户优先显示，可通过筛选快速添加或移出成员。"
                        : "Members appear first. Filter the directory to add or remove accounts quickly."}
                    </p>
                  </div>
                  <div className="access-member-search">
                    <Icon name="search" size={15} />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={zh ? "搜索姓名或用户名…" : "Search name or username…"}
                      aria-label={zh ? "搜索组成员" : "Search group members"}
                    />
                  </div>
                </header>

                <div className="access-member-filters" role="tablist">
                  {filters.map(([key, label, count]) => (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={memberFilter === key}
                      className={memberFilter === key ? "active" : ""}
                      key={key}
                      onClick={() => setMemberFilter(key)}
                    >
                      {label}<span>{count}</span>
                    </button>
                  ))}
                  <em>
                    {zh
                      ? `显示 ${filteredUsers.length} 个账户`
                      : `${filteredUsers.length} accounts shown`}
                  </em>
                </div>

                <div className="access-member-table-head">
                  <span>{zh ? "账户" : "Account"}</span>
                  <span>{zh ? "角色" : "Role"}</span>
                  <span>{zh ? "状态" : "Status"}</span>
                  <span>{zh ? "成员操作" : "Membership"}</span>
                </div>
                <div className="access-member-rows">
                  {filteredUsers.length ? (
                    filteredUsers.map((user) => {
                      const isMember = memberIds.has(user.id);
                      return (
                        <div
                          className={`access-member-row ${isMember ? "member" : ""}`}
                          key={user.id}
                        >
                          <div className="access-member-identity">
                            <i>{initials(user)}</i>
                            <span>
                              <strong>{user.displayName}</strong>
                              <small>@{user.username}</small>
                            </span>
                          </div>
                          <span className={`role-badge ${user.role}`}>
                            <Icon
                              name={user.role === "admin" ? "shield" : "user"}
                              size={13}
                            />
                            {user.role === "admin"
                              ? zh
                                ? "管理员"
                                : "Administrator"
                              : zh
                                ? "普通用户"
                                : "Member"}
                          </span>
                          <span className={`user-status ${user.status}`}>
                            <i />
                            {user.status === "active"
                              ? zh
                                ? "已启用"
                                : "Active"
                              : zh
                                ? "已禁用"
                                : "Disabled"}
                          </span>
                          <button
                            type="button"
                            className={`access-member-toggle ${isMember ? "remove" : "add"}`}
                            disabled={saving}
                            onClick={() => toggle(user.id)}
                            aria-label={`${isMember ? (zh ? "移出" : "Remove") : zh ? "加入" : "Add"} ${user.displayName}`}
                          >
                            <Icon name={isMember ? "minus" : "plus"} size={13} />
                            {isMember
                              ? zh
                                ? "移出"
                                : "Remove"
                              : zh
                                ? "加入"
                                : "Add"}
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="access-member-empty">
                      <Icon name="search" size={20} />
                      <span>
                        {zh ? "没有符合条件的账户" : "No matching accounts"}
                      </span>
                    </div>
                  )}
                </div>
              </section>
              ) : (
                <section className="access-group-authorization-panel">
                  <header>
                    <div>
                      <h4>{zh ? "授权详情" : "Authorization details"}</h4>
                      <p>{zh ? "查看当前授权组被单独授予的资源和分类默认权限。" : "Resources and category defaults granted directly to this group."}</p>
                    </div>
                  </header>
                  <AuthorizationOverview authorization={selected.authorization} groupMode />
                </section>
              )}

              <footer className="access-group-actions">
                {selected ? (
                  <button
                    className="icon-btn danger-outline"
                    disabled={saving}
                    onClick={remove}
                  >
                    <Icon name="trash" size={14} />
                    {zh ? "删除授权组" : "Delete group"}
                  </button>
                ) : (
                  <span />
                )}
                <div>
                  <button className="icon-btn" disabled={saving} onClick={reset}>
                    {zh ? "取消" : "Cancel"}
                  </button>
                  <button
                    className="icon-btn primary"
                    disabled={saving || !draft.name.trim()}
                    onClick={save}
                  >
                    <Icon name="check" size={14} />
                    {saving
                      ? zh
                        ? "保存中…"
                        : "Saving…"
                      : zh
                        ? "保存修改"
                        : "Save changes"}
                  </button>
                </div>
              </footer>
            </>
          ) : (
            <div className="access-group-detail-empty">
              <span><Icon name="users" size={28} /></span>
              <h3>{zh ? "选择一个授权组" : "Select an access group"}</h3>
              <p>
                {zh
                  ? "从左侧选择已有授权组，或者新建一个授权组。"
                  : "Choose an existing group from the left or create a new one."}
              </p>
              <button className="icon-btn primary" onClick={create}>
                <Icon name="plus" size={14} />
                {zh ? "新建授权组" : "New access group"}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
