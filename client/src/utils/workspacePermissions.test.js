import { describe, expect, it } from "vitest";
import { workspaceCapabilities } from "./workspacePermissions.js";

const defaults = {
  space: "public",
  authenticated: true,
  isAdmin: true,
  mustChangePassword: false,
  ready: true,
  publicEditMode: false,
  personalEditMode: false,
  recognizing: false,
};

describe("workspaceCapabilities", () => {
  it("allows an administrator to configure public items outside edit mode", () => {
    const capabilities = workspaceCapabilities(defaults);

    expect(capabilities.canConfigureItems).toBe(true);
    expect(capabilities.canManage).toBe(false);
  });

  it("allows an owner to configure personal items outside edit mode", () => {
    const capabilities = workspaceCapabilities({
      ...defaults,
      space: "personal",
      isAdmin: false,
    });

    expect(capabilities.canConfigureItems).toBe(true);
    expect(capabilities.canManage).toBe(false);
  });

  it("keeps configuration unavailable to read-only and recognizing sessions", () => {
    expect(
      workspaceCapabilities({ ...defaults, isAdmin: false }).canConfigureItems,
    ).toBe(false);
    expect(
      workspaceCapabilities({ ...defaults, recognizing: true }).canConfigureItems,
    ).toBe(false);
  });

  it("enables inline management only after entering edit mode", () => {
    const capabilities = workspaceCapabilities({
      ...defaults,
      publicEditMode: true,
    });

    expect(capabilities.canConfigureItems).toBe(true);
    expect(capabilities.canManage).toBe(true);
  });
});
