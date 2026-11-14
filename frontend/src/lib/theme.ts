export type Theme = "light" | "dark" | "system";

const KEY = "rehis-theme";

export function getStoredTheme(): Theme {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // storage unavailable
  }
  return "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(t: Theme): void {
  try {
    window.localStorage.setItem(KEY, t);
  } catch {
    // storage unavailable
  }
  const resolved = t === "system" ? (systemPrefersDark() ? "dark" : "light") : t;
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.style.colorScheme = resolved;
}
