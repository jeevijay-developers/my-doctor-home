import { useEffect, useState } from "react";
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
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
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
      setCooldownSeconds(DEFAULT_COOLDOWN_SECONDS);
    } catch (err) {
      toast.error((err as Error).message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const id = setInterval(() => setCooldownSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldownSeconds]);

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
