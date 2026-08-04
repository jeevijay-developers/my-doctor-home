import { useEffect, useState } from "react";

const isDark = () => document.documentElement.classList.contains("dark");

/**
 * Reads the `.dark` class on <html> (toggled by usePanelTheme) and stays in
 * sync via MutationObserver, for code that can't rely on Tailwind's `dark:`
 * variant (e.g. canvas fillStyle).
 */
export function useIsDarkMode() {
  const [dark, setDark] = useState(isDark);

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return dark;
}
