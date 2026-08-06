# Phone (OTP) Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Phone + OTP as a second, tab-selectable authentication method on the doctor-facing `Auth.tsx` login/signup page, alongside the existing email/password method, protected by Cloudflare Turnstile CAPTCHA.

**Architecture:** A new `useTurnstile` hook owns the Turnstile widget lifecycle (script load, render, token, reset). A new `PhoneOtpForm` component owns the two-step phone flow (enter phone → enter OTP) and consumes `useTurnstile`. `Auth.tsx` gains an `authMethod` tab switcher and renders either the existing email `<form>` or `<PhoneOtpForm>`; a `handleAuthenticated` function is extracted from the existing email-login code path so both methods share the same post-login routing (admin check → dashboard/onboarding redirect).

**Tech Stack:** React 18 + TypeScript, Vite (`import.meta.env`), `@supabase/supabase-js` v2 (`signInWithOtp`, `verifyOtp`), Vitest + `@testing-library/react` (no `@testing-library/user-event` package available — use `fireEvent`), Tailwind (existing shadcn/ui `Button`/`Input`/`Label` components), Cloudflare Turnstile (loaded via script tag, no npm package added).

## Global Constraints

- No database migration in this feature — verified `handle_new_user()` (`supabase/migrations/20260320222228_...sql:75-90`) inserts into `profiles`/`user_roles` using only `NEW.id` and `NEW.raw_user_meta_data->>'full_name'`, never `NEW.email`, so phone-only signups (`email = null`) already work with the existing trigger.
- Do not change or break the existing email/password flow in `Auth.tsx` (signup, login, forgot password) — its JSX/logic is preserved as-is, only reorganized enough to extract the shared post-login redirect into `handleAuthenticated`.
- `authMethod` tabs render only when `mode !== "forgot"` — there is no phone-based password reset.
- CAPTCHA (Turnstile) token is required before any `signInWithOtp` call — no bypass path.
- `shouldCreateUser: true` only when `mode === "signup"`; `false` when `mode === "login"` (an unregistered phone number must not silently create an account from the login tab).
- New env var: `VITE_TURNSTILE_SITE_KEY` (public site key, safe for frontend). The Turnstile *secret* key is never added to this repo — it goes only into Supabase Dashboard → Authentication → Settings → Bot and Abuse Protection.
- No new npm dependencies — Turnstile is loaded via a plain `<script>` tag at runtime, not an npm package.

---

### Task 1: `useTurnstile` hook + Turnstile env var scaffolding

**Files:**
- Create: `src/components/auth/useTurnstile.ts`
- Test: `src/components/auth/useTurnstile.test.tsx`
- Modify: `.env` (add `VITE_TURNSTILE_SITE_KEY=` — local dev value, left blank until the user provides their real site key)
- Create: `.env.example` (new file — none currently exists; documents every `VITE_*` var the app needs, since `.env` is gitignored)

**Interfaces:**
- Produces: `useTurnstile(): { containerRef: React.RefObject<HTMLDivElement>; token: string | null; reset: () => void; siteKeyMissing: boolean }`, exported from `src/components/auth/useTurnstile.ts`. Later tasks mount `<div ref={containerRef} />` where the widget should render, read `token` to know if the challenge is solved, call `reset()` after every OTP-send attempt (success or failure — Turnstile tokens are single-use), and check `siteKeyMissing` to show a "not configured" state instead of a silently-broken widget.

- [ ] **Step 1: Write the failing test for the hook's core behavior**

