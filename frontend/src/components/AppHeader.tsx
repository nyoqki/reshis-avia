import { useState } from "react";

import { api } from "../api/client";
import type { UserOut } from "../api/types";

import { ThemeToggle } from "./ThemeToggle";

interface Props {
  user: UserOut;
  onLoggedOut: () => void;
}

export function AppHeader({ user, onLoggedOut }: Props) {
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
    <header className="app-header">
      <div className="app-header__inner">
        <span className="app-header__brand">Решись Авиа</span>
        <div className="app-header__actions">
          <span className="app-header__user">{user.username}</span>
          {user.is_demo ? <span className="app-header__badge">демо</span> : null}
          <ThemeToggle />
          <button
            type="button"
            className="theme-toggle"
            disabled={pending}
            onClick={() => void logout()}
          >
            Выйти
          </button>
        </div>
      </div>
      {user.is_demo ? (
        <p className="app-header__note">
          Общий демо-аккаунт: историю расчётов видят все, кто в него входит
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="app-header__note app-header__note--error">
          {error}
        </p>
      ) : null}
    </header>
  );
}
