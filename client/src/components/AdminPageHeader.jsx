import React from "react";
import Icon from "./Icon.jsx";

export default function AdminPageHeader({ icon = "grid", title, description, actions = null }) {
  return (
    <header className="admin-page-header">
      <span className="admin-page-header-icon"><Icon name={icon} size={21} /></span>
      <div className="admin-page-header-copy">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actions && <div className="admin-page-header-actions">{actions}</div>}
    </header>
  );
}
