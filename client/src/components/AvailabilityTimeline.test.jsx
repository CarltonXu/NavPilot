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
    expect(document.querySelectorAll(".availability-heatmap-row")).toHaveLength(24);
    expect(document.querySelectorAll(".availability-heatmap-slots")).toHaveLength(24);
    expect(document.querySelectorAll(".availability-heatmap-cell")).toHaveLength(24 * 12);
    expect(document.querySelector(".availability-hour-event-list")).toBeNull();
    expect(document.querySelectorAll(".availability-heatmap-cell:not(.unknown)")).toHaveLength(2);
    expect(document.querySelector(".availability-hour-event-detail")).toBeNull();
    const hourButton = document.querySelector(".availability-heatmap-hour:not(:disabled)");
    fireEvent.click(hourButton);
    expect(document.querySelector(".availability-heatmap-row.active")).toBeTruthy();
    expect(document.querySelector(".availability-detail-columns header small").textContent).toContain("探测响应");
    fireEvent.click(hourButton);
    expect(document.querySelector(".availability-heatmap-row.active")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name:"每日概览" }));
    expect(screen.getByText("可用性历史")).toBeTruthy();
  });
});
