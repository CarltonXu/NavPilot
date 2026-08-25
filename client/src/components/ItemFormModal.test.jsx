import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LocaleProvider } from "../i18n/LocaleContext.jsx";
import ItemFormModal from "./ItemFormModal.jsx";

afterEach(cleanup);

describe("ItemFormModal", () => {
  it("uses a separate access panel and fixed action region for public resources", () => {
    localStorage.setItem("navpilot_locale", "zh-CN");
    render(
      <LocaleProvider>
        <ItemFormModal
          categories={[]}
          scope="public"
          onClose={() => {}}
          onSubmit={() => {}}
        />
      </LocaleProvider>,
    );
    const dialog = screen.getByRole("dialog", { name:"新增导航条目" });
    const body = dialog.querySelector(".item-form-body.has-access");
    const main = dialog.querySelector(".item-form-main-panel");
    const access = dialog.querySelector(".item-form-access-panel");
    const actions = dialog.querySelector(".item-form-actions");
    expect(dialog.classList.contains("with-access")).toBe(true);
    expect(body.children[0]).toBe(main);
    expect(body.children[1]).toBe(access);
    expect(body.contains(actions)).toBe(false);
    expect(within(access).getByRole("radio", { name:"继承上级分类" })).toBeTruthy();
  });

  it("shows the current website icon value as an editable field", () => {
    localStorage.setItem("navpilot_locale", "zh-CN");
    render(
      <LocaleProvider>
        <ItemFormModal item={{ icon:"https://example.com/favicon.ico" }} categories={[]} scope="personal" onClose={() => {}} onSubmit={() => {}} />
      </LocaleProvider>,
    );
    const nameInput = screen.getByPlaceholderText("例如：内部 Wiki");
    const iconInput = screen.getByRole("textbox", { name:"图标 URL" });
    expect(iconInput.value).toBe("https://example.com/favicon.ico");
    expect(iconInput.closest(".form-grid-2")).toBe(nameInput.closest(".form-grid-2"));
    const iconButton = screen.getByRole("button", { name:"选择图标" });
    expect(iconButton.classList.contains("icon-only")).toBe(true);
    expect(iconButton.textContent).not.toContain("选择图标");
    fireEvent.change(iconInput, { target:{ value:"https://cdn.example.com/custom.svg" } });
    expect(iconInput.value).toBe("https://cdn.example.com/custom.svg");
  });

  it("uses the selected category supplied by the create action as its default", () => {
    localStorage.setItem("navpilot_locale", "zh-CN");
    render(
      <LocaleProvider>
        <ItemFormModal
          item={{ category_id:7 }}
          categories={[{ id:7, name:"研发工具", path_label:"研发 / 工具", parent_id:null }]}
          scope="personal"
          onClose={() => {}}
          onSubmit={() => {}}
        />
      </LocaleProvider>,
    );
    expect(screen.getAllByRole("combobox")[0].value).toBe("7");
    expect(screen.getByRole("option", { name:"研发工具" }).selected).toBe(true);
  });

  it("chooses grouped vector icons from the dedicated dialog", () => {
    localStorage.setItem("navpilot_locale", "zh-CN");
    render(
      <LocaleProvider>
        <ItemFormModal
          categories={[]}
          scope="personal"
          onClose={() => {}}
          onSubmit={() => {}}
        />
      </LocaleProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name:"选择图标" }));
    const picker = screen.getByRole("dialog", { name:"图标" });
    fireEvent.click(within(picker).getByRole("button", { name:/^安全13$/ }));
    fireEvent.click(within(picker).getByRole("button", { name:/选择图标 安全认证 Shield check/ }));
    fireEvent.click(within(picker).getByRole("button", { name:"确认" }));
    expect(screen.getByRole("textbox", { name:"图标 URL" }).value).toBe("icon:shieldCheck");
  });

  it("accepts a custom remote icon URL from the icon dialog", () => {
    localStorage.setItem("navpilot_locale", "zh-CN");
    render(
      <LocaleProvider>
        <ItemFormModal categories={[]} scope="personal" onClose={() => {}} onSubmit={() => {}} />
      </LocaleProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name:"选择图标" }));
    const picker = screen.getByRole("dialog", { name:"图标" });
    fireEvent.change(within(picker).getByRole("textbox", { name:"自定义图标 URL" }), { target:{ value:"https://example.com/icon.svg" } });
    fireEvent.click(within(picker).getByRole("button", { name:"确认" }));
    expect(screen.getByRole("textbox", { name:"图标 URL" }).value).toBe("https://example.com/icon.svg");
  });
});
