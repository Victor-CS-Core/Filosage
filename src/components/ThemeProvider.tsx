"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { deferClientTask } from "@/lib/browser-compat";

type Theme = "light" | "dark";
const THEME_KEY = "filosage-theme";
const LEGACY_THEME_KEY = "teach-theme";

const ThemeContext = createContext<{ theme: Theme; restored: boolean; toggle: () => void }>({
  theme: "light",
  restored: false,
  toggle: () => undefined,
});

export function useTheme() {
  return useContext(ThemeContext);
}

function storedPreference(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_KEY) ?? localStorage.getItem(LEGACY_THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage can be unavailable in strict privacy modes; the applied theme remains usable.
  }
  return null;
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const themeColor = theme === "dark" ? "#071127" : "#FAFAF7";
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = themeColor;
  });
}

function persistTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
    localStorage.removeItem(LEGACY_THEME_KEY);
  } catch {
    // Keep the in-memory selection working when persistent storage is unavailable.
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [restored, setRestored] = useState(false);
  const preference = useRef<Theme | null>(null);

  useEffect(() => {
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    preference.current = storedPreference();
    const resolvedTheme = () => preference.current ?? (systemTheme.matches ? "dark" : "light");
    const savedTheme = resolvedTheme();
    // Only migrate an existing choice. Saving a system-derived value would
    // silently turn automatic appearance into a permanent user override.
    if (preference.current) persistTheme(preference.current);
    applyTheme(savedTheme);
    let active = true;
    deferClientTask(() => {
      if (!active) return;
      setTheme(resolvedTheme());
      setRestored(true);
    });

    const syncSystemTheme = () => {
      if (preference.current) return;
      const nextTheme = resolvedTheme();
      applyTheme(nextTheme);
      setTheme(nextTheme);
    };
    const syncThemeAcrossTabs = (event: StorageEvent) => {
      if (event.key !== null && event.key !== THEME_KEY && event.key !== LEGACY_THEME_KEY) return;
      preference.current = storedPreference();
      const nextTheme = resolvedTheme();
      applyTheme(nextTheme);
      setTheme(nextTheme);
    };
    systemTheme.addEventListener("change", syncSystemTheme);
    window.addEventListener("storage", syncThemeAcrossTabs);
    return () => {
      active = false;
      systemTheme.removeEventListener("change", syncSystemTheme);
      window.removeEventListener("storage", syncThemeAcrossTabs);
    };
  }, []);

  const toggle = useCallback(() => {
    const applied = document.documentElement.getAttribute("data-theme");
    const activeTheme = applied === "light" || applied === "dark" ? applied : theme;
    const nextTheme = activeTheme === "light" ? "dark" : "light";
    preference.current = nextTheme;
    applyTheme(nextTheme);
    persistTheme(nextTheme);
    setTheme(nextTheme);
    setRestored(true);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, restored, toggle }}>{children}</ThemeContext.Provider>;
}
