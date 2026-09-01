import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../i18n/LocaleContext.jsx";
import { api } from "../api.js";
import { AvailabilityDetailModal, AvailabilityStrip } from "./AvailabilityTimeline.jsx";

vi.mock("../api.js", () => ({ api:{ getItemAvailability:vi.fn(), getItemAvailabilityDay:vi.fn(), checkItem:vi.fn() } }));

const daily = Array.from({ length:30 }, (_, index) => ({
  date:`2026-07-${String(index + 1).padStart(2, "0")}`,
  status:index === 10 ? "offline" : "online",
  checks:12,
  availability:index === 10 ? 0 : 100,
  averageLatencyMs:180,
}));
const availability = {
  itemId:1,
  name:"GitLab",
  url:"https://gitlab.example",
  state:"online",
  availability:99.98,
  averageLatencyMs:180,
  lastCheckedAtMs:Date.now(),
  checks:360,
  daily,
  events:[{status:"online",latencyMs:180,checkedAtMs:Date.now()}],
  incidents:[],
};
const dayAvailability = {
  ...availability,
  date:"2026-07-11",
  state:"offline",
  availability:50,
  checks:2,
  events:[
    {status:"offline",latencyMs:null,checkedAtMs:Date.parse("2026-07-11T10:05:00Z")},
    {status:"online",latencyMs:180,checkedAtMs:Date.parse("2026-07-11T10:00:00Z")},
  ],
};

