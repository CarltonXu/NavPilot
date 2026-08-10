import { describe, expect, it } from "vitest";
import { browserPreference } from "./browserPreference.js";

describe("browserPreference", () => {
  it("uses account preferences only when the browser has no local choice", () => {
    expect(browserPreference(null, "public", "public")).toBe("public");
    expect(browserPreference("personal", "public", "public")).toBe("personal");
    expect(browserPreference("midnight", "light", "dark")).toBe("midnight");
  });
});
