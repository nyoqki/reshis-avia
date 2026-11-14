import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";

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

afterEach(() => {
  vi.unstubAllGlobals();
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
});
