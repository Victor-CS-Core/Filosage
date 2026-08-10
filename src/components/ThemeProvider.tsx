"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
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

function storedTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY) ?? localStorage.getItem(LEGACY_THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage can be unavailable in strict privacy modes; the applied theme remains usable.
  }
  const applied = document.documentElement.getAttribute("data-theme");
  if (applied === "light" || applied === "dark") return applied;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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
  } catch {
    // Keep the in-memory selection working when persistent storage is unavailable.
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const savedTheme = storedTheme();
    applyTheme(savedTheme);
    deferClientTask(() => {
      setTheme(savedTheme);
      setRestored(true);
    });

    const syncThemeAcrossTabs = (event: StorageEvent) => {
      if (event.key !== THEME_KEY || (event.newValue !== "light" && event.newValue !== "dark")) return;
      applyTheme(event.newValue);
      setTheme(event.newValue);
    };
    window.addEventListener("storage", syncThemeAcrossTabs);
    return () => window.removeEventListener("storage", syncThemeAcrossTabs);
  }, []);

  useEffect(() => {
    if (!restored) return;
    applyTheme(theme);
    persistTheme(theme);
  }, [restored, theme]);

  const toggle = useCallback(() => {
    const applied = document.documentElement.getAttribute("data-theme");
    const activeTheme = applied === "light" || applied === "dark" ? applied : theme;
    const nextTheme = activeTheme === "light" ? "dark" : "light";
    applyTheme(nextTheme);
    persistTheme(nextTheme);
    setTheme(nextTheme);
    setRestored(true);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, restored, toggle }}>{children}</ThemeContext.Provider>;
}
