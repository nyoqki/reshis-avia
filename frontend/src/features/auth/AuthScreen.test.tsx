import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthOptions, UserOut } from "../../api/types";
import { AppHeader } from "../../components/AppHeader";
import { AuthScreen } from "./AuthScreen";

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function stubFetch(options: AuthOptions, handler: Handler = () => json(500, {})) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/auth/options")) return json(200, options);
    return handler(url, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function callsTo(fetchMock: ReturnType<typeof stubFetch>, path: string) {
  return fetchMock.mock.calls.filter(([u]) => String(u).includes(path));
}

const OPEN: AuthOptions = { demo_enabled: true, registration_open: true };

afterEach(() => {
  vi.unstubAllGlobals();
});

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, name: string, pass: string) {
  await user.type(await screen.findByLabelText(/^Имя/), name);
  await user.type(screen.getByLabelText(/^Пароль/), pass);
  await user.keyboard("{Enter}");
}

async function openRegistration(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByText("Регистрация", { selector: "button, [role='tab']" }));
}

describe("AuthScreen demo entry", () => {
  it("AC2: shows the demo button and the shared-account note when demo is enabled", async () => {
    stubFetch(OPEN);
    render(<AuthScreen onAuthenticated={() => {}} />);

    expect(await screen.findByRole("button", { name: "Войти в демо-аккаунт" })).toBeInTheDocument();
    expect(screen.getByText(/общий/i)).toBeVisible();
  });

  it("AC2: hides the demo button when demo is disabled", async () => {
    stubFetch({ demo_enabled: false, registration_open: true });
    render(<AuthScreen onAuthenticated={() => {}} />);

    await screen.findByLabelText(/^Имя/);
    expect(screen.queryByRole("button", { name: /демо-аккаунт/ })).not.toBeInTheDocument();
  });

  it("AC2: clicking the demo button calls the demo endpoint and onAuthenticated", async () => {
    const demoUser: UserOut = { username: "demo", is_demo: true };
    const fetchMock = stubFetch(OPEN, (url) =>
      url.includes("/api/auth/demo") ? json(200, demoUser) : json(500, {}),
    );
    const onAuthenticated = vi.fn();
    render(<AuthScreen onAuthenticated={onAuthenticated} />);

    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Войти в демо-аккаунт" }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(demoUser));
    const [call] = callsTo(fetchMock, "/api/auth/demo");
    expect(call[1]?.method).toBe("POST");
  });

  it("AC2: the header of a demo user shows the shared-demo note as visible text", () => {
    render(<AppHeader user={{ username: "demo", is_demo: true }} onLoggedOut={() => {}} />);

    expect(screen.getByText("demo")).toBeInTheDocument();
    expect(
      screen.getByText("Общий демо-аккаунт: историю расчётов видят все, кто в него входит"),
    ).toBeVisible();
  });

  it("AC2: the header of a regular user has no shared-demo note", () => {
    render(<AppHeader user={{ username: "alice", is_demo: false }} onLoggedOut={() => {}} />);

    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.queryByText(/Общий демо-аккаунт/)).not.toBeInTheDocument();
  });
});

