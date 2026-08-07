import { useState, useEffect } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useTurnstile } from "./useTurnstile";

function TestHarness() {
  const { containerRef, token, reset, siteKeyMissing } = useTurnstile();
  return (
    <div>
      <div data-testid="container" ref={containerRef} />
      <span data-testid="token">{token ?? "none"}</span>
      <span data-testid="missing">{String(siteKeyMissing)}</span>
      <button onClick={reset}>reset</button>
    </div>
  );
}

describe("useTurnstile", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "test-site-key");
    window.turnstile = {
      render: vi.fn(() => "widget-1"),
      reset: vi.fn(),
      remove: vi.fn(),
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.turnstile;
  });

  it("renders the widget into containerRef once the script/API is available", async () => {
    render(<TestHarness />);
    await waitFor(() => expect(window.turnstile!.render).toHaveBeenCalledTimes(1));
    const [containerArg] = (window.turnstile!.render as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(containerArg).toBe(screen.getByTestId("container"));
  });

  it("sets token when the widget's callback fires", async () => {
    render(<TestHarness />);
    await waitFor(() => expect(window.turnstile!.render).toHaveBeenCalledTimes(1));
    const [, options] = (window.turnstile!.render as ReturnType<typeof vi.fn>).mock.calls[0];
    options.callback("solved-token-abc");
    await waitFor(() => expect(screen.getByTestId("token").textContent).toBe("solved-token-abc"));
  });

  it("reports siteKeyMissing when VITE_TURNSTILE_SITE_KEY is unset", () => {
    // Explicitly stub to empty rather than relying on vi.unstubAllEnvs() to "revert to
    // unset" - unstubAllEnvs() restores whatever real .env value Vite loaded at test-runner
    // startup, which is non-empty on this machine now that the site key is configured.
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
    render(<TestHarness />);
    expect(screen.getByTestId("missing").textContent).toBe("true");
    expect(window.turnstile!.render).not.toHaveBeenCalled();
  });

  it("reset() clears the token and calls window.turnstile.reset with the widget id", async () => {
    render(<TestHarness />);
    await waitFor(() => expect(window.turnstile!.render).toHaveBeenCalledTimes(1));
    const [, options] = (window.turnstile!.render as ReturnType<typeof vi.fn>).mock.calls[0];
    options.callback("solved-token-abc");
    await waitFor(() => expect(screen.getByTestId("token").textContent).toBe("solved-token-abc"));

    screen.getByText("reset").click();
    expect(window.turnstile!.reset).toHaveBeenCalledWith("widget-1");
    await waitFor(() => expect(screen.getByTestId("token").textContent).toBe("none"));
  });

  it("renders the widget successfully when containerRef is attached AFTER initial async loading (regression test)", async () => {
    function DelayedHarness() {
      const [loading, setLoading] = useState(true);
      const { containerRef } = useTurnstile();

      useEffect(() => {
        const timer = setTimeout(() => setLoading(false), 20);
        return () => clearTimeout(timer);
      }, []);

      if (loading) return <div>Loading...</div>;
      return <div data-testid="delayed-container" ref={containerRef} />;
    }

    render(<DelayedHarness />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(window.turnstile!.render).not.toHaveBeenCalled();

    await waitFor(() => expect(screen.getByTestId("delayed-container")).toBeInTheDocument());
    await waitFor(() => expect(window.turnstile!.render).toHaveBeenCalledTimes(1));
    const [containerArg] = (window.turnstile!.render as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(containerArg).toBe(screen.getByTestId("delayed-container"));
  });
});

describe("useTurnstile - script loading (regression: exact Cloudflare hostname)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.turnstile;
    document.head.querySelectorAll("script[src*='cloudflare']").forEach((el) => el.remove());
  });

  // The other describe block always pre-stubs window.turnstile, which short-circuits
  // loadTurnstileScript() before it ever injects a <script> tag - so a typo'd hostname
  // there would never be caught. This test forces the real injection path.
  it("injects a <script> tag pointed at the real Turnstile API URL and renders once it loads", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "test-site-key");
    render(<TestHarness />);

    await waitFor(() => {
      expect(document.head.querySelector("script[src*='cloudflare']")).not.toBeNull();
    });
    const script = document.head.querySelector("script[src*='cloudflare']") as HTMLScriptElement;
    expect(script.src).toBe("https://challenges.cloudflare.com/turnstile/v0/api.js");

    window.turnstile = { render: vi.fn(() => "widget-1"), reset: vi.fn(), remove: vi.fn() };
    script.onload?.(new Event("load"));

    await waitFor(() => expect(window.turnstile!.render).toHaveBeenCalledTimes(1));
  });
});
