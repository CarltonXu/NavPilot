import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LocaleProvider } from "../i18n/LocaleContext.jsx";
import AdminWorkspace, {
  ADMIN_TAB_CACHE_TTL_MS,
} from "./AdminWorkspace.jsx";

vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: () => ({
    loading: false,
    user: { displayName: "Admin", mustChangePassword: false },
    isAdmin: true,
    setLoginOpen: vi.fn(),
    logout: vi.fn(),
  }),
}));
vi.mock("./AdminAnalytics.jsx", () => ({
  default: ({ refreshToken }) => (
    <div data-refresh-token={refreshToken} data-testid="analytics-content" />
  ),
  AuditTable: ({ refreshToken }) => (
    <div data-refresh-token={refreshToken} data-testid="audit-content" />
  ),
}));
vi.mock("./UserManagement.jsx", () => ({
  default: ({ refreshToken }) => (
    <div data-refresh-token={refreshToken} data-testid="users-content" />
  ),
}));
vi.mock("./AvailabilityManagement.jsx", () => ({
  default: ({ refreshToken }) => (
    <div data-refresh-token={refreshToken} data-testid="availability-content" />
  ),
}));
vi.mock("./SystemSettingsModal.jsx", () => ({
  default: ({ refreshToken }) => (
    <div data-refresh-token={refreshToken} data-testid="ai-content" />
  ),
}));
vi.mock("./ThemeSwitcher.jsx", () => ({ default: () => null }));
vi.mock("./LocaleSwitcher.jsx", () => ({ default: () => null }));

beforeEach(() => {
  localStorage.setItem("navpilot_locale", "zh-CN");
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("AdminWorkspace tab loading", () => {
  it("mounts tab content on demand and keeps visited tabs mounted", () => {
    render(
      <LocaleProvider>
        <AdminWorkspace
          theme="dark"
          onThemeChange={() => {}}
          branding={{ siteName: "NavPilot" }}
          publicInsights={{
            enabled: true,
            anonymousEnabled: false,
            searchMinCount: 3,
          }}
        />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("analytics-content")).toBeTruthy();
    expect(screen.queryByTestId("audit-content")).toBeNull();
    expect(screen.queryByTestId("users-content")).toBeNull();
    expect(screen.queryByTestId("availability-content")).toBeNull();
    expect(screen.queryByTestId("ai-content")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "安全审计" }));
    expect(screen.getByTestId("audit-content")).toBeTruthy();
    expect(screen.getByTestId("analytics-content")).toBeTruthy();
    expect(screen.queryByTestId("users-content")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "可用性监控" }));
    expect(screen.getByTestId("availability-content")).toBeTruthy();
    expect(screen.getByTestId("analytics-content")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "账户管理" }));
    expect(screen.getByTestId("users-content")).toBeTruthy();
    expect(screen.queryByTestId("ai-content")).toBeNull();
    expect(screen.getByTestId("availability-content")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "AI 设置" }));
    expect(screen.getByTestId("ai-content")).toBeTruthy();
  });

  it("only mounts the restored active tab on the first render", () => {
    sessionStorage.setItem("navpilot_admin_tab", "users");

    render(
      <LocaleProvider>
        <AdminWorkspace
          theme="dark"
          onThemeChange={() => {}}
          branding={{ siteName: "NavPilot" }}
          publicInsights={{
            enabled: true,
            anonymousEnabled: false,
            searchMinCount: 3,
          }}
        />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("users-content")).toBeTruthy();
    expect(screen.queryByTestId("analytics-content")).toBeNull();
    expect(screen.queryByTestId("audit-content")).toBeNull();
    expect(screen.queryByTestId("availability-content")).toBeNull();
    expect(screen.queryByTestId("ai-content")).toBeNull();
  });

  it("refreshes stale tabs on re-entry and supports manual refresh", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    render(
      <LocaleProvider>
        <AdminWorkspace
          theme="dark"
          onThemeChange={() => {}}
          branding={{ siteName: "NavPilot" }}
          publicInsights={{
            enabled: true,
            anonymousEnabled: false,
            searchMinCount: 3,
          }}
        />
      </LocaleProvider>,
    );

    expect(
      screen.getByTestId("analytics-content").getAttribute("data-refresh-token"),
    ).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "刷新当前标签页" }));
    expect(
      screen.getByTestId("analytics-content").getAttribute("data-refresh-token"),
    ).toBe("1");

    fireEvent.click(screen.getByRole("tab", { name: "安全审计" }));
    fireEvent.click(screen.getByRole("tab", { name: "访问分析" }));
    expect(
      screen.getByTestId("analytics-content").getAttribute("data-refresh-token"),
    ).toBe("1");

    fireEvent.click(screen.getByRole("tab", { name: "安全审计" }));
    now.mockReturnValue(1_000 + ADMIN_TAB_CACHE_TTL_MS + 1);
    fireEvent.click(screen.getByRole("tab", { name: "访问分析" }));
    expect(
      screen.getByTestId("analytics-content").getAttribute("data-refresh-token"),
    ).toBe("2");

    now.mockRestore();
  });
});
