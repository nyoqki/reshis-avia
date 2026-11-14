import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, api, request } from "./client";

const NETWORK_MESSAGE = "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.";

function jsonResponse(body: unknown, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("request", () => {
  it("AC15: maps a 422 body to ApiError with detail and fields", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ detail: "Проверьте поля", fields: { price: "Слишком мало" } }, 422),
      );
    vi.stubGlobal("fetch", fetchMock);

    const err = await request("POST", "/api/forecast", {}).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.status).toBe(422);
    expect(apiErr.detail).toBe("Проверьте поля");
    expect(apiErr.fields).toEqual({ price: "Слишком мало" });
  });

  it("AC19: maps a fetch rejection to status 0 with the Russian network message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const err = await request("GET", "/api/me").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
    expect((err as ApiError).detail).toBe(NETWORK_MESSAGE);
  });

  it("AC19: exposes retryAfter from the Retry-After header on 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ detail: "Слишком много попыток" }, 429, { "Retry-After": "42" }),
        ),
    );

    const err = await api.login({ username: "a", password: "b" }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(429);
    expect((err as ApiError).retryAfter).toBe(42);
  });

  it("sends JSON Content-Type and same-origin credentials on POST", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ username: "a", is_demo: false }, 200));
    vi.stubGlobal("fetch", fetchMock);

    await request("POST", "/api/login", { username: "a", password: "b" });

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/login");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(new Headers(init.headers).get("Content-Type")).toContain("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ username: "a", password: "b" });
  });

  it("resolves undefined on 204", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(api.logout()).resolves.toBeUndefined();
  });
});