describe("AuthScreen registration", () => {
  it("AC3: a 409 shows the taken-name message", async () => {
    stubFetch(OPEN, () => json(409, { detail: "Это имя уже занято" }));
    const user = userEvent.setup();
    render(<AuthScreen onAuthenticated={() => {}} />);

    await openRegistration(user);
    await fillAndSubmit(user, "alice", "password123");

    expect(await screen.findByText("Это имя уже занято")).toBeVisible();
  });

  it("AC3: 422 field errors render for the username and the password", async () => {
    stubFetch(OPEN, () =>
      json(422, {
        detail: "Проверьте введённые данные.",
        fields: {
          username: "Имя: от 3 до 32 символов",
          password: "Пароль: не короче 8 символов",
        },
      }),
    );
    const user = userEvent.setup();
    render(<AuthScreen onAuthenticated={() => {}} />);

    await openRegistration(user);
    await fillAndSubmit(user, "ab", "short");

    expect(await screen.findByText("Имя: от 3 до 32 символов")).toBeVisible();
    expect(screen.getByText("Пароль: не короче 8 символов")).toBeVisible();
  });

  it("AC3: the registration form states the rules before submit and uses new-password", async () => {
    stubFetch(OPEN);
    const user = userEvent.setup();
    render(<AuthScreen onAuthenticated={() => {}} />);

    await openRegistration(user);

    expect(await screen.findByText(/3.{1,3}32 символа/)).toBeVisible();
    expect(screen.getByText(/от 8 символов/)).toBeVisible();
    const password = screen.getByLabelText(/^Пароль/);
    expect(password).toHaveAttribute("name", "password");
    expect(password).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText(/^Имя/)).toHaveAttribute("name", "username");
  });

  it("AC3: successful registration posts credentials and calls onAuthenticated", async () => {
    const created: UserOut = { username: "newbie", is_demo: false };
    const fetchMock = stubFetch(OPEN, (url) =>
      url.includes("/api/auth/register") ? json(200, created) : json(500, {}),
    );
    const onAuthenticated = vi.fn();
    const user = userEvent.setup();
    render(<AuthScreen onAuthenticated={onAuthenticated} />);

    await openRegistration(user);
    await fillAndSubmit(user, "newbie", "password123");

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(created));
    const [call] = callsTo(fetchMock, "/api/auth/register");
    expect(JSON.parse(String(call[1]?.body))).toEqual({
      username: "newbie",
      password: "password123",
    });
  });

  it("AC3: registration_open false shows 'Регистрация закрыта' and no registration form", async () => {
    stubFetch({ demo_enabled: true, registration_open: false });
    const user = userEvent.setup();
    render(<AuthScreen onAuthenticated={() => {}} />);

    await openRegistration(user);

    expect(await screen.findByText("Регистрация закрыта")).toBeVisible();
    expect(screen.queryByLabelText(/^Пароль/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Имя/)).not.toBeInTheDocument();
  });
});

describe("AuthScreen login", () => {
  it("AC4: a 401 shows the uniform message and clears the password", async () => {
    stubFetch(OPEN, () => json(401, { detail: "Неверное имя пользователя или пароль" }));
    const user = userEvent.setup();
    render(<AuthScreen onAuthenticated={() => {}} />);

    const username = await screen.findByLabelText(/^Имя/);
    expect(username).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText(/^Пароль/)).toHaveAttribute("autocomplete", "current-password");
    await fillAndSubmit(user, "alice", "wrongpass1");

    expect(await screen.findByText("Неверное имя пользователя или пароль")).toBeVisible();
    expect(screen.getByLabelText(/^Пароль/)).toHaveValue("");
  });

  it("AC4: a successful login calls onAuthenticated with the user", async () => {
    const alice: UserOut = { username: "alice", is_demo: false };
    stubFetch(OPEN, (url) => (url.includes("/api/auth/login") ? json(200, alice) : json(500, {})));
    const onAuthenticated = vi.fn();
    const user = userEvent.setup();
    render(<AuthScreen onAuthenticated={onAuthenticated} />);

    await fillAndSubmit(user, "alice", "password123");

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(alice));
  });

  it("AC5: a 429 shows the wait message with minutes", async () => {
    stubFetch(OPEN, () =>
      json(429, { detail: "Слишком много попыток входа." }, { "Retry-After": "180" }),
    );
    const user = userEvent.setup();
    render(<AuthScreen onAuthenticated={() => {}} />);

    await fillAndSubmit(user, "alice", "password123");

    expect(await screen.findByText(/3\s*мин/)).toBeVisible();
  });

  it("AC19: a network failure shows a readable message", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/auth/options")) return json(200, OPEN);
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<AuthScreen onAuthenticated={() => {}} />);

    await fillAndSubmit(user, "alice", "password123");

    expect(await screen.findByText(/Нет связи с сервером/)).toBeVisible();
  });

  it("AC19: the submit button is disabled with a loading label while pending", async () => {
    const fetchMock = stubFetch(OPEN, () => new Promise<Response>(() => {}));
    const user = userEvent.setup();
    const { container } = render(<AuthScreen onAuthenticated={() => {}} />);

    await fillAndSubmit(user, "alice", "password123");

    await waitFor(() => expect(callsTo(fetchMock, "/api/auth/login")).toHaveLength(1));
    const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(submit).not.toBeNull();
    expect(submit).toBeDisabled();
    expect(submit?.textContent).not.toBe("Войти");
    expect(submit?.textContent).toMatch(/…|\.\.\./);
    await user.click(submit as HTMLButtonElement);
    expect(callsTo(fetchMock, "/api/auth/login")).toHaveLength(1);
  });

  it("shows the session-expired notice when sessionExpired is true", async () => {
    stubFetch(OPEN);
    render(<AuthScreen onAuthenticated={() => {}} sessionExpired />);

    expect(await screen.findByText("Сессия истекла, войдите снова")).toBeVisible();
  });
});

