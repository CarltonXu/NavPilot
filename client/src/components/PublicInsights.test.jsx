import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LocaleProvider } from "../i18n/LocaleContext.jsx";
import { api } from "../api.js";
import PublicInsights from "./PublicInsights.jsx";

vi.mock("../api.js", () => ({
  api: { getPublicInsights: vi.fn(), clickItem: vi.fn() },
}));
vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: () => ({
    loading: false,
    authenticated: true,
    user: { displayName: "Tester", username: "tester" },
    setLoginOpen: vi.fn(),
    logout: vi.fn(),
  }),
}));

const data = {
  summary: {
    resources: 12,
    newResources: 2,
    opens: 30,
    openedResources: 8,
    visitors: 5,
    onlineRate: 90,
  },
  accessTrend: [
    { day: "2026-08-11", opens: 10, visitors: 3, openedResources: 4 },
    { day: "2026-08-12", opens: 20, visitors: 5, openedResources: 7 },
  ],
  growthTrend: [
    { day: "2026-08-11", addedResources: 1, totalResources: 11 },
    { day: "2026-08-12", addedResources: 1, totalResources: 12 },
  ],
  search: {
    searchesWithPublicResults: 6,
    publicClicks: 3,
    clickThroughRate: 50,
    minCount: 3,
    trend: [
      { day: "2026-08-11", searches: 2, publicClicks: 1 },
      { day: "2026-08-12", searches: 4, publicClicks: 2 },
    ],
    terms: [
      { name: "GitLab", searches: 8, publicClicks: 4 },
      { name: "Documentation", searches: 3, publicClicks: 1 },
      { name: "Status", searches: 7, publicClicks: 2 },
      { name: "Wiki", searches: 6, publicClicks: 2 },
      { name: "Grafana", searches: 5, publicClicks: 2 },
      { name: "Jenkins", searches: 5, publicClicks: 1 },
      { name: "Registry", searches: 4, publicClicks: 1 },
      { name: "Tickets", searches: 4, publicClicks: 1 },
      { name: "Mail", searches: 3, publicClicks: 1 },
      { name: "Calendar", searches: 3, publicClicks: 1 },
      { name: "Eleventh", searches: 3, publicClicks: 0 },
    ],
  },
  topResources: [
    {
      id: 9,
      name: "GitLab",
      url: "https://gitlab.example",
      description: "Source code",
      icon: "icon:code",
      categoryPath: "Engineering / Code",
      tags: ["dev"],
      status: "online",
      visits: 10,
      uniqueVisitors: 4,
    },
  ],
  categories: [{ id: 3, name: "Engineering", value: 8 }],
  tags: [{ name: "dev", value: 6 }],
  statuses: [
    { name: "online", value: 10 },
    { name: "offline", value: 1 },
    { name: "unknown", value: 1 },
  ],
};

beforeEach(() => {
  localStorage.setItem("navpilot_locale", "zh-CN");
  api.getPublicInsights.mockResolvedValue(data);
  api.clickItem.mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("public-space insights", () => {
  it("loads the selected period and opens popular terms in global search", async () => {
    const searchEvent = vi.fn();
    window.addEventListener("navpilot:global-search", searchEvent);
    render(
      <LocaleProvider>
        <PublicInsights
          theme="dark"
          onThemeChange={() => {}}
          branding={{ siteName: "NavPilot" }}
          settings={{
            enabled: true,
            anonymousEnabled: false,
            searchMinCount: 3,
          }}
        />
      </LocaleProvider>,
    );
    await screen.findByRole("heading", { name: "公共空间洞察" });
    await waitFor(() => expect(api.getPublicInsights).toHaveBeenCalledWith(30));
    fireEvent.pointerEnter(
      screen.getAllByLabelText(/2026年8月11日.*访问次数 10/)[0],
      { clientX: 320, clientY: 260 },
    );
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toContain("访问次数");
    expect(tooltip.textContent).toContain("10");
    const chart = screen.getAllByRole("img")[0];
    expect(
      chart.querySelector(".public-chart-line")?.getAttribute("d"),
    ).toContain(" C ");
    expect(chart.querySelectorAll(".public-chart-crosshair line")).toHaveLength(
      2,
    );
    expect(chart.querySelector(".public-chart-series circle")).toBeNull();
    expect(
      chart.parentElement.querySelectorAll(".public-chart-markers > i"),
    ).toHaveLength(data.accessTrend.length * 3);
    expect(
      chart.parentElement.querySelectorAll(".public-chart-markers > i.active"),
    ).toHaveLength(3);
    expect(
      chart.parentElement.querySelectorAll(".public-chart-y-axis > span"),
    ).toHaveLength(5);
    const cloudTerm = screen.getAllByRole("button", { name: "GitLab" })[0];
    expect(cloudTerm.style.getPropertyValue("--term-size")).toBe("30px");
    fireEvent.pointerEnter(cloudTerm, { clientX: 500, clientY: 300 });
    const termTooltip = (await screen.findAllByRole("tooltip")).find((element) =>
      element.textContent.includes("搜索次数"),
    );
    expect(termTooltip.textContent).toContain("搜索次数");
    expect(termTooltip.textContent).toContain("8");
    const rankingButtons = document.querySelectorAll(
      ".public-term-ranking > button",
    );
    expect(rankingButtons).toHaveLength(10);
    expect(
      [...rankingButtons].some((button) => button.textContent.includes("Eleventh")),
    ).toBe(false);
    fireEvent.click(screen.getAllByRole("button", { name: /GitLab/ })[0]);
    expect(searchEvent).toHaveBeenCalled();
    expect(searchEvent.mock.calls[0][0].detail.query).toBe("GitLab");
    window.removeEventListener("navpilot:global-search", searchEvent);
  });
});
