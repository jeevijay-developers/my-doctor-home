import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, Loader2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PrescriptionSlipCard, type PrescriptionSlipData } from "@/components/admin/PrescriptionSlip";
import { parseMedicineItems } from "@/lib/prescriptionMedicines";
import { downloadPdfFromNode } from "@/lib/downloadPdfFromNode";

type Loaded = { doctor: any; prescription: PrescriptionSlipData };
type Phase = "loading" | "phone" | "ready" | "gone" | "locked";

// Patient-facing page behind the WhatsApp link. noindex + no-referrer: it holds medical data.
const SharedPrescription = () => {
  const { token = "" } = useParams<{ token: string }>();
  const [phase, setPhase] = useState<Phase>("loading");
  const [digits, setDigits] = useState("");
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Loaded | null>(null);

  useEffect(() => {
    const robots = document.createElement("meta");
    robots.name = "robots"; robots.content = "noindex, nofollow";
    const referrer = document.createElement("meta");
    referrer.name = "referrer"; referrer.content = "no-referrer";
    document.head.append(robots, referrer);
    const prevTitle = document.title;
    document.title = "Your prescription";
    return () => { robots.remove(); referrer.remove(); document.title = prevTitle; };
  }, []);

  const open = async (last4: string | null) => {
    setBusy(true);
    const { data: res, error } = await supabase.rpc("get_shared_prescription" as any, { _token: token, _phone_last4: last4 ?? "" });
    setBusy(false);
    const r = res as any;
    if (error || !r) { setPhase("gone"); return; }
    if (r.ok) {
      setData({
        doctor: r.doctor,
        prescription: { ...r.prescription, medicines: parseMedicineItems(r.prescription.medicines) },
      });
      setPhase("ready");
    } else if (r.error === "PHONE_REQUIRED") {
      setWrong(last4 !== null && last4 !== "");
      setPhase("phone");
    } else if (r.error === "TOO_MANY_ATTEMPTS") {
      setPhase("locked");
    } else {
      setPhase("gone");
    }
  };

  useEffect(() => { open(null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  const download = () =>
    downloadPdfFromNode(
      "[data-prescription-slip-print-root] [data-prescription-slip-body]",
      `prescription-${data?.prescription.id.slice(0, 8) ?? "rx"}.pdf`,
      {
        multiPage: true,
        headerSelector: "[data-prescription-slip-print-root] [data-prescription-slip-header]",
        footerSelector: "[data-prescription-slip-print-root] [data-prescription-slip-footer]",
        rowSelector: "[data-prescription-slip-print-root] [data-prescription-slip-row]",
      },
    );

  if (phase === "loading") {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (phase === "ready" && data) {
    return (
      <div className="min-h-screen bg-secondary/40 py-4 sm:py-8 px-2">
        <div className="mx-auto max-w-[720px]">
          <div data-prescription-slip-print-root className="bg-white shadow-md rounded-lg overflow-hidden">
            <PrescriptionSlipCard profile={data.doctor} prescription={data.prescription} />
          </div>
          <div className="flex justify-end mt-4">
            <Button onClick={download} className="gap-1.5 bg-royal hover:bg-royal/90 text-white">
              <Download className="h-4 w-4" /> Download PDF
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-secondary/40">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center space-y-4">
        <Lock className="h-8 w-8 mx-auto text-royal" />
        {phase === "phone" && (
          <>
            <h1 className="font-heading text-lg font-semibold">Open your prescription</h1>
            <p className="text-sm text-muted-foreground">Enter the last 4 digits of the phone number you gave the clinic.</p>
            <form
              className="space-y-3"
              onSubmit={(e) => { e.preventDefault(); if (/^\d{4}$/.test(digits)) open(digits); }}
            >
              <Input
                inputMode="numeric" maxLength={4} autoFocus value={digits} aria-label="Last 4 digits of phone"
                onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="text-center text-lg tracking-[0.5em]"
              />
              {wrong && <p role="alert" className="text-xs text-destructive">Those digits don't match. Please try again.</p>}
              <Button type="submit" disabled={busy || digits.length !== 4} className="w-full bg-royal hover:bg-royal/90 text-white">
                {busy ? "Checking..." : "View prescription"}
              </Button>
            </form>
          </>
        )}
        {phase === "locked" && (
          <>
            <h1 className="font-heading text-lg font-semibold">Too many attempts</h1>
            <p className="text-sm text-muted-foreground">For your safety this link is locked for 15 minutes. Please try again later.</p>
          </>
        )}
        {phase === "gone" && (
          <>
            <h1 className="font-heading text-lg font-semibold">This link is no longer available</h1>
            <p className="text-sm text-muted-foreground">It may have expired or been withdrawn. Please ask your clinic to share it again.</p>
          </>
        )}
      </div>
    </div>
  );
};

export default SharedPrescription;
