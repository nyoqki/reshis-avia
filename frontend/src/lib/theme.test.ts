import { afterEach, describe, expect, it } from "vitest";

import { applyTheme, getStoredTheme } from "./theme";

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
  window.localStorage.clear();
});

describe("applyTheme", () => {
  it.each(["light", "dark"] as const)("pins the %s theme on the root element", (theme) => {
    applyTheme(theme);
    expect(document.documentElement.getAttribute("data-theme")).toBe(theme);
    expect(document.documentElement.style.colorScheme).toBe(theme);
    expect(getStoredTheme()).toBe(theme);
  });

  it("«Авто» leaves the root unpinned so the CSS media query keeps following the OS", () => {
    applyTheme("dark");
    applyTheme("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("");
    expect(getStoredTheme()).toBe("system");
  });
});
