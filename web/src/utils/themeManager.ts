/**
 * Theme Manager - Handles light/dark mode and theme preferences
 */

type Theme = "light" | "dark" | "auto";

const THEME_KEY = "voicegpt_theme";

/**
 * Get current theme preference
 */
export function getTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY) as Theme | null;
  return stored || "auto";
}

/**
 * Set theme preference
 */
export function setTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

/**
 * Apply theme to document
 */
export function applyTheme(theme: Theme): void {
  const html = document.documentElement;
  // Force light theme - ignore system preference
  html.style.colorScheme = "light";
  html.classList.remove("dark-mode");
}

/**
 * Initialize theme on app load
 */
export function initializeTheme(): void {
  // Force light theme on initialization
  applyTheme("light");
}

/**
 * Toggle between light and dark mode
 */
export function toggleTheme(): Theme {
  const current = getTheme();
  const next: Theme = current === "light" ? "dark" : "light";
  setTheme(next);
  return next;
}

