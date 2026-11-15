import { useState, useSyncExternalStore } from "react";

import { api } from "../api/client";
import type { UserOut } from "../api/types";

import { Logo } from "./brand/Logo";
import { ThemeToggle } from "./ThemeToggle";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Notice } from "./ui/Notice";

// Below Tailwind's sm breakpoint (40rem) the theme control shows icons only.
const PHONE_QUERY = "(max-width: 39.999rem)";

// One slim line under the header row: the name and the badge already say «demo».
const DEMO_NOTE = "Общий демо-аккаунт: историю расчётов видят все, кто в\u00a0него входит";

function subscribePhone(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(PHONE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function isPhone(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches;
}

interface Props {
  user: UserOut;
  onLoggedOut: () => void;
}

export function AppHeader({ user, onLoggedOut }: Props) {
  const phone = useSyncExternalStore(subscribePhone, isPhone, () => false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await api.logout();
      onLoggedOut();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не\u00a0удалось выйти. Попробуйте ещё раз.");
      setPending(false);
    }
  }

  // Below lg the header takes two rows: the logo with «Выйти», then the name and the theme control.
  // From lg one row: logo, name, theme control, «Выйти». DOM order follows the wide layout.
  return (
    <header className="border-b border-line bg-paper-raised">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <h1 className="order-1 m-0 flex items-center">
          <Logo size="header" />
        </h1>
        <div className="order-3 flex w-full min-w-0 items-center gap-3 lg:order-2 lg:ml-auto lg:w-auto">
          <span title={user.username} className="min-w-0 truncate text-sm text-ink-2">
            {user.username}
          </span>
          {user.is_demo ? (
            <Badge tone="demo" className="shrink-0">
              демо
            </Badge>
          ) : null}
          <div className="ml-auto shrink-0 lg:ml-0">
            <ThemeToggle compact={phone} />
          </div>
        </div>
        <Button
          variant="ghost"
          loading={pending}
          onClick={() => void logout()}
          className="order-2 ml-auto lg:order-3 lg:ml-0"
        >
          Выйти
        </Button>
      </div>
      {user.is_demo ? (
        <p className="mx-auto max-w-5xl px-4 pb-3 text-sm text-ink-2">{DEMO_NOTE}</p>
      ) : null}
      {error ? (
        <div className="mx-auto max-w-5xl px-4 pb-3">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
    </header>
  );
}