describe("AppHeader logout", () => {
  it("AC6: «Выйти» calls the logout endpoint and then onLoggedOut", async () => {
    const fetchMock = stubFetch(OPEN, (url) =>
      url.includes("/api/auth/logout") ? new Response(null, { status: 204 }) : json(500, {}),
    );
    const onLoggedOut = vi.fn();
    render(<AppHeader user={{ username: "alice", is_demo: false }} onLoggedOut={onLoggedOut} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Выйти" }));

    await waitFor(() => expect(onLoggedOut).toHaveBeenCalledTimes(1));
    const [call] = callsTo(fetchMock, "/api/auth/logout");
    expect(call[1]?.method).toBe("POST");
  });
});

describe("AuthScreen layout", () => {
  it("AC8: exactly one departures board with five routes is on the login screen", async () => {
    stubFetch(OPEN);
    render(<AuthScreen onAuthenticated={() => {}} />);
    await screen.findByLabelText(/^Имя/);

    expect(screen.getAllByRole("heading", { name: "Направления из Москвы" })).toHaveLength(1);
    const tables = screen.getAllByRole("table");
    expect(tables).toHaveLength(1);
    expect(within(tables[0]).getAllByRole("row").slice(1)).toHaveLength(5);
    expect(screen.getAllByText("Прогноз на 01.06–01.07.2026")).toHaveLength(1);
  });

  it("AC9: exactly one plane still image is present and no canvas is shown in jsdom", async () => {
    stubFetch(OPEN);
    const { container } = render(<AuthScreen onAuthenticated={() => {}} />);
    await screen.findByLabelText(/^Имя/);

    expect(container.querySelectorAll("img")).toHaveLength(1);
    const canvases = container.querySelectorAll("canvas");
    expect(canvases.length).toBeLessThanOrEqual(1);
    for (const c of canvases) expect(c.dataset.visible).not.toBe("true");
  });

  it("AC1: the h1 names the product and precedes the auth card in DOM order", async () => {
    stubFetch(OPEN);
    render(<AuthScreen onAuthenticated={() => {}} />);
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading).toHaveAccessibleName("Решись Авиа");
    const username = screen.getByLabelText(/^Имя/);
    const board = screen.getByRole("table");
    expect(
      heading.compareDocumentPosition(username) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(username.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("AC5: ArrowRight on the «Вход» tab activates «Регистрация» and shows the rules hint", async () => {
    stubFetch(OPEN);
    const user = userEvent.setup();
    render(<AuthScreen onAuthenticated={() => {}} />);

    const login = await screen.findByRole("tab", { name: "Вход" });
    login.focus();
    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: "Регистрация" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      await screen.findByText(
        "Имя: 3–32 символа, латиница, цифры и знаки «_», «.», «-». Пароль: от 8 символов.",
      ),
    ).toBeVisible();
  });

  it("AC5: the session-expired notice has status semantics", async () => {
    stubFetch(OPEN);
    render(<AuthScreen onAuthenticated={() => {}} sessionExpired />);
    expect(await screen.findByRole("status")).toHaveTextContent("Сессия истекла, войдите снова");
  });
});
