import { type FormEvent, useEffect, useState } from "react";

import { ApiError, api } from "../../api/client";
import type { AuthOptions, UserOut } from "../../api/types";

interface Props {
  onAuthenticated: (user: UserOut) => void;
  sessionExpired?: boolean;
}

type Mode = "login" | "register";

interface FormErrors {
  form?: string;
  username?: string;
  password?: string;
}

const DEFAULT_OPTIONS: AuthOptions = { demo_enabled: false, registration_open: true };

const INPUT =
  "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-[invalid=true]:border-danger";
const PRIMARY =
  "min-h-11 w-full cursor-pointer rounded-lg bg-accent px-4 text-base font-semibold text-(--accent-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";

function describeError(error: unknown, mode: Mode): FormErrors {
  if (!(error instanceof ApiError)) {
    return { form: "Что-то пошло не так. Попробуйте ещё раз." };
  }
  if (error.status === 429) {
    const minutes =
      error.retryAfter === null ? null : Math.max(1, Math.ceil(error.retryAfter / 60));
    return {
      form:
        minutes === null
          ? "Слишком много попыток. Подождите немного и попробуйте снова."
          : `Слишком много попыток. Подождите ${minutes} мин и попробуйте снова.`,
    };
  }
  if (mode === "register" && error.status === 409) {
    return { username: error.detail };
  }
  if (error.status === 422 && (error.fields.username || error.fields.password)) {
    return { username: error.fields.username, password: error.fields.password };
  }
  return { form: error.detail };
}

export function AuthScreen({ onAuthenticated, sessionExpired = false }: Props) {
  const [options, setOptions] = useState<AuthOptions>(DEFAULT_OPTIONS);
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState<"form" | "demo" | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .options()
      .then((o) => {
        if (!cancelled) setOptions(o);
      })
      .catch(() => {
        // keep the defaults: the form still works, the demo button stays hidden
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setErrors({});
    setPassword("");
  }

  async function run(kind: "form" | "demo", call: () => Promise<UserOut>) {
    if (pending) return;
    setPending(kind);
    setErrors({});
    try {
      onAuthenticated(await call());
    } catch (e) {
      setErrors(describeError(e, mode));
      setPassword("");
      setPending(null);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const credentials = { username: username.trim(), password };
    void run("form", () => (mode === "login" ? api.login(credentials) : api.register(credentials)));
  }

  const isLogin = mode === "login";
  const registrationClosed = !isLogin && !options.registration_open;
  const busy = pending !== null;
  // Shared by the form and the closed-registration notice: a demo-login error must show in both.
  const formAlert = errors.form ? (
    <p role="alert" className="text-sm text-danger">
      {errors.form}
    </p>
  ) : null;

  return (
    <div className="mx-auto w-full max-w-md py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Решись Авиа</h1>
      <p className="mb-6 text-muted">Прогноз спроса на авиабилеты по вашим маршрутам.</p>

      {sessionExpired ? (
        <p role="status" className="mb-4 rounded-lg border border-border bg-surface px-3 py-2">
          Сессия истекла, войдите снова
        </p>
      ) : null}

      <div className="rounded-xl border border-border bg-surface p-5">
        <div role="tablist" className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-bg p-1">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              className={`min-h-10 cursor-pointer rounded-md text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent ${
                mode === m ? "bg-surface text-text shadow-sm" : "text-muted"
              }`}
            >
              {m === "login" ? "Вход" : "Регистрация"}
            </button>
          ))}
        </div>

        {registrationClosed ? (
          <div className="grid gap-2">
            <p role="status" className="py-4 text-center text-muted">
              Регистрация закрыта
            </p>
            {formAlert}
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            {!isLogin ? (
              <p className="text-sm text-muted">
                Имя: 3–32 символа, латиница, цифры и знаки «_», «.», «-». Пароль: от 8 символов.
              </p>
            ) : null}

            <div className="grid gap-1.5">
              <label htmlFor="auth-username" className="text-sm font-medium">
                Имя пользователя
              </label>
              <input
                id="auth-username"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                aria-invalid={errors.username ? true : undefined}
                aria-describedby={errors.username ? "auth-username-error" : undefined}
                className={INPUT}
              />
              {errors.username ? (
                <p id="auth-username-error" className="text-sm text-danger">
                  {errors.username}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="auth-password" className="text-sm font-medium">
                Пароль
              </label>
              <input
                id="auth-password"
                name="password"
                type="password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? "auth-password-error" : undefined}
                className={INPUT}
              />
              {errors.password ? (
                <p id="auth-password-error" className="text-sm text-danger">
                  {errors.password}
                </p>
              ) : null}
            </div>

            {formAlert}

            <button type="submit" disabled={busy} className={PRIMARY}>
              {pending === "form"
                ? isLogin
                  ? "Входим…"
                  : "Создаём аккаунт…"
                : isLogin
                  ? "Войти"
                  : "Создать аккаунт"}
            </button>
          </form>
        )}
      </div>

      {options.demo_enabled ? (
        <div className="mt-6 grid gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run("demo", api.demo)}
            className="min-h-11 w-full cursor-pointer rounded-lg border border-accent bg-transparent px-4 text-base font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            Войти в демо-аккаунт
          </button>
          <p className="text-sm text-muted">
            Аккаунт общий: расчёты и история видны всем, кто в него входит.
          </p>
        </div>
      ) : null}
    </div>
  );
}
