import type { UserOut } from "../api/types";

import { ThemeToggle } from "./ThemeToggle";

interface Props {
  user: UserOut;
  onLogout?: () => void;
}

export function AppHeader({ user, onLogout }: Props) {
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <span className="app-header__brand">Решись Авиа</span>
        <div className="app-header__actions">
          <span className="app-header__user">{user.username}</span>
          <ThemeToggle />
          {onLogout ? (
            <button type="button" className="theme-toggle" onClick={onLogout}>
              Выйти
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
