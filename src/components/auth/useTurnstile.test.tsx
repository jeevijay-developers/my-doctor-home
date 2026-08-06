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
    // @ts-expect-error - test cleanup of a global we defined for the test
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
    vi.unstubAllEnvs();
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
});
