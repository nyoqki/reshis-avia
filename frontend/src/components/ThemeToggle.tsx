import { useState } from "react";

import { applyTheme, getStoredTheme, type Theme } from "../lib/theme";

const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Theme, string> = {
  system: "Тема: как в системе",
  light: "Тема: светлая",
  dark: "Тема: тёмная",
};
const SHORT: Record<Theme, string> = { system: "Авто", light: "Светлая", dark: "Тёмная" };

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`${LABEL[theme]}. Нажмите, чтобы переключить`}
      onClick={() => {
        const next = NEXT[theme];
        applyTheme(next);
        setTheme(next);
      }}
    >
      {SHORT[theme]}
    </button>
  );
}
