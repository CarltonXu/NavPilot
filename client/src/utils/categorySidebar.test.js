import { describe, expect, it } from "vitest";
import {
  categorySidebarCollapsePreview,
  clampCategorySidebarWidth,
  readCategorySidebarPreference,
} from "./categorySidebar.js";

describe("category sidebar preferences", () => {
  it("keeps custom widths inside the supported range", () => {
    expect(clampCategorySidebarWidth(120)).toBe(180);
    expect(clampCategorySidebarWidth(286.4)).toBe(286);
    expect(clampCategorySidebarWidth(520)).toBe(400);
  });

  it("safely restores width and collapsed state", () => {
    expect(readCategorySidebarPreference('{"width":312,"collapsed":true}')).toEqual({
      width: 312,
      collapsed: true,
    });
    expect(readCategorySidebarPreference("invalid")).toEqual({
      width: null,
      collapsed: false,
    });
  });

  it("previews magnetic collapse with a release hysteresis", () => {
    expect(categorySidebarCollapsePreview(155)).toBe(true);
    expect(categorySidebarCollapsePreview(160)).toBe(false);
    expect(categorySidebarCollapsePreview(168, true)).toBe(true);
    expect(categorySidebarCollapsePreview(176, true)).toBe(false);
  });
});
