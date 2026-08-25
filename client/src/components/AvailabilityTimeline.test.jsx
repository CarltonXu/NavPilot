import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../i18n/LocaleContext.jsx";
import { api } from "../api.js";
import { AvailabilityDetailModal, AvailabilityStrip } from "./AvailabilityTimeline.jsx";

vi.mock("../api.js", () => ({ api:{ getItemAvailability:vi.fn(), checkItem:vi.fn() } }));

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

beforeEach(() => {
  localStorage.setItem("navpilot_locale", "zh-CN");
  api.getItemAvailability.mockResolvedValue(availability);
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

  it("does not call an unloaded summary an awaiting first check", () => {
    render(<LocaleProvider><AvailabilityStrip value={null} /></LocaleProvider>);
    expect(screen.getByText("正在加载可用性")).toBeTruthy();
    expect(screen.queryByText("等待首次检测")).toBeNull();
  });

  it("loads the selected range and shows uptime detail metrics", async () => {
    render(<LocaleProvider><AvailabilityDetailModal item={{id:1,name:"GitLab",url:"https://gitlab.example"}} onClose={vi.fn()}/></LocaleProvider>);
    expect((await screen.findAllByText("99.98%")).length).toBe(2);
    expect(screen.getByText("当前周期内没有故障记录")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name:"7天" }));
    await waitFor(() => expect(api.getItemAvailability).toHaveBeenLastCalledWith(1, 7));
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
});