beforeEach(() => {
  localStorage.setItem("navpilot_locale", "zh-CN");
  api.getItemAvailability.mockResolvedValue(availability);
  api.getItemAvailabilityDay.mockResolvedValue(dayAvailability);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("AvailabilityTimeline", () => {
  it("renders uptime bars and opens details without following the resource link", () => {
    const open = vi.fn();
    render(<LocaleProvider><AvailabilityStrip value={availability} onOpen={open}/></LocaleProvider>);
    fireEvent.click(screen.getByRole("button", { name:/过去 30 天可用性/ }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.getByText("99.98%")).toBeTruthy();
  });

  it("opens the selected date when a daily point is clicked", () => {
    const open = vi.fn();
    const view = render(<LocaleProvider><AvailabilityStrip value={availability} onOpen={open}/></LocaleProvider>);
    fireEvent.click(view.container.querySelector('.availability-bars>i'));
    expect(open).toHaveBeenCalledWith("2026-07-01");
  });

  it("keeps every selected range on one dynamically sized timeline", () => {
    const ninetyDays = Array.from({length:90},(_,index)=>({date:new Date(Date.UTC(2026,3,1 + index)).toISOString().slice(0,10),status:"online",checks:1,availability:100}));
    const view = render(<LocaleProvider><AvailabilityStrip value={{...availability,daily:ninetyDays}} /></LocaleProvider>);
    const bars = view.container.querySelector(".availability-bars");
    expect(bars.style.getPropertyValue("--availability-bars")).toBe("90");
    expect(bars.children).toHaveLength(90);
  });

  it("can show a readable recent subset without changing the source range", () => {
    const view = render(<LocaleProvider><AvailabilityStrip value={availability} displayDays={7} /></LocaleProvider>);
    const bars = view.container.querySelector(".availability-bars");
    expect(bars.style.getPropertyValue("--availability-bars")).toBe("7");
    expect(bars.children).toHaveLength(7);
    expect(bars.children[0].querySelector(".availability-tooltip strong").textContent).toContain("7月24日");
  });

  it("does not call an unloaded summary an awaiting first check", () => {
    render(<LocaleProvider><AvailabilityStrip value={null} /></LocaleProvider>);
    expect(screen.getByText("正在加载可用性")).toBeTruthy();
    expect(screen.queryByText("等待首次检测")).toBeNull();
  });

  it("loads the selected range and shows uptime detail metrics", async () => {
    render(<LocaleProvider><AvailabilityDetailModal item={{id:1,name:"GitLab",url:"https://gitlab.example"}} onClose={vi.fn()}/></LocaleProvider>);
    expect((await screen.findAllByText("99.98%")).length).toBe(2);
    expect(screen.getByText("当前周期内没有故障记录")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name:"15天" }));
    await waitFor(() => expect(api.getItemAvailability).toHaveBeenLastCalledWith(1, 15));
  });

  it("shows chart axes, crosshair point and sample details on hover", async () => {
    render(<LocaleProvider><AvailabilityDetailModal item={{id:1,name:"GitLab",url:"https://gitlab.example"}} onClose={vi.fn()}/></LocaleProvider>);
    await screen.findByText("响应时间");
    const plot = document.querySelector(".availability-chart-plot");
    Object.defineProperty(plot, "getBoundingClientRect", { configurable:true, value:() => ({ left:0, width:400, top:0, height:160, right:400, bottom:160 }) });
    fireEvent.mouseMove(plot, { clientX:200, clientY:80 });
    expect(document.querySelector(".availability-chart-guides")).toBeTruthy();
    expect(document.querySelector(".availability-chart-point")).toBeTruthy();
    expect(screen.getAllByText("180 ms").length).toBeGreaterThanOrEqual(2);
    expect(document.querySelectorAll(".availability-chart-y-axis small")).toHaveLength(5);
    expect(document.querySelectorAll(".availability-chart-x-axis small")).toHaveLength(3);
    fireEvent.mouseLeave(plot);
    expect(document.querySelector(".availability-chart-tag")).toBeNull();
  });

  it("drills directly into all checks for an initial date and can return to overview", async () => {
    render(<LocaleProvider><AvailabilityDetailModal item={{id:1,name:"GitLab",url:"https://gitlab.example"}} initialDate="2026-07-11" onClose={vi.fn()}/></LocaleProvider>);
    await waitFor(() => expect(api.getItemAvailabilityDay).toHaveBeenCalledWith(1, "2026-07-11"));
    expect(await screen.findByText("单日探测记录")).toBeTruthy();
    expect(screen.getAllByText("当日可用率").length).toBeGreaterThan(0);
    expect(screen.getAllByText("50%").length).toBeGreaterThan(0);
    expect(document.querySelector(".availability-fixed-day")).toBeTruthy();
    expect(document.querySelectorAll(".availability-matrix-hour-head")).toHaveLength(24);
    expect(document.querySelectorAll(".availability-probe-point")).toHaveLength(2);
    expect(document.querySelectorAll(".availability-config-segment")).toHaveLength(1);
    expect(document.querySelector(".availability-hour-event-list")).toBeNull();
    expect(document.querySelector(".availability-hour-event-detail")).toBeNull();
    const hourButton = [...document.querySelectorAll('.availability-matrix-hour-head')].find((button) => button.textContent.startsWith("10:00"));
    const hourCard = hourButton.closest(".availability-matrix-hour");
    fireEvent.click(hourButton);
    expect(hourCard.classList.contains("active")).toBe(true);
    expect(document.querySelector(".availability-detail-columns header small").textContent).toContain("探测响应");
    fireEvent.click(hourButton);
    expect(hourCard.classList.contains("active")).toBe(false);
    const overviewButton = [...document.querySelectorAll(".availability-history-actions button")].find((button) => button.textContent === "每日概览");
    fireEvent.click(overviewButton);
    expect(screen.getByText("可用性历史")).toBeTruthy();
  });

  it("adapts the daily capsules to the interval stored with historical checks", async () => {
    api.getItemAvailabilityDay.mockResolvedValueOnce({
      ...dayAvailability,
      checkIntervalMinutes:15,
      events:[{status:"online",latencyMs:42,checkedAtMs:Date.parse("2026-07-11T10:15:00Z"),checkIntervalMinutes:15,triggerType:"scheduled"}],
    });
    render(<LocaleProvider><AvailabilityDetailModal item={{id:1,name:"GitLab",url:"https://gitlab.example"}} initialDate="2026-07-11" onClose={vi.fn()}/></LocaleProvider>);
    await waitFor(() => expect(api.getItemAvailabilityDay).toHaveBeenCalled());
    expect(document.querySelectorAll(".availability-probe-point.has-event")).toHaveLength(1);
    expect(document.querySelector(".availability-config-segment").textContent).toContain("每 15 分钟");
    expect(document.querySelector(".availability-probe-matrix").getAttribute("aria-label")).toBe("单日 24 小时探测矩阵");
  });

  it("uses a full-day timeline for multi-hour intervals", async () => {
    api.getItemAvailabilityDay.mockResolvedValueOnce({
      ...dayAvailability,
      checkIntervalMinutes:480,
      events:[{status:"online",latencyMs:42,checkedAtMs:Date.parse("2026-07-11T08:00:00Z"),checkIntervalMinutes:480,triggerType:"scheduled"}],
    });
    render(<LocaleProvider><AvailabilityDetailModal item={{id:1,name:"GitLab",url:"https://gitlab.example"}} initialDate="2026-07-11" onClose={vi.fn()}/></LocaleProvider>);
    await waitFor(() => expect(api.getItemAvailabilityDay).toHaveBeenCalled());
    expect(document.querySelector(".availability-fixed-day")).toBeTruthy();
    expect(document.querySelector(".availability-config-segment").textContent).toContain("每 8 小时");
    expect(document.querySelectorAll(".availability-probe-point.has-event")).toHaveLength(1);
  });

  it("keeps old and new check intervals as separate segments on the same day", async () => {
    api.getItemAvailabilityDay.mockResolvedValueOnce({
      ...dayAvailability,
      checkIntervalMinutes:60,
      checks:4,
      events:[
        {status:"online",latencyMs:40,checkedAtMs:Date.parse("2026-07-11T10:00:00Z"),checkIntervalMinutes:5,triggerType:"scheduled"},
        {status:"online",latencyMs:41,checkedAtMs:Date.parse("2026-07-11T10:05:00Z"),checkIntervalMinutes:5,triggerType:"scheduled"},
        {status:"online",latencyMs:42,checkedAtMs:Date.parse("2026-07-11T10:20:00Z"),checkIntervalMinutes:60,triggerType:"configuration"},
        {status:"online",latencyMs:43,checkedAtMs:Date.parse("2026-07-11T11:20:00Z"),checkIntervalMinutes:60,triggerType:"scheduled"},
      ],
    });
    render(<LocaleProvider><AvailabilityDetailModal item={{id:1,name:"GitLab",url:"https://gitlab.example"}} initialDate="2026-07-11" onClose={vi.fn()}/></LocaleProvider>);
    await waitFor(() => expect(api.getItemAvailabilityDay).toHaveBeenCalled());
    expect(screen.getByText("当天配置发生过变化，各阶段按生效时间独立展示")).toBeTruthy();
    expect(document.querySelector(".availability-probe-matrix").getAttribute("aria-label")).toBe("单日 24 小时探测矩阵");
    expect(document.querySelectorAll(".availability-probe-point.has-event")).toHaveLength(4);
    expect(document.querySelector(".availability-long-period-history")).toBeNull();
    expect(document.querySelector(".availability-fixed-day").textContent).toContain("每 5 分钟");
    expect(document.querySelector(".availability-fixed-day").textContent).toContain("每 1 小时");
  });

  it("lays a full day of five-minute checks into non-overlapping fixed slots", async () => {
    const from = Date.parse("2026-07-11T00:00:00Z");
    api.getItemAvailabilityDay.mockResolvedValueOnce({
      ...dayAvailability,
      fromAtMs:from,
      toAtMs:from + 24 * 60 * 60 * 1000,
      checkIntervalMinutes:5,
      checks:288,
      events:Array.from({length:288},(_,index) => ({
        status:"online",
        latencyMs:40 + index % 10,
        checkedAtMs:from + index * 5 * 60000,
        checkIntervalMinutes:5,
        triggerType:"scheduled",
      })),
    });
    render(<LocaleProvider><AvailabilityDetailModal item={{id:1,name:"GitLab",url:"https://gitlab.example"}} initialDate="2026-07-11" onClose={vi.fn()}/></LocaleProvider>);
    await waitFor(() => expect(api.getItemAvailabilityDay).toHaveBeenCalled());
    const scheduled = document.querySelector(".availability-probe-matrix");
    const points = [...scheduled.querySelectorAll(".availability-matrix-point")];
    expect(points).toHaveLength(288);
    expect(document.querySelectorAll(".availability-matrix-hour")).toHaveLength(24);
    expect(document.querySelectorAll(".availability-matrix-slots")).toHaveLength(24);
    expect(points.every((point) => point.style.gridColumn === "")).toBe(true);
  });
});
