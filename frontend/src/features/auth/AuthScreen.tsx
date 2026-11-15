import { type FormEvent, useEffect, useState } from "react";

import { ApiError, api } from "../../api/client";
import type { AuthOptions, UserOut } from "../../api/types";
import { Logo } from "../../components/brand/Logo";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/inputs";
import { Notice } from "../../components/ui/Notice";
import { Tabs } from "../../components/ui/Tabs";
import { DeparturesBoard } from "./DeparturesBoard";
import { PlaneHero } from "./plane/PlaneHero";

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

const MODE_TABS: { id: Mode; label: string }[] = [
  { id: "login", label: "Вход" },
  { id: "register", label: "Регистрация" },
];

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
  const formAlert = errors.form ? <Notice tone="error">{errors.form}</Notice> : null;

  return (
    <div className="grid gap-8 lg:grid-cols-5 lg:items-start">
      <div className="flex min-w-0 flex-col gap-6 lg:order-2 lg:col-span-2">
        <div className="flex flex-col gap-3">
          <h1 className="m-0">
            <Logo size="hero" />
          </h1>
          <p className="text-base text-ink-2">
            Прогноз спроса на авиабилеты из Москвы: выберите маршрут, дату и цену.
          </p>
        </div>

        {sessionExpired ? (
          <Notice tone="info" role="status">
            Сессия истекла, войдите снова
          </Notice>
        ) : null}

        <div className="rounded-board border border-line bg-paper-raised p-4">
          <Tabs idPrefix="auth" tabs={MODE_TABS} value={mode} onChange={switchMode}>
            {registrationClosed ? (
              <div className="flex flex-col gap-3 pt-6">
                <p role="status" className="py-4 text-center text-ink-2">
                  Регистрация закрыта
                </p>
                {formAlert}
              </div>
            ) : (
              <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 pt-6">
                {!isLogin ? (
                  <p className="text-sm text-ink-2">
                    Имя: 3–32 символа, латиница, цифры и знаки «_», «.», «-». Пароль: от 8 символов.
                  </p>
                ) : null}

                <Field id="auth-username" label="Имя пользователя" error={errors.username}>
                  {(control) => (
                    <Input
                      {...control}
                      name="username"
                      type="text"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  )}
                </Field>

                <Field id="auth-password" label="Пароль" error={errors.password}>
                  {(control) => (
                    <Input
                      {...control}
                      name="password"
                      type="password"
                      autoComplete={isLogin ? "current-password" : "new-password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  )}
                </Field>

                {formAlert}

                <Button
                  variant="primary"
                  type="submit"
                  block
                  disabled={busy}
                  loading={pending === "form"}
                  loadingLabel={isLogin ? "Входим…" : "Создаём аккаунт…"}
                >
                  {isLogin ? "Войти" : "Создать аккаунт"}
                </Button>
              </form>
            )}
          </Tabs>
        </div>

        {options.demo_enabled ? (
          <div className="flex flex-col gap-2">
            <Button
              variant="secondary"
              block
              disabled={busy}
              onClick={() => void run("demo", api.demo)}
            >
              Войти в демо-аккаунт
            </Button>
            <p className="text-sm text-ink-2">
              {"Аккаунт общий: расчёты и\u00a0история видны всем, кто в\u00a0него входит."}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-6 lg:order-1 lg:col-span-3">
        <PlaneHero />
        <DeparturesBoard />
      </div>
    </div>
  );
}
