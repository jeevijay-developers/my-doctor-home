import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

const resolveSystem = (): "light" | "dark" =>
  typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";

const applyClass = (effective: "light" | "dark") => {
  const root = document.documentElement;
  if (effective === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
};

/**
 * Panel-scoped theme. Adds `dark` class on <html> while the panel is mounted,
 * and removes it on unmount so the public site is unaffected.
 * Persists per-panel preference in localStorage.
 */
export function usePanelTheme(storageKey: string) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    const saved = window.localStorage.getItem(storageKey) as ThemeMode | null;
    return saved || "light";
  });

  useEffect(() => {
    const effective = mode === "system" ? resolveSystem() : mode;
    applyClass(effective);
    window.localStorage.setItem(storageKey, mode);

    let mql: MediaQueryList | null = null;
    const onChange = () => applyClass(resolveSystem());
    if (mode === "system") {
      mql = window.matchMedia("(prefers-color-scheme: dark)");
      mql.addEventListener("change", onChange);
    }
    return () => {
      if (mql) mql.removeEventListener("change", onChange);
      // Remove dark class on unmount so we don't leak into public site
      document.documentElement.classList.remove("dark");
    };
  }, [mode, storageKey]);

  const setTheme = useCallback((m: ThemeMode) => setMode(m), []);
  return { mode, setTheme };
}