Create `src/components/auth/useTurnstile.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/auth/useTurnstile.test.tsx`
Expected: FAIL — `Cannot find module './useTurnstile'` (file doesn't exist yet).

- [ ] **Step 3: Implement `useTurnstile`**

Create `src/components/auth/useTurnstile.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const TURNSTILE_SCRIPT_SRC = "https://challenge.cloudflare.com/turnstile/v0/api.js";
let scriptLoadPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Turnstile script"));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

export interface UseTurnstileResult {
  containerRef: React.RefObject<HTMLDivElement>;
  token: string | null;
  reset: () => void;
  siteKeyMissing: boolean;
}

export function useTurnstile(): UseTurnstileResult {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;

    loadTurnstileScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (t: string) => setToken(t),
        "expired-callback": () => setToken(null),
        "error-callback": () => setToken(null),
      });
    });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  const reset = useCallback(() => {
    setToken(null);
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, []);

  return { containerRef, token, reset, siteKeyMissing: !siteKey };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/auth/useTurnstile.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Add the env var scaffolding**

Append to `.env` (do not remove existing lines):

```
VITE_TURNSTILE_SITE_KEY=""
```

Create `.env.example`:

```
VITE_SUPABASE_PROJECT_ID=""
VITE_SUPABASE_URL=""
VITE_SUPABASE_PUBLISHABLE_KEY=""

# Cloudflare Turnstile site key (public — safe to expose in frontend code).
# Get one at https://dash.cloudflare.com/?to=/:account/turnstile
# The matching SECRET key goes only into Supabase Dashboard → Authentication →
# Settings → Bot and Abuse Protection — never into this repo.
VITE_TURNSTILE_SITE_KEY=""
```

- [ ] **Step 6: Commit**

```bash
git add src/components/auth/useTurnstile.ts src/components/auth/useTurnstile.test.tsx .env.example
git commit -m "feat: add useTurnstile hook for Turnstile CAPTCHA widget lifecycle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

Note: `.env` is gitignored (confirmed via `.gitignore:1`) — it will not be part of this commit, only `.env.example` documents the new var.

---

### Task 2: `PhoneOtpForm` — phone-entry step

**Files:**
- Create: `src/components/auth/PhoneOtpForm.tsx`
- Test: `src/components/auth/PhoneOtpForm.test.tsx`

**Interfaces:**
- Consumes: `useTurnstile()` from Task 1 (`src/components/auth/useTurnstile.ts`); `supabase` from `src/integrations/supabase/client.ts` (`supabase.auth.signInWithOtp`).
- Produces (grows further in Task 3): `export default function PhoneOtpForm(props: { mode: "login" | "signup"; onAuthenticated: (session: Session) => void; onRequestSignup?: () => void }): JSX.Element`, exported from `src/components/auth/PhoneOtpForm.tsx`. Task 4 imports this default export and these exact prop names.

- [ ] **Step 1: Write the failing tests for phone-entry validation and submit**

Create `src/components/auth/PhoneOtpForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PhoneOtpForm from "./PhoneOtpForm";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
    },
  },
}));

vi.mock("./useTurnstile", () => ({
  useTurnstile: () => ({
    containerRef: { current: null },
    token: "mock-turnstile-token",
    reset: vi.fn(),
    siteKeyMissing: false,
  }),
}));

import { supabase } from "@/integrations/supabase/client";

describe("PhoneOtpForm - phone entry step", () => {
  const onAuthenticated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a validation error and does not call the API for an invalid phone number", async () => {
    render(<PhoneOtpForm mode="signup" onAuthenticated={onAuthenticated} />);
    fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: /send otp/i }));

    expect(await screen.findByText(/enter a valid phone number/i)).toBeInTheDocument();
    expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("calls signInWithOtp with shouldCreateUser true and the captcha token on signup", async () => {
    (supabase.auth.signInWithOtp as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {}, error: null });
    render(<PhoneOtpForm mode="signup" onAuthenticated={onAuthenticated} />);

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Dr. Rahul Sharma" } });
    fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: "+919876543210" } });
    fireEvent.click(screen.getByRole("button", { name: /send otp/i }));

    await waitFor(() =>
      expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
        phone: "+919876543210",
        options: {
          shouldCreateUser: true,
          captchaToken: "mock-turnstile-token",
          data: { full_name: "Dr. Rahul Sharma" },
        },
      })
    );
    expect(await screen.findByLabelText(/6-digit code/i)).toBeInTheDocument();
  });

  it("calls signInWithOtp with shouldCreateUser false on login, and shows a sign-up link on 'not found' errors", async () => {
    (supabase.auth.signInWithOtp as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {},
      error: { message: "Signups not allowed for otp" },
    });
    const onRequestSignup = vi.fn();
    render(<PhoneOtpForm mode="login" onAuthenticated={onAuthenticated} onRequestSignup={onRequestSignup} />);

    fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: "+919876543210" } });
    fireEvent.click(screen.getByRole("button", { name: /send otp/i }));

    await waitFor(() =>
      expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
        phone: "+919876543210",
        options: { shouldCreateUser: false, captchaToken: "mock-turnstile-token" },
      })
    );
    const link = await screen.findByRole("button", { name: /sign up instead/i });
    fireEvent.click(link);
    expect(onRequestSignup).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/auth/PhoneOtpForm.test.tsx`
Expected: FAIL — `Cannot find module './PhoneOtpForm'`.

- [ ] **Step 3: Implement the phone-entry step**

Create `src/components/auth/PhoneOtpForm.tsx`:

```tsx
import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useTurnstile } from "./useTurnstile";

interface Props {
  mode: "login" | "signup";
  onAuthenticated: (session: Session) => void;
  onRequestSignup?: () => void;
}

function isValidPhone(phone: string): boolean {
  return /^\+?[1-9]\d{7,14}$/.test(phone.replace(/[\s-]/g, ""));
}

function parseRetryAfterSeconds(message: string): number | null {
  const match = message.match(/after (\d+) seconds?/i);
  return match ? parseInt(match[1], 10) : null;
}

const DEFAULT_COOLDOWN_SECONDS = 60;

export default function PhoneOtpForm({ mode, onAuthenticated, onRequestSignup }: Props) {
  const [step, setStep] = useState<"enter-phone" | "enter-otp">("enter-phone");
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [showSignupLink, setShowSignupLink] = useState(false);
  const turnstile = useTurnstile();

  const sendOtp = async () => {
    setPhoneError(null);
    setShowSignupLink(false);
    const cleaned = phone.replace(/[\s-]/g, "");

    if (!isValidPhone(cleaned)) {
      setPhoneError("Enter a valid phone number, e.g. +919876543210");
      return;
    }
    if (!turnstile.token) {
      setPhoneError(
        turnstile.siteKeyMissing
          ? "CAPTCHA verification is not configured yet."
          : "Please complete the verification challenge."
      );
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: cleaned,
        options:
          mode === "signup"
            ? { shouldCreateUser: true, captchaToken: turnstile.token, data: { full_name: fullName } }
            : { shouldCreateUser: false, captchaToken: turnstile.token },
      });
      turnstile.reset();

      if (error) {
        const retrySeconds = parseRetryAfterSeconds(error.message);
        if (retrySeconds !== null) {
          setPhoneError(`Please wait ${retrySeconds}s before requesting another code.`);
        } else if (mode === "login") {
          setPhoneError("No account found with this phone number.");
          setShowSignupLink(true);
        } else {
          setPhoneError(error.message);
        }
        return;
      }

      setStep("enter-otp");
    } catch (err) {
      toast.error((err as Error).message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (step === "enter-otp") {
    // Implemented in Task 3.
    return <div data-testid="otp-step-placeholder"><Label htmlFor="otp">6-digit code</Label><Input id="otp" /></div>;
  }

  return (
    <div className="space-y-4">
      {mode === "signup" && (
        <div>
          <Label htmlFor="phoneFullName">Full Name</Label>
          <Input
            id="phoneFullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Dr. Rahul Sharma"
            required
            className="h-11"
          />
        </div>
      )}
      <div>
        <Label htmlFor="phoneNumber">Phone Number</Label>
        <Input
          id="phoneNumber"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+91 98765 43210"
          required
          className="h-11"
        />
        {phoneError && <p className="text-xs text-destructive mt-1">{phoneError}</p>}
        {showSignupLink && (
          <button
            type="button"
            className="text-xs text-royal font-medium hover:underline mt-1"
            onClick={() => onRequestSignup?.()}
          >
            Sign up instead
          </button>
        )}
      </div>
      <div ref={turnstile.containerRef} />
      <Button
        type="button"
        onClick={sendOtp}
        disabled={loading}
        className="w-full h-11 bg-royal hover:bg-royal/90 text-white font-semibold"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        Send OTP
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/auth/PhoneOtpForm.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/PhoneOtpForm.tsx src/components/auth/PhoneOtpForm.test.tsx
git commit -m "feat: add PhoneOtpForm phone-entry step with Turnstile + validation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `PhoneOtpForm` — OTP-entry step, resend, cooldown

**Files:**
- Modify: `src/components/auth/PhoneOtpForm.tsx` (replace the Task 2 placeholder OTP step)
- Modify: `src/components/auth/PhoneOtpForm.test.tsx` (add OTP-step tests)

**Interfaces:**
- Consumes: `supabase.auth.verifyOtp` (added to the existing mock in the test file).
- Produces: no new exports — same `PhoneOtpForm` default export and props as Task 2, now feature-complete.

- [ ] **Step 1: Write the failing tests for the OTP step**

Add to `src/components/auth/PhoneOtpForm.test.tsx` (inside the existing `describe` block or a new one — append this new `describe`):

```tsx
describe("PhoneOtpForm - OTP entry step", () => {
  const onAuthenticated = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (supabase.auth.signInWithOtp as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {}, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function getToOtpStep() {
    render(<PhoneOtpForm mode="login" onAuthenticated={onAuthenticated} />);
    fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: "+919876543210" } });
    fireEvent.click(screen.getByRole("button", { name: /send otp/i }));
    await screen.findByLabelText(/6-digit code/i);
  }

  it("verifies the code and calls onAuthenticated with the returned session on success", async () => {
    const fakeSession = { user: { id: "user-1" } } as any;
    (supabase.auth.verifyOtp as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: fakeSession },
      error: null,
    });
    await getToOtpStep();

    fireEvent.change(screen.getByLabelText(/6-digit code/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));

    await waitFor(() =>
      expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
        phone: "+919876543210",
        token: "123456",
        type: "sms",
      })
    );
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(fakeSession));
  });

  it("shows an inline error and stays on the OTP step for a wrong code", async () => {
    (supabase.auth.verifyOtp as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: null },
      error: { message: "Token has expired or is invalid" },
    });
    await getToOtpStep();

    fireEvent.change(screen.getByLabelText(/6-digit code/i), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));

    expect(await screen.findByText(/incorrect or expired code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/6-digit code/i)).toBeInTheDocument();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it("disables Resend during the cooldown, then re-enables it", async () => {
    await getToOtpStep();

    const resendButton = screen.getByRole("button", { name: /resend/i });
    expect(resendButton).toBeDisabled();

    vi.advanceTimersByTime(60_000);
    await waitFor(() => expect(resendButton).not.toBeDisabled());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/auth/PhoneOtpForm.test.tsx`
Expected: FAIL — the OTP step placeholder has no "Verify"/"Resend" buttons and `verifyOtp` is never called.

- [ ] **Step 3: Implement the OTP-entry step**

In `src/components/auth/PhoneOtpForm.tsx`:

1. Add these imports: `useEffect` alongside the existing `useState` import.
2. Add new state below the existing state declarations:

```ts
const [otp, setOtp] = useState("");
const [otpError, setOtpError] = useState<string | null>(null);
const [cooldownSeconds, setCooldownSeconds] = useState(0);
```

3. After `sendOtp` succeeds (inside the `try` block, right before `setStep("enter-otp")`), start the cooldown:

```ts
      setStep("enter-otp");
      setCooldownSeconds(DEFAULT_COOLDOWN_SECONDS);
```

4. Add a cooldown ticker effect, placed after the `sendOtp` function definition:

```ts
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const id = setInterval(() => setCooldownSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldownSeconds]);
```

5. Add the `verifyOtp` handler, after the cooldown effect:

```ts
  const verifyOtp = async () => {
    setOtpError(null);
    if (!/^\d{6}$/.test(otp)) {
      setOtpError("Enter the 6-digit code.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: phone.replace(/[\s-]/g, ""),
        token: otp,
        type: "sms",
      });
      if (error || !data.session) {
        setOtpError("Incorrect or expired code. Try again.");
        setOtp("");
        return;
      }
      onAuthenticated(data.session);
    } catch (err) {
      toast.error((err as Error).message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const resend = () => {
    if (cooldownSeconds > 0) return;
    setOtp("");
    setOtpError(null);
    sendOtp();
  };
```

6. Replace the Task 2 placeholder return block:

```tsx
  if (step === "enter-otp") {
    // Implemented in Task 3.
    return <div data-testid="otp-step-placeholder"><Label htmlFor="otp">6-digit code</Label><Input id="otp" /></div>;
  }
```

with:

```tsx
  if (step === "enter-otp") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          We sent a 6-digit code to <strong className="text-foreground">{phone}</strong>.
        </p>
        <div>
          <Label htmlFor="otp">6-digit code</Label>
          <Input
            id="otp"
            inputMode="numeric"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            required
            className="h-11 tracking-widest text-center"
          />
          {otpError && <p className="text-xs text-destructive mt-1">{otpError}</p>}
        </div>
        <Button
          type="button"
          onClick={verifyOtp}
          disabled={loading}
          className="w-full h-11 bg-royal hover:bg-royal/90 text-white font-semibold"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Verify
        </Button>
        <button
          type="button"
          onClick={resend}
          disabled={cooldownSeconds > 0 || loading}
          className="text-xs text-muted-foreground hover:text-royal disabled:opacity-50 disabled:hover:text-muted-foreground w-full text-center"
        >
          {cooldownSeconds > 0 ? `Resend OTP in ${cooldownSeconds}s` : "Resend OTP"}
        </button>
      </div>
    );
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/auth/PhoneOtpForm.test.tsx`
Expected: PASS (all 6 tests across both `describe` blocks)

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/PhoneOtpForm.tsx src/components/auth/PhoneOtpForm.test.tsx
git commit -m "feat: add PhoneOtpForm OTP-verify step with resend cooldown

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Wire `PhoneOtpForm` into `Auth.tsx`

**Files:**
- Modify: `src/pages/Auth.tsx`
- Test: `src/pages/Auth.test.tsx` (new)

**Interfaces:**
- Consumes: `PhoneOtpForm` default export and its `{ mode, onAuthenticated, onRequestSignup }` props from Task 2/3.
- Produces: nothing new consumed elsewhere — this is the integration endpoint.

- [ ] **Step 1: Write the failing tests for the tab switcher and integration**

Create `src/pages/Auth.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Auth from "./Auth";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

vi.mock("@/components/auth/PhoneOtpForm", () => ({
  default: ({ mode }: { mode: string }) => <div data-testid="phone-otp-form">phone form ({mode})</div>,
}));

function renderAuth() {
  return render(
    <MemoryRouter initialEntries={["/auth?mode=signup"]}>
      <Auth />
    </MemoryRouter>
  );
}

describe("Auth page - method tabs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the email form by default and hides it when switching to Phone", async () => {
    renderAuth();
    await waitFor(() => expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^phone$/i }));

    expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("phone-otp-form")).toHaveTextContent("phone form (signup)");
  });

  it("switching to Phone and back preserves the email form's value (no crash, no data loss)", async () => {
    renderAuth();
    await waitFor(() => expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "doc@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /^phone$/i }));
    expect(screen.getByTestId("phone-otp-form")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^email$/i }));

    expect(screen.getByLabelText(/^email$/i)).toHaveValue("doc@example.com");
  });

  it("does not render the method tabs in forgot-password mode", async () => {
    render(
      <MemoryRouter initialEntries={["/auth?mode=login"]}>
        <Auth />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /forgot password/i }));

    expect(screen.queryByRole("button", { name: /^phone$/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/pages/Auth.test.tsx`
Expected: FAIL — no "Phone" tab button exists yet.

- [ ] **Step 3: Implement the tab switcher and extract `handleAuthenticated`**

In `src/pages/Auth.tsx`:

1. Add the import (below the existing `motion` import):

```tsx
import type { Session } from "@supabase/supabase-js";
import PhoneOtpForm from "@/components/auth/PhoneOtpForm";
```

2. Add new state, right after the existing `const [checkingSession, setCheckingSession] = useState(true);` line:

```tsx
  const [authMethod, setAuthMethod] = useState<"email" | "phone">("email");
```

3. Add `handleAuthenticated`, placed right after the `handleSubmit` function closes (after its closing `};`):

```tsx
  const handleAuthenticated = async (session: Session) => {
    if (safeNext) {
      window.location.href = safeNext;
      return;
    }
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: session.user.id,
      _role: "admin",
    });
    if (isAdmin) {
      navigate("/superadmin");
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .single();
    if (profile?.onboarding_completed) {
      navigate("/admin/dashboard");
    } else {
      navigate("/onboarding");
    }
  };
```

4. In `handleSubmit`'s `else` (login) branch, replace:

```tsx
      } else {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (safeNext) {
          window.location.href = safeNext;
          return;
        }
        const { data: isAdmin } = await supabase.rpc("has_role", {
          _user_id: signInData.user.id,
          _role: "admin",
        });
        if (isAdmin) {
          navigate("/superadmin");
          return;
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_completed")
          .single();
        if (profile?.onboarding_completed) {
          navigate("/admin/dashboard");
        } else {
          navigate("/onboarding");
        }
      }
```

with:

```tsx
      } else {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!signInData.session) throw new Error("Login succeeded but no session was returned.");
        await handleAuthenticated(signInData.session);
      }
