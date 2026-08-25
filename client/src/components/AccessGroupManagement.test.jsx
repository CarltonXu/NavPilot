import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../i18n/LocaleContext.jsx";
import { api } from "../api.js";
import AccessGroupManagement from "./AccessGroupManagement.jsx";

vi.mock("../api.js", () => ({
  api: {
    listAccessGroups: vi.fn(),
    listUsers: vi.fn(),
    getAccessGroup: vi.fn(),
    updateAccessGroup: vi.fn(),
    updateAccessGroupMembers: vi.fn(),
    createAccessGroup: vi.fn(),
    deleteAccessGroup: vi.fn(),
  },
}));

const users = [
  { id:"u1", username:"zhangsan", displayName:"张三", role:"user", status:"active" },
  { id:"u2", username:"lisi", displayName:"李四", role:"user", status:"active" },
  { id:"admin1", username:"administrator", displayName:"平台管理员", role:"admin", status:"active" },
];
const group = {
  id:"g1",
  name:"研发团队",
  description:"产品研发成员",
  version:1,
  memberCount:1,
  resourceCount:3,
  members:[users[0]],
  authorization:{
    resources:[{id:11,name:"研发文档",url:"https://docs.example",expiresAtMs:null}],
    categories:[{id:21,name:"研发资源",expiresAtMs:null}],
    summary:{resourceCount:1,categoryCount:1,activeCount:2},
  },
};

beforeEach(() => {
  localStorage.setItem("navpilot_locale", "zh-CN");
  api.listAccessGroups.mockResolvedValue({
    groups:[group],
    stats:{ groupCount:1, membershipCount:1, resourceCount:3 },
  });
  api.listUsers.mockResolvedValue(users);
  api.getAccessGroup.mockResolvedValue(group);
  api.updateAccessGroup.mockResolvedValue({ ...group, version:2 });
  api.updateAccessGroupMembers.mockResolvedValue({
    ...group,
    version:3,
    memberCount:2,
    members:users.slice(0, 2),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AccessGroupManagement", () => {
  it("shows members as a filterable account directory", async () => {
    render(
      <LocaleProvider>
        <AccessGroupManagement />
      </LocaleProvider>,
    );

    expect(await screen.findByRole("button", { name:"移出 张三" })).toBeTruthy();
    expect(screen.getByRole("button", { name:"加入 李四" })).toBeTruthy();
    expect(screen.queryByText("平台管理员")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name:/未加入/ }));
    expect(screen.queryByRole("button", { name:"移出 张三" })).toBeNull();
    expect(screen.getByRole("button", { name:"加入 李四" })).toBeTruthy();
  });

  it("adds a member and saves the shared membership relation", async () => {
    render(
      <LocaleProvider>
        <AccessGroupManagement />
      </LocaleProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name:"加入 李四" }));
    fireEvent.click(screen.getByRole("button", { name:"保存修改" }));
    await waitFor(() =>
      expect(api.updateAccessGroupMembers).toHaveBeenCalledWith("g1", {
        userIds:["u1", "u2"],
        expectedVersion:2,
      }),
    );
  });

  it("shows resources and category defaults granted to the group", async () => {
    render(
      <LocaleProvider>
        <AccessGroupManagement />
      </LocaleProvider>,
    );

    fireEvent.click(await screen.findByRole("tab", { name:/授权详情/ }));
    expect(screen.getByText("研发文档")).toBeTruthy();
    expect(screen.getByText("研发资源")).toBeTruthy();
    expect(screen.getAllByText("当前组").length).toBe(2);
  });
});
