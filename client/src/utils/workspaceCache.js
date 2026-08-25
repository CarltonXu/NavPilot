export const WORKSPACE_CACHE_TTL_MS = 120_000;

const PREFIX = "navpilot_workspace_v3:";

function storage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readWorkspaceCache(key, now = Date.now()) {
  try {
    const raw = storage()?.getItem(`${PREFIX}${key}`);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (
      value?.key !== key ||
      !Array.isArray(value.categories) ||
      !Array.isArray(value.items) ||
      !Number.isFinite(value.storedAt) ||
      typeof value.version !== "string"
    )
      return null;
    return {
      key,
      status: "ready",
      categories: value.categories,
      items: value.items,
      version: value.version,
      storedAt: value.storedAt,
      fresh: now - value.storedAt < WORKSPACE_CACHE_TTL_MS,
    };
  } catch {
    return null;
  }
}

export function writeWorkspaceCache(key, { categories, items, version }, now = Date.now()) {
  try {
    storage()?.setItem(
      `${PREFIX}${key}`,
      JSON.stringify({ key, categories, items, version: String(version || ""), storedAt: now }),
    );
  } catch {
    // A full or disabled sessionStorage must never prevent the workspace loading.
  }
}
