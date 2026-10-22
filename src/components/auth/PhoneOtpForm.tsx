import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { FormattedPhoneInput } from "@/components/ui/formatted-phone-input";
import { CountryCodeSelect } from "@/components/ui/country-code-select";
import { Label } from "@/components/ui/label";
import { otpService } from "@/lib/auth/otp/otpService";
import TurnstileWidget, { getTurnstileSiteKey } from "@/components/shared/TurnstileWidget";

const PRIMARY = "#3C83FC";

interface Props {
  mode: "login" | "signup";
  onAuthenticated: (session: Session) => void;
  onRequestSignup?: () => void;
}

const DEFAULT_COOLDOWN_SECONDS = 30;

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
  const [captchaToken, setCaptchaToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [agreedToPolicies, setAgreedToPolicies] = useState(false);

  useEffect(() => {
    setAgreedToPolicies(false);
    setPhoneError(null);
  }, [mode]);

  const sendOtp = async () => {
    setPhoneError(null);
    setShowSignupLink(false);

    if (mode === "signup" && !agreedToPolicies) {
      setPhoneError("Please agree to the Terms of Service and Privacy Policy.");
      return;
    }

    setLoading(true);
    try {
      if (getTurnstileSiteKey() && !captchaToken) {
        const message = "Please complete the verification check.";
        if (step === "enter-otp") setOtpError(message);
        else setPhoneError(message);
        return;
      }
      const res = await otpService.sendOtp({
        phone,
        mode,
        fullName: mode === "signup" ? fullName : undefined,
        ...(captchaToken ? { captchaToken } : {}),
      });
      if (captchaToken) {
        setCaptchaToken("");
        setTurnstileReset((n) => n + 1);
      }

      if (!res.success) {
        setPhoneError(res.message || "Failed to send OTP.");
        if (res.showSignupLink) {
          setShowSignupLink(true);
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
    setShowSignupLink(false);
    if (!/^\d{6}$/.test(otp)) {
      setOtpError("Enter the 6-digit code.");
      return;
    }
    setLoading(true);
    try {
      const res = await otpService.verifyOtp({
        phone,
        otp,
        mode,
      });

      if (!res.success || !res.session) {
        setOtpError(typeof res.message === "string" ? res.message : "Incorrect or expired code. Try again.");
        setOtp("");
        if (res.showSignupLink) {
          setShowSignupLink(true);
        }
        return;
      }

      onAuthenticated(res.session);
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
        {otpService.isMock && (
          <div className="text-xs bg-amber-500/10 text-amber-600 border border-amber-500/20 px-2.5 py-1.5 rounded-md text-center font-medium">
            Development OTP: 123456
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          We sent a 6-digit code to <strong className="text-foreground">{phone}</strong>.
        </p>
        <div>
          <Label htmlFor="otp">6-digit code</Label>
          <InputOTP
            id="otp"
            maxLength={6}
            value={otp}
            onChange={(value) => setOtp(value)}
            autoFocus
            containerClassName="justify-center"
          >
            <InputOTPGroup className="gap-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot
                  key={i}
                  index={i}
                  className="h-12 w-12 rounded-lg border border-royal/40 text-lg font-semibold"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
          {otpError && <p className="text-xs text-destructive mt-1">{otpError}</p>}
          {showSignupLink && (
            <button
              type="button"
              className="text-xs font-medium hover:underline mt-1 block"
              style={{ color: PRIMARY }}
              onClick={() => {
                setStep("enter-phone");
                setOtp("");
                setOtpError(null);
                setShowSignupLink(false);
                onRequestSignup?.();
              }}
            >
              Sign up instead
            </button>
          )}
        </div>
        <TurnstileWidget onToken={setCaptchaToken} resetSignal={turnstileReset} />
        <Button
          type="button"
          onClick={verifyOtp}
          disabled={loading}
          className="w-full h-11 text-white font-semibold hover:opacity-90"
          style={{ backgroundColor: PRIMARY }}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Verify OTP
        </Button>
        <button
          type="button"
          onClick={resend}
          disabled={cooldownSeconds > 0 || loading}
          className="text-xs text-muted-foreground disabled:opacity-50 w-full text-center block hover:underline"
        >
          {cooldownSeconds > 0 ? `Resend OTP in ${cooldownSeconds}s` : "Resend OTP"}
        </button>
        <button
          type="button"
          onClick={() => {
            setStep("enter-phone");
            setOtp("");
            setOtpError(null);
          }}
          className="text-xs text-muted-foreground hover:text-foreground w-full text-center block pt-1"
        >
          Change phone number
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {otpService.isMock && (
        <div className="text-xs bg-amber-500/10 text-amber-600 border border-amber-500/20 px-2.5 py-1.5 rounded-md text-center font-medium">
          Development OTP Mode Active (Code: 123456)
        </div>
      )}
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
        <div className="flex h-11 items-stretch rounded-md border border-input overflow-hidden focus-within:ring-1 focus-within:ring-ring">
          <CountryCodeSelect />
          <FormattedPhoneInput
            id="phoneNumber"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="98765 4****"
            required
            autoFocus
            className="h-full border-0 rounded-none focus-visible:ring-0"
          />
        </div>
        {phoneError && <p className="text-xs text-destructive mt-1">{phoneError}</p>}
        {showSignupLink && (
          <button
            type="button"
            className="text-xs font-medium hover:underline mt-1 block"
            style={{ color: PRIMARY }}
            onClick={() => onRequestSignup?.()}
          >
            Sign up instead
          </button>
        )}
      </div>
      {mode === "signup" && (
        <div className="flex items-start gap-2.5">
          <Checkbox
            id="agree-policies"
            checked={agreedToPolicies}
            onCheckedChange={(checked) => {
              setAgreedToPolicies(checked === true);
              if (checked === true) setPhoneError(null);
            }}
            className="mt-0.5"
          />
          <Label htmlFor="agree-policies" className="text-xs leading-relaxed text-muted-foreground font-normal cursor-pointer">
            I agree to the{" "}
            <Link to="/terms" className="font-medium hover:underline" style={{ color: PRIMARY }}>
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="font-medium hover:underline" style={{ color: PRIMARY }}>
              Privacy Policy
            </Link>
            .
          </Label>
        </div>
      )}
      <TurnstileWidget onToken={setCaptchaToken} resetSignal={turnstileReset} />
      <Button
        type="button"
        onClick={sendOtp}
        disabled={loading || (mode === "signup" && !agreedToPolicies)}
        className="w-full h-11 text-white font-semibold hover:opacity-90"
        style={{ backgroundColor: PRIMARY }}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        Send OTP
      </Button>
    </div>
  );
}

