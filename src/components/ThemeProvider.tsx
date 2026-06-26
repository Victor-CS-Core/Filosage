"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

const ThemeContext = createContext<{
  theme: Theme;
  toggle: () => void;
}>({ theme: "light", toggle: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  // On mount: read persisted preference (or system preference)
  useEffect(() => {
    const stored = localStorage.getItem("teach-theme") as Theme | null;
    const preferred = stored
      ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(preferred);
    document.documentElement.setAttribute("data-theme", preferred);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("teach-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  // Render children only after mount to avoid hydration mismatch on data-theme
  if (!mounted) {
    // Render a transparent shell that has the same structure so layout doesn't jump
    return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
