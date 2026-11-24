import type { ReactNode } from "react";
import { DoctorThemeContext, useDoctorThemeState } from "./siteActions";

const DoctorThemeProvider = ({ children }: { children: ReactNode }) => (
  <DoctorThemeContext.Provider value={useDoctorThemeState()}>{children}</DoctorThemeContext.Provider>
);

export default DoctorThemeProvider;
