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
      setError(e instanceof Error ? e.message : "Не удалось выйти. Попробуйте ещё раз.");
      setPending(false);
    }
  }

  return (
    <header className="border-b border-line bg-paper-raised">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <h1 className="m-0 flex items-center">
          <Logo size="header" />
        </h1>
        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-3">
          <span className="min-w-0 text-sm text-ink-2 [overflow-wrap:anywhere]">
            {user.username}
          </span>
          {user.is_demo ? <Badge tone="demo">демо</Badge> : null}
          <ThemeToggle compact={phone} />
          <Button variant="ghost" loading={pending} onClick={() => void logout()}>
            Выйти
          </Button>
        </div>
      </div>
      {user.is_demo ? (
        <div className="mx-auto max-w-5xl px-4 pb-3">
          <Notice tone="info">
            Общий демо-аккаунт: историю расчётов видят все, кто в него входит
          </Notice>
        </div>
      ) : null}
      {error ? (
        <div className="mx-auto max-w-5xl px-4 pb-3">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
    </header>
  );
}
