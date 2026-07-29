import { Moon, Sun } from "lucide-react";
import type { ThemeMode } from "@/hooks/usePanelTheme";

interface Props {
  mode: ThemeMode;
  onChange: (m: ThemeMode) => void;
  className?: string;
}

/**
 * Simple sun/moon icon toggle. Switches between light and dark.
 * If current mode is "system", the next click sets an explicit mode
 * opposite to the currently-effective appearance.
 */
export default function ThemeToggle({ mode, onChange, className }: Props) {
  const systemDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const effectiveDark = mode === "dark" || (mode === "system" && systemDark);

  const toggle = () => onChange(effectiveDark ? "light" : "dark");

  return (
    <button
      type="button"
      aria-label={effectiveDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
      className={
        "w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors " +
        (className || "")
      }
    >
      {effectiveDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
