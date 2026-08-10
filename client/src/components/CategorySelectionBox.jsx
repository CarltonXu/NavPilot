import React from "react";
import Icon from "./Icon.jsx";

export default function CategorySelectionBox({
  state = "none",
  label,
  disabled = false,
  onToggle,
}) {
  const checked = state === "all";
  const mixed = state === "mixed";
  function toggle(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!disabled) onToggle?.();
  }
  function keyDown(event) {
    if (event.key === " " || event.key === "Enter") toggle(event);
  }
  return (
    <span
      className={`category-selection-box ${checked ? "checked" : ""} ${mixed ? "mixed" : ""}`}
      role="checkbox"
      aria-checked={mixed ? "mixed" : checked}
      aria-label={label}
      title={label}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={toggle}
      onKeyDown={keyDown}
    >
      {checked && <Icon name="check" size={12} />}
      {mixed && <span className="category-selection-mixed" />}
    </span>
  );
}
