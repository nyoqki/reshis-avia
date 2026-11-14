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

export function applyTheme(t: Theme): void {
  try {
    window.localStorage.setItem(KEY, t);
  } catch {
    // storage unavailable
  }
  const root = document.documentElement;
  if (t === "system") {
    // Unpinned, the prefers-color-scheme rules in index.css follow the OS, also when it changes.
    root.removeAttribute("data-theme");
    root.style.colorScheme = "";
    return;
  }
  root.setAttribute("data-theme", t);
  root.style.colorScheme = t;
}
