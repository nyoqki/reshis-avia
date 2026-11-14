import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthOptions } from "../../api/types";
import { AuthScreen } from "./AuthScreen";

type Handler = (url: string) => Response | Promise<Response>;

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function stubFetch(options: AuthOptions, handler: Handler = () => json(500, {})) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/auth/options")) return json(200, options);
    return handler(url);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function openRegistration(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByText("Регистрация", { selector: "button, [role='tab']" }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AuthScreen regressions", () => {
  it("AC3: the registration hint states the username and password rules in full", async () => {
    stubFetch({ demo_enabled: true, registration_open: true });
    const user = userEvent.setup();
    render(<AuthScreen onAuthenticated={() => {}} />);

    await openRegistration(user);

    expect(
      await screen.findByText(
        "Имя: 3–32 символа, латиница, цифры и знаки «_», «.», «-». Пароль: от 8 символов.",
      ),
    ).toBeVisible();
  });

  it("AC19: a failed demo login shows its error while registration is closed", async () => {
    stubFetch({ demo_enabled: true, registration_open: false }, (url) =>
      url.includes("/api/auth/demo")
        ? json(429, { detail: "Слишком много попыток." }, { "Retry-After": "120" })
        : json(500, {}),
    );
    const user = userEvent.setup();
    render(<AuthScreen onAuthenticated={() => {}} />);

    await openRegistration(user);
    await user.click(await screen.findByRole("button", { name: "Войти в демо-аккаунт" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Слишком много попыток. Подождите 2 мин и попробуйте снова.",
    );
  });
});
