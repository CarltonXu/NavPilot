import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../i18n/LocaleContext.jsx";
import ResourceOverview from "./ResourceOverview.jsx";

afterEach(cleanup);

describe("ResourceOverview", () => {
  it("organizes resources by usage, recency, health, and tags", () => {
    localStorage.setItem("navpilot_locale", "zh-CN");
    const onTagSelect = vi.fn();
    const items = [
      { id:1,name:"研发平台",click_count:12,status:"online",created_at:"2026-08-10",tags:["研发"] },
      { id:2,name:"旧文档",click_count:2,status:"offline",created_at:"2026-08-09",tags:["研发","文档"] },
    ];
    render(<LocaleProvider><ResourceOverview items={items} onTagSelect={onTagSelect} renderItems={(list)=><div>{list.map((item)=><span key={item.id}>{item.name}</span>)}</div>} /></LocaleProvider>);
    expect(screen.getByText("智能总览")).toBeTruthy();
    expect(screen.getByText("高频访问")).toBeTruthy();
    expect(screen.getByText("最近添加")).toBeTruthy();
    expect(screen.getByText("待确认状态")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name:/#研发/ }));
    expect(onTagSelect).toHaveBeenCalledWith("研发");
  });
});
