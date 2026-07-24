export type Theme = "light" | "dark";

const KEY = "bpmn-modeler:theme:v2";

export function getStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

/** Light is the default; dark is an explicit user choice that persists. */
export function currentTheme(): Theme {
  return getStoredTheme() ?? "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* private mode — theme just won't persist */
  }
  applyTheme(theme);
}

export function initTheme() {
  applyTheme(currentTheme());
}
