import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DigitsInput } from "@/components/ui/digits-input";
import { FormattedPhoneInput } from "@/components/ui/formatted-phone-input";
import { Label } from "@/components/ui/label";
import { otpService } from "@/lib/auth/otp/otpService";

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

  const sendOtp = async () => {
    setPhoneError(null);
    setShowSignupLink(false);

    setLoading(true);
    try {
      const res = await otpService.sendOtp({
        phone,
        mode,
        fullName: mode === "signup" ? fullName : undefined,
      });

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
          <DigitsInput
            id="otp"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="123456"
            required
            className="h-11 tracking-widest text-center"
          />
          {otpError && <p className="text-xs text-destructive mt-1">{otpError}</p>}
          {showSignupLink && (
            <button
              type="button"
              className="text-xs text-royal font-medium hover:underline mt-1 block"
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
        <Button
          type="button"
          onClick={verifyOtp}
          disabled={loading}
          className="w-full h-11 bg-royal hover:bg-royal/90 text-white font-semibold"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Verify OTP
        </Button>
        <button
          type="button"
          onClick={resend}
          disabled={cooldownSeconds > 0 || loading}
          className="text-xs text-muted-foreground hover:text-royal disabled:opacity-50 disabled:hover:text-muted-foreground w-full text-center block"
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
        <FormattedPhoneInput
          id="phoneNumber"
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
            className="text-xs text-royal font-medium hover:underline mt-1 block"
            onClick={() => onRequestSignup?.()}
          >
            Sign up instead
          </button>
        )}
      </div>
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

