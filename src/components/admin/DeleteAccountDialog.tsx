import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";

type Step = "confirm" | "otp";

const COOLDOWN_SECONDS = 30;

/** auth.users.phone is stored without the "+"; signInWithOtp wants E.164. */
const toE164 = (phone: string) => (phone.startsWith("+") ? phone : `+${phone}`);

const maskPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 4 ? `+${digits.slice(0, digits.length - 10)} ******${digits.slice(-4)}` : phone;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Self-service account deletion. The doctor proves ownership with an OTP sent
 * to the phone registered on the account (never a number typed here), then the
 * `delete-doctor-account` edge function re-checks that OTP login server-side.
 */
const DeleteAccountDialog = ({ open, onOpenChange }: Props) => {
  const [step, setStep] = useState<Step>("confirm");
  const [phone, setPhone] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!open) return;
    setStep("confirm");
    setTyped("");
    setOtp("");
    setError(null);
    setCooldown(0);
    supabase.auth.getUser().then(({ data }) => setPhone(data.user?.phone || null));
  }, [open]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const sendOtp = async () => {
    setError(null);
    if (!phone) {
      setError("No mobile number is registered on this account. Please contact support.");
      return;
    }
    setBusy(true);
    const { error: sendErr } = await supabase.auth.signInWithOtp({
      phone: toE164(phone),
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (sendErr) {
      setError(sendErr.message || "Could not send the OTP. Please try again.");
      return;
    }
    setStep("otp");
    setOtp("");
    setCooldown(COOLDOWN_SECONDS);
  };

  const confirmDelete = async () => {
    setError(null);
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit code.");
      return;
    }
    if (!phone) return;
    setBusy(true);
    try {
      const { data, error: verifyErr } = await supabase.auth.verifyOtp({
        phone: toE164(phone),
        token: otp,
        type: "sms",
      });
      if (verifyErr || !data.session) {
        setError(verifyErr?.message || "Incorrect or expired code. Try again.");
        setOtp("");
        return;
      }

      const { error: fnErr } = await supabase.functions.invoke("delete-doctor-account", {
        body: { confirm: true },
      });
      if (fnErr) {
        setError(await edgeFunctionErrorMessage(fnErr, "Could not delete your account. Please try again."));
        return;
      }

      toast.success("Your account has been deleted.");
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      window.location.assign("/");
    } finally {
      setBusy(false);
    }
  };

  const typedOk = typed.trim() === "DELETE";

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" /> Delete your account
          </DialogTitle>
          <DialogDescription>
            This permanently deletes your profile, website, patients, appointments, billing records and staff
            logins. It cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {step === "confirm" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="delete-confirm">Type <strong>DELETE</strong> to continue</Label>
              <Input id="delete-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" disabled={busy} />
            </div>
            <p className="text-sm text-muted-foreground">
              We'll send a 6-digit code to your registered mobile number{phone ? <> (<strong className="text-foreground">{maskPhone(phone)}</strong>)</> : null}.
            </p>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button variant="destructive" onClick={sendOtp} disabled={!typedOk || busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Send OTP
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the code sent to <strong className="text-foreground">{phone ? maskPhone(phone) : "your phone"}</strong>.
            </p>
            <InputOTP maxLength={6} value={otp} onChange={setOtp} autoFocus containerClassName="justify-center">
              <InputOTPGroup className="gap-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} className="h-12 w-12 rounded-lg border border-royal/40 text-lg font-semibold" />
                ))}
              </InputOTPGroup>
            </InputOTP>
            {error && <p className="text-xs text-destructive text-center">{error}</p>}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button variant="destructive" onClick={confirmDelete} disabled={busy || otp.length !== 6}>
                {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Verify &amp; delete account
              </Button>
            </DialogFooter>
            <button
              type="button"
              onClick={sendOtp}
              disabled={cooldown > 0 || busy}
              className="text-xs text-muted-foreground disabled:opacity-50 w-full text-center block hover:underline"
            >
              {cooldown > 0 ? `Resend OTP in ${cooldown}s` : "Resend OTP"}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DeleteAccountDialog;
