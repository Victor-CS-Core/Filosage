"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { deferClientTask } from "@/lib/browser-compat";

type Theme = "light" | "dark";
const THEME_KEY = "erudoza-theme";
const LEGACY_THEME_KEY = "teach-theme";

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "light",
  toggle: () => undefined,
});

export function useTheme() {
  return useContext(ThemeContext);
}

function storedTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY) ?? localStorage.getItem(LEGACY_THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    deferClientTask(() => setTheme(storedTheme()));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggle = () => setTheme((current) => (current === "light" ? "dark" : "light"));

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}
