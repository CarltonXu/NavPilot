import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../i18n/LocaleContext.jsx";
import { api } from "../api.js";
import AvailabilityManagement from "./AvailabilityManagement.jsx";

vi.mock("../api.js", () => ({ api:{ getAdminAvailability:vi.fn(), checkAdminAvailabilityItem:vi.fn(), checkAdminAvailabilityAll:vi.fn(), getItemAvailability:vi.fn() } }));

const daily = Array.from({length:30},(_,index)=>({date:`2026-07-${String(index+1).padStart(2,"0")}`,status:"online",checks:1,availability:100,averageLatencyMs:120}));
const items = [
  {itemId:1,name:"GitLab",url:"https://gitlab.example",scope:"public",categoryName:"研发",checkEnabled:true,state:"online",latencyMs:120,lastCheckedAtMs:Date.now(),availability:100,daily},
  {itemId:2,name:"Jenkins",url:"https://jenkins.example",scope:"public",categoryName:"研发",checkEnabled:true,state:"offline",latencyMs:null,lastCheckedAtMs:Date.now(),availability:80,daily:daily.map((row,index)=>({...row,status:index===29?"offline":"online"}))},
];

beforeEach(() => {
  localStorage.setItem("navpilot_locale", "zh-CN");
  api.getAdminAvailability.mockResolvedValue({summary:{total:2,monitored:2,online:1,degraded:0,offline:1,unknown:0},items});
  api.getItemAvailability.mockResolvedValue({...items[0],checks:30,events:[],incidents:[]});
  api.checkAdminAvailabilityItem.mockResolvedValue({status:"online",latencyMs:100});
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("AvailabilityManagement", () => {
  it("filters resources by uptime state and opens the shared detail dialog", async () => {
    const view = render(<LocaleProvider><AvailabilityManagement/></LocaleProvider>);
    expect(await screen.findByRole("button", {name:/GitLab 可用性详情/})).toBeTruthy();
    expect(view.container.querySelector('.availability-admin-row:first-child .availability-tooltip.below')).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", {name:/不可用/}));
    expect(screen.queryByRole("button", {name:/GitLab 可用性详情/})).toBeNull();
    fireEvent.click(screen.getByRole("button", {name:/Jenkins 可用性详情/}));
    expect(await screen.findByRole("dialog", {name:"Jenkins"})).toBeTruthy();
  });

  it("runs a manual resource check and refreshes the list", async () => {
    render(<LocaleProvider><AvailabilityManagement/></LocaleProvider>);
    fireEvent.click(await screen.findByRole("button", {name:"立即检测 GitLab"}));
    await waitFor(() => expect(api.checkAdminAvailabilityItem).toHaveBeenCalledWith(1));
    await waitFor(() => expect(api.getAdminAvailability).toHaveBeenCalledTimes(2));
  });
});
