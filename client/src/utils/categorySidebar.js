export const CATEGORY_SIDEBAR_MIN_WIDTH = 180;
export const CATEGORY_SIDEBAR_MAX_WIDTH = 400;
export const CATEGORY_SIDEBAR_COLLAPSED_WIDTH = 56;
export const CATEGORY_SIDEBAR_COLLAPSE_THRESHOLD = 156;
export const CATEGORY_SIDEBAR_COLLAPSE_RELEASE = 174;

export function clampCategorySidebarWidth(value) {
  const width = Number(value);
  if (!Number.isFinite(width)) return null;
  return Math.round(
    Math.min(
      CATEGORY_SIDEBAR_MAX_WIDTH,
      Math.max(CATEGORY_SIDEBAR_MIN_WIDTH, width),
    ),
  );
}

export function readCategorySidebarPreference(raw) {
  try {
    const value = raw ? JSON.parse(raw) : {};
    return {
      width: value.width == null ? null : clampCategorySidebarWidth(value.width),
      collapsed: Boolean(value.collapsed),
    };
  } catch {
    return { width: null, collapsed: false };
  }
}

export function categorySidebarCollapsePreview(width, previous = false) {
  const value = Number(width);
  if (!Number.isFinite(value)) return false;
  return previous
    ? value < CATEGORY_SIDEBAR_COLLAPSE_RELEASE
    : value < CATEGORY_SIDEBAR_COLLAPSE_THRESHOLD;
}
