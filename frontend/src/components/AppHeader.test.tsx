import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { UserOut } from "../api/types";
import { getStoredTheme } from "../lib/theme";
import { AppHeader } from "./AppHeader";

const DEMO_NOTE = "Общий демо-аккаунт: историю расчётов видят все, кто в него входит";
const DEMO: UserOut = { username: "demo", is_demo: true };
const ALICE: UserOut = { username: "alice", is_demo: false };

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
  window.localStorage.clear();
});

function renderHeader(user: UserOut = ALICE, onLoggedOut = () => {}) {
  render(<AppHeader user={user} onLoggedOut={onLoggedOut} />);
  return screen.getByRole("banner");
}

describe("AppHeader theme control", () => {
  it("AC17: choosing «Тёмная» pins data-theme=dark on the root and stores it; «Авто» removes the attribute", async () => {
    const user = userEvent.setup();
    const banner = renderHeader();

    await user.click(within(banner).getByRole("radio", { name: "Тёмная" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(getStoredTheme()).toBe("dark");

    await user.click(within(banner).getByRole("radio", { name: "Авто" }));
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(getStoredTheme()).toBe("system");
  });

  it("AC17: the initially checked radio follows the stored theme", () => {
    window.localStorage.setItem("rehis-theme", "light");
    const banner = renderHeader();

    expect(within(banner).getByRole("radio", { name: "Светлая" })).toBeChecked();
    expect(within(banner).getByRole("radio", { name: "Авто" })).not.toBeChecked();
    expect(within(banner).getByRole("radio", { name: "Тёмная" })).not.toBeChecked();
  });
});

describe("AppHeader demo notice", () => {
  it("AC1: a demo user sees the «демо» badge and the exact shared-demo notice inside the banner", () => {
    const banner = renderHeader(DEMO);

    expect(within(banner).getByText("демо", { exact: true })).toBeInTheDocument();
    expect(within(banner).getByText(DEMO_NOTE)).toBeInTheDocument();
  });

  it("AC1: a regular user sees neither the badge nor the notice", () => {
    const banner = renderHeader(ALICE);

    expect(within(banner).getByText("alice")).toBeInTheDocument();
    expect(within(banner).queryByText("демо", { exact: true })).not.toBeInTheDocument();
    expect(within(banner).queryByText(DEMO_NOTE)).not.toBeInTheDocument();
  });
});

describe("AppHeader logout", () => {
  it("AC19: a failing logout shows the error as an alert in the banner and re-enables «Выйти»", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: "Сервер недоступен" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    const onLoggedOut = vi.fn();
    const banner = renderHeader(ALICE, onLoggedOut);

    await userEvent.setup().click(within(banner).getByRole("button", { name: "Выйти" }));

    expect(await within(banner).findByRole("alert")).toBeInTheDocument();
    await waitFor(() =>
      expect(within(banner).getByRole("button", { name: "Выйти" })).toBeEnabled(),
    );
    expect(onLoggedOut).not.toHaveBeenCalled();
  });

  it("AC5: «Выйти» is disabled while the logout request is pending", async () => {
    let release: (r: Response) => void = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const banner = renderHeader(ALICE);

    await userEvent.setup().click(within(banner).getByRole("button", { name: "Выйти" }));

    await waitFor(() =>
      expect(within(banner).getByRole("button", { name: "Выйти" })).toBeDisabled(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release(new Response(null, { status: 204 }));
  });
});
