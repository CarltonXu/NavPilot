import React from "react";
import { useI18n } from "../i18n/LocaleContext.jsx";
import Icon from "./Icon.jsx";

function expiry(grant, locale) {
  if (!grant.expiresAtMs) return { label:locale === "en" ? "Permanent" : "永久", state:"permanent" };
  if (grant.expiresAtMs <= Date.now()) return { label:locale === "en" ? "Expired" : "已到期", state:"expired" };
  return {
    label:new Intl.DateTimeFormat(locale, { year:"numeric", month:"short", day:"numeric" }).format(grant.expiresAtMs),
    state:"active",
  };
}

function GrantRows({ rows, kind, locale, groupMode }) {
  const zh = locale !== "en";
  if (!rows.length) {
    return (
      <div className="authorization-empty">
        <Icon name={kind === "resource" ? "link" : "folder"} size={18} />
        <span>{kind === "resource" ? (zh ? "暂无资源授权" : "No resource grants") : (zh ? "暂无分类默认授权" : "No category defaults")}</span>
      </div>
    );
  }
  return (
    <div className="authorization-grant-list">
      {rows.map((row, index) => {
        const expiration = expiry(row, locale);
        return (
          <div className="authorization-grant-row" key={`${kind}:${row.id}:${row.groupId || "direct"}:${index}`}>
            <span className="authorization-grant-icon"><Icon name={kind === "resource" ? "link" : "folder"} size={14} /></span>
            <span>
              <strong>{row.name}</strong>
              <small>{kind === "resource" ? row.url : (zh ? "分类默认权限模板" : "Category access default")}</small>
            </span>
            <span className="authorization-source-badge">
              {row.groupName || (groupMode ? (zh ? "当前组" : "This group") : (zh ? "直接授权" : "Direct"))}
            </span>
            <span className={`authorization-expiry ${expiration.state}`}>{expiration.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function AuthorizationOverview({ authorization, groupMode = false }) {
  const { locale } = useI18n();
  const zh = locale !== "en";
  const directResources = authorization?.directResources || authorization?.resources || [];
  const groupResources = authorization?.groupResources || [];
  const directCategories = authorization?.directCategories || authorization?.categories || [];
  const groupCategories = authorization?.groupCategories || [];
  const resources = [...directResources, ...groupResources];
  const categories = [...directCategories, ...groupCategories];
  const activeCount = [...resources, ...categories].filter((grant) => !grant.expiresAtMs || grant.expiresAtMs > Date.now()).length;
  const stats = groupMode
    ? [
        ["link", resources.length, zh ? "授权资源" : "Resources"],
        ["folder", categories.length, zh ? "分类模板" : "Category defaults"],
        ["check", activeCount, zh ? "当前有效" : "Currently active"],
      ]
    : [
        ["link", directResources.length, zh ? "直接资源授权" : "Direct resources"],
        ["users", groupResources.length, zh ? "来自授权组" : "Via groups"],
        ["folder", categories.length, zh ? "分类模板" : "Category defaults"],
      ];
  return (
    <div className="authorization-overview">
      <div className="authorization-summary">
        {stats.map(([icon, count, label]) => (
          <div key={label}>
            <span><Icon name={icon} size={15} /></span>
            <strong>{count}</strong>
            <small>{label}</small>
          </div>
        ))}
      </div>
      <div className="authorization-columns">
        <section>
          <header>
            <div><Icon name="link" size={15} /><strong>{zh ? "资源授权" : "Resource grants"}</strong></div>
            <span>{resources.length}</span>
          </header>
          <GrantRows rows={resources} kind="resource" locale={locale} groupMode={groupMode} />
        </section>
        <section>
          <header>
            <div><Icon name="folder" size={15} /><strong>{zh ? "分类默认授权" : "Category defaults"}</strong></div>
            <span>{categories.length}</span>
          </header>
          <GrantRows rows={categories} kind="category" locale={locale} groupMode={groupMode} />
        </section>
      </div>
    </div>
  );
}
