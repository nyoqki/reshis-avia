import { useState } from "react";

import { applyTheme, getStoredTheme, type Theme } from "../lib/theme";

const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Theme, string> = {
  system: "Тема: как в системе",
  light: "Тема: светлая",
  dark: "Тема: тёмная",
};
const SHORT: Record<Theme, string> = { system: "Авто", light: "Светлая", dark: "Тёмная" };

// The word alone («Авто») does not say what it switches; the icon does: half disc, sun, moon.
function ThemeIcon({ theme }: { theme: Theme }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {theme === "system" ? (
        <>
          <circle cx="8" cy="8" r="5.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 2.25a5.75 5.75 0 0 1 0 11.5z" fill="currentColor" />
        </>
      ) : theme === "light" ? (
        <>
          <circle cx="8" cy="8" r="3" fill="currentColor" />
          <path
            d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </>
      ) : (
        <path d="M13.5 9.5A5.5 5.5 0 1 1 6.5 2.5a4.5 4.5 0 0 0 7 7z" fill="currentColor" />
      )}
    </svg>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  return (
    <button
      type="button"
      className="theme-toggle inline-flex items-center gap-1.5"
      aria-label={`${LABEL[theme]}. Нажмите, чтобы переключить`}
      onClick={() => {
        const next = NEXT[theme];
        applyTheme(next);
        setTheme(next);
      }}
    >
      <ThemeIcon theme={theme} />
      {SHORT[theme]}
    </button>
  );
}
