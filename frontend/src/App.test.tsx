import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { Logo } from "./components/brand/Logo";
import { resetOnceForTests } from "./lib/once";

function stubFetch(meStatus: number) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/me")) {
      return meStatus === 200
        ? new Response(JSON.stringify({ username: "alice", is_demo: false }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        : new Response(JSON.stringify({ detail: "Требуется вход" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
    }
    return new Response(JSON.stringify({ demo_enabled: true, registration_open: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  resetOnceForTests();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
  window.localStorage.clear();
});

describe("App session routing", () => {
  it("AC1: shows the header with the username when /api/me returns 200", async () => {
    stubFetch(200);

    render(<App />);

    expect(await screen.findByText("alice")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("AC1: shows the anonymous slot without the header when /api/me returns 401", async () => {
    const fetchMock = stubFetch(401);

    render(<App />);

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/api/me"))).toBe(true);
    });
    // wait for the session to settle: the skeleton is gone and no user is shown
    await waitFor(() => {
      expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("alice")).not.toBeInTheDocument();
  });

  it("AC17: the banner holds a radio group «Тема» with radios Авто, Светлая, Тёмная", async () => {
    stubFetch(200);

    render(<App />);

    const banner = await screen.findByRole("banner");
    const group = within(banner).getByRole("group", { name: "Тема" });
    for (const name of ["Авто", "Светлая", "Тёмная"]) {
      expect(within(group).getByRole("radio", { name })).toBeInTheDocument();
    }
    await userEvent.setup().click(within(group).getByRole("radio", { name: "Тёмная" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("AC7: the banner heading is named «Решись Авиа»", async () => {
    stubFetch(200);

    render(<App />);

    const banner = await screen.findByRole("banner");
    expect(
      within(banner).getByRole("heading", { level: 1, name: "Решись Авиа" }),
    ).toBeInTheDocument();
  });

  it("AC7: the header logo plays its intro on its first mount even when a hero logo mounted earlier in the page load", async () => {
    stubFetch(200);
    const hero = render(<Logo size="hero" />);
    expect(hero.container.querySelector("[data-intro]")?.getAttribute("data-intro")).toBe("true");

    render(<App />);

    const banner = await screen.findByRole("banner");
    const logo = within(banner).getByRole("img", { name: "Решись Авиа" });
    expect(logo.getAttribute("data-intro")).toBe("true");
    expect(logo.getAttribute("data-size")).toBe("header");
  });
});
