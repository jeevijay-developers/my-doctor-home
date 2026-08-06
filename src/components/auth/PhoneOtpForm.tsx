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
