// Site-wide actions and state shared by the doctor site's components.
import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";
import { usePanelTheme } from "@/hooks/usePanelTheme";
import { dsScrollTo } from "./motion/scroll";

export const THEME_STORAGE_KEY = "doctylia-patient-theme";

export type DoctorTheme = { isDark: boolean; toggle: () => void };

/**
 * Patient-site theme state: follows the device until the patient picks one
 * (spec D3). Owned once by <DoctorThemeProvider> at the page root so the loading
 * and not-found states are themed too; components read it with useDoctorTheme().
 */
export function useDoctorThemeState(): DoctorTheme {
  const { mode, setTheme } = usePanelTheme(THEME_STORAGE_KEY, "system");
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true,
  );
  useEffect(() => {
    const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mql) return;
    const onChange = () => setSystemDark(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  const isDark = mode === "dark" || (mode === "system" && systemDark);

  // usePanelTheme applies the class in a passive effect (after paint), which shows
  // a light frame first for dark-mode patients. Apply it before paint as well.
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  return { isDark, toggle: () => setTheme(isDark ? "light" : "dark") };
}

export const DoctorThemeContext = createContext<DoctorTheme>({ isDark: false, toggle: () => {} });

export const useDoctorTheme = () => useContext(DoctorThemeContext);

/**
 * One tap to book from anywhere: scroll to the booking card itself (so the dates and times are on
 * screen, not two screens below the section heading). Falls back to the section while it is showing a
 * result (confirmation / failed payment) instead of the card.
 */
export const bookNow = () => {
  if (document.getElementById("booking-card")) dsScrollTo("booking-card");
  else dsScrollTo("booking", { focusSelector: "[data-booking-start]" });
};
