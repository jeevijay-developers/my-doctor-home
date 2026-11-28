import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { prefetchForPath } from "./lib/doctorSite/prefetch";
import "./index.css";

// Doctor sites: start loading the doctor's data now, in parallel with the page's code.
prefetchForPath(window.location.pathname);
if (window.location.pathname === "/") void import("./pages/LandingPage");

createRoot(document.getElementById("root")!).render(<App />);
