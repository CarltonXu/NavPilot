import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LocaleProvider } from "../i18n/LocaleContext.jsx";
import ItemFormModal from "./ItemFormModal.jsx";

afterEach(cleanup);

describe("ItemFormModal", () => {
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
});
