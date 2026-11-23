import { useEffect, useRef } from "react";
import { useNearViewport } from "@/hooks/useNearViewport";

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Public widget sitekey. Override with VITE_TURNSTILE_SITE_KEY if needed. */
export const TURNSTILE_SITE_KEY = "0x4AAAAAAEIBVX_7AEWMtPMj";

export function getTurnstileSiteKey(): string | null {
  const fromEnv = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0)
    return fromEnv.trim();
  return TURNSTILE_SITE_KEY;
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(
      SCRIPT_ID,
    ) as HTMLScriptElement | null;
    const finish = () => {
      if (window.turnstile) resolve();
      else reject(new Error("Turnstile failed to load"));
    };
    if (existing) {
      if (window.turnstile) {
        resolve();
        return;
      }
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Turnstile failed to load")),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = finish;
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Turnstile failed to load"));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

type TurnstileWidgetProps = {
  action: string;
  onToken: (token: string) => void;
  resetSignal?: number;
};

const TurnstileWidget = ({
  action,
  onToken,
  resetSignal = 0,
}: TurnstileWidgetProps) => {
  const siteKey = getTurnstileSiteKey();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  // Don't download/run the Cloudflare challenge during the initial page load: wait until
  // the widget is near the viewport. A visitor has to scroll here to submit the form, and
  // the token is requested well before they reach the submit button.
  const [observedRef, near] = useNearViewport<HTMLDivElement>("400px");
  const setContainer = (node: HTMLDivElement | null) => {
    containerRef.current = node;
    (observedRef as { current: HTMLDivElement | null }).current = node;
  };

  useEffect(() => {
    if (!siteKey || !containerRef.current || !near) return;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled) return;
        // Wait a frame so the container has its final layout width before
        // Turnstile measures it for `size: "flexible"` — rendering on the
        // very first paint can snapshot a too-narrow width and never resize.
        requestAnimationFrame(() => {
          if (
            cancelled ||
            !containerRef.current ||
            !window.turnstile ||
            widgetIdRef.current
          )
            return;
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            // Must be set: the edge functions reject tokens whose `action`
            // doesn't match what they expect ("contact", "booking", ...).
            action,
            theme: "light",
            size: "flexible",
            callback: (token: string) => onTokenRef.current(token),
            "expired-callback": () => onTokenRef.current(""),
            "error-callback": () => onTokenRef.current(""),
          });
        });
      })
      .catch(() => {
        onTokenRef.current("");
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, action, near]);

  useEffect(() => {
    if (!resetSignal || !widgetIdRef.current || !window.turnstile) return;
    onTokenRef.current("");
    window.turnstile.reset(widgetIdRef.current);
  }, [resetSignal]);

  if (!siteKey) return null;

  return <div ref={setContainer} className="flex min-h-[65px] w-full" />;
};

export default TurnstileWidget;