```

5. Add the method tabs and conditional form body. Replace:

```tsx
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
```

with:

```tsx
            {mode !== "forgot" && (
              <div className="mb-4 flex rounded-lg bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setAuthMethod("email")}
                  className={`flex-1 h-9 rounded-md text-sm font-medium transition-colors ${
                    authMethod === "email" ? "bg-card shadow text-primary" : "text-muted-foreground"
                  }`}
                >
                  Email
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMethod("phone")}
                  className={`flex-1 h-9 rounded-md text-sm font-medium transition-colors ${
                    authMethod === "phone" ? "bg-card shadow text-primary" : "text-muted-foreground"
                  }`}
                >
                  Phone
                </button>
              </div>
            )}

            {authMethod === "phone" && mode !== "forgot" ? (
              <PhoneOtpForm
                mode={mode}
                onAuthenticated={handleAuthenticated}
                onRequestSignup={() => setMode("signup")}
              />
            ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
```

6. Close the added ternary's `false` branch — find the existing `</form>` that closes the email form (right before `<div className="text-center mt-5 ...">`) and change it to also close the ternary:

```tsx
            </form>
```

becomes:

```tsx
            </form>
            )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/pages/Auth.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full test suite to confirm nothing else broke**

Run: `npm test`
Expected: All tests PASS, including the pre-existing `src/test/example.test.ts` and the three new test files from Tasks 1-4.

- [ ] **Step 6: Manual smoke check of the email/password flow (regression guard)**

Run: `npm run dev`, open `/auth?mode=signup`, confirm:
- Email tab is active by default, form looks unchanged from before this feature
- Clicking "Phone" swaps in the phone form; clicking "Email" swaps back with prior field values intact (state persists across tab switches, consistent with how this file already persists fields across login/signup/forgot mode switches)
- Clicking "Forgot Password?" (from login mode) hides the tabs entirely

- [ ] **Step 7: Commit**

```bash
git add src/pages/Auth.tsx src/pages/Auth.test.tsx
git commit -m "feat: wire PhoneOtpForm into Auth.tsx via Email/Phone tabs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Post-Implementation Manual QA (blocked on external setup)

These cannot be automated (no real/mocked SMS provider in CI) and cannot be run at all until both external dependencies from the spec are configured:
1. SMS provider in Supabase Dashboard → Authentication → Providers → Phone
2. Turnstile secret key in Supabase Dashboard → Authentication → Settings → Bot and Abuse Protection, plus `VITE_TURNSTILE_SITE_KEY` filled in in `.env`

Once both are done, manually verify against a real phone number:
- [ ] Phone signup happy path (receive real SMS, verify, land on `/onboarding`)
- [ ] Phone login happy path (existing phone account, receive SMS, verify, land on `/admin/dashboard` or `/superadmin` per role)
- [ ] Wrong OTP shows inline error, stays on OTP step
- [ ] Expired OTP (wait past Supabase's expiry window) shows inline error
- [ ] Resend cooldown countdown matches actual Supabase-enforced cooldown
- [ ] Login attempt with an unregistered phone number shows "No account found" + working "Sign up instead" link
- [ ] Signup attempt with an already-registered phone number logs the user into their existing account rather than erroring
- [ ] Turnstile widget must be solved before "Send OTP" becomes actionable
- [ ] Switching Email ↔ Phone tabs mid-flow doesn't leak field values between the two forms
