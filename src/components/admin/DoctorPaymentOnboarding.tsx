import { useState } from "react";
import { Landmark, CheckCircle2, Clock, AlertCircle, RefreshCw, ChevronRight, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { isValidIfsc, ifscErrorMessage, isValidAccountNumber, accountNumberErrorMessage } from "@/lib/bankDetails";
import { toast } from "sonner";

type AccountStatus =
  | "not_started"
  | "submitted"
  | "processing"
  | "needs_clarification"
  | "active"
  | "suspended"
  | "failed";

type Profile = {
  id: string;
  full_name?: string | null;
  phone?: string | null;
  clinic_email?: string | null;
  razorpay_account_id?: string | null;
  razorpay_account_status?: string | null;
  razorpay_payment_enabled?: boolean | null;
  razorpay_onboarding_error?: string | null;
};

type Props = {
  profile: Profile;
  onStatusChange?: () => void;
};

const STATUS_CONFIG: Record<AccountStatus, { label: string; color: string; icon: React.ReactNode; description: string }> = {
  not_started: {
    label: "Not Set Up",
    color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    icon: <Landmark className="h-4 w-4" />,
    description: "Enable online patient payments in a few steps.",
  },
  submitted: {
    label: "Submitted",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    icon: <Clock className="h-4 w-4" />,
    description: "Your application has been submitted to Razorpay.",
  },
  processing: {
    label: "Under Review",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    icon: <Clock className="h-4 w-4 animate-pulse" />,
    description: "Razorpay is reviewing your account. This usually takes a few hours.",
  },
  needs_clarification: {
    label: "Action Required",
    color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    icon: <AlertCircle className="h-4 w-4" />,
    description: "Razorpay requires more information. See details below.",
  },
  active: {
    label: "Active",
    color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    icon: <CheckCircle2 className="h-4 w-4" />,
    description: "Patients can now pay you directly. Funds arrive in T+2 business days.",
  },
  suspended: {
    label: "Suspended",
    color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    icon: <AlertCircle className="h-4 w-4" />,
    description: "Your account has been suspended. Contact Razorpay support.",
  },
  failed: {
    label: "Setup Failed",
    color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    icon: <AlertCircle className="h-4 w-4" />,
    description: "Setup failed. Please review the error below and try again.",
  },
};

const DoctorPaymentOnboarding = ({ profile, onStatusChange }: Props) => {
  const status = (profile.razorpay_account_status as AccountStatus | undefined) ?? "not_started";
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.not_started;

  const [showForm, setShowForm] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [businessName, setBusinessName] = useState(profile.clinic_email ? "" : "");
  const [contactName, setContactName] = useState(profile.full_name ?? "");
  const [contactEmail, setContactEmail] = useState(profile.clinic_email ?? "");
  const [contactPhone, setContactPhone] = useState(profile.phone ?? "");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState(profile.full_name ?? "");

  const handleSync = async () => {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("sync-doctor-payment-status", { body: {} });
    setSyncing(false);
    if (error || !data?.ok) {
      toast.error(await edgeFunctionErrorMessage(error, "Couldn't refresh status"));
      return;
    }
    toast.success(`Status updated: ${data.status}`);
    onStatusChange?.();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim() || !contactName.trim() || !contactEmail.trim() || !contactPhone.trim()) {
      toast.error("All contact fields are required.");
      return;
    }
    if (!accountNumber.trim() || !ifsc.trim() || !beneficiaryName.trim()) {
      toast.error("Bank account details are required.");
      return;
    }
    if (!isValidAccountNumber(accountNumber)) {
      toast.error(accountNumberErrorMessage);
      return;
    }
    if (accountNumber !== confirmAccountNumber) {
      toast.error("Account numbers do not match. Please re-enter.");
      return;
    }
    if (!isValidIfsc(ifsc)) {
      toast.error(ifscErrorMessage);
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("onboard-doctor-payment", {
      body: {
        business_name: businessName.trim(),
        legal_business_name: beneficiaryName.trim(),
        contact_name: contactName.trim(),
        contact_email: contactEmail.trim(),
        contact_phone: contactPhone.trim(),
        account_number: accountNumber.trim(),
        ifsc: ifsc.trim().toUpperCase(),
        beneficiary_name: beneficiaryName.trim(),
      },
    });
    setSubmitting(false);

    if (error || !data?.ok) {
      toast.error(await edgeFunctionErrorMessage(error, "Setup failed. Please try again."), { duration: 6000 });
      return;
    }

    if (data.status === "active") {
      toast.success("Payment account activated! Patients can now pay you directly.", { duration: 5000 });
    } else {
      toast.success("Account submitted to Razorpay for review.", {
        description: "You'll be notified when it's active — usually within a few hours.",
        duration: 6000,
      });
    }
    setShowForm(false);
    onStatusChange?.();
  };

  const isAlreadySetup = status !== "not_started" && status !== "failed";

  return (
    <Card className="border-2 border-dashed border-primary/20 dark:border-primary/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base font-heading">Online Patient Payments</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Powered by Razorpay Route — funds go directly to your bank
              </CardDescription>
            </div>
          </div>
          <Badge className={`flex items-center gap-1.5 text-xs px-2 py-1 ${config.color}`}>
            {config.icon}
            {config.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{config.description}</p>

        {/* Active state — show details */}
        {status === "active" && (
          <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 space-y-2">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-300 font-semibold text-sm">
              <ShieldCheck className="h-4 w-4" />
              Direct payment active
            </div>
            <ul className="text-xs text-green-700/80 dark:text-green-300/80 space-y-1 list-disc list-inside">
              <li>Patient pays → funds route directly to your linked bank account</li>
              <li>Settlement within T+2 business days (automatic, no admin approval needed)</li>
              <li>Razorpay Account: <code className="font-mono">{profile.razorpay_account_id}</code></li>
            </ul>
          </div>
        )}

        {/* Clarification / error message */}
        {(status === "needs_clarification" || status === "failed" || status === "suspended") && profile.razorpay_onboarding_error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
            <p className="font-semibold mb-1">Details from Razorpay:</p>
            <p className="text-xs">{profile.razorpay_onboarding_error}</p>
          </div>
        )}

        {/* Processing / submitted — sync button */}
        {(status === "processing" || status === "submitted") && (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Checking..." : "Refresh Status"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Check if Razorpay has approved your account
            </span>
          </div>
        )}

        {/* Not started or failed — show setup button / form */}
        {(status === "not_started" || status === "failed") && !showForm && (
          <Button
            className="gap-1.5 w-full sm:w-auto"
            onClick={() => setShowForm(true)}
          >
            <Landmark className="h-4 w-4" />
            {status === "failed" ? "Retry Setup" : "Enable Online Payments"}
            <ChevronRight className="h-4 w-4 ml-auto sm:ml-0" />
          </Button>
        )}

        {/* Onboarding form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-5 border-t pt-5 mt-2">
            <p className="text-sm font-semibold text-foreground">
              Step 1 — Your Details
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="op-business-name">Clinic / Practice Name <span className="text-destructive">*</span></Label>
                <Input
                  id="op-business-name"
                  placeholder="e.g. Dr. Sharma's Clinic"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="op-contact-name">Your Full Name <span className="text-destructive">*</span></Label>
                <Input
                  id="op-contact-name"
                  placeholder="As on PAN card"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="op-contact-email">Email <span className="text-destructive">*</span></Label>
                <Input
                  id="op-contact-email"
                  type="email"
                  placeholder="you@clinic.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="op-contact-phone">Phone <span className="text-destructive">*</span></Label>
                <Input
                  id="op-contact-phone"
                  placeholder="10-digit mobile"
                  maxLength={10}
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value.replace(/\D/g, ""))}
                  required
                />
              </div>
            </div>

            <p className="text-sm font-semibold text-foreground">
              Step 2 — Bank Account for Settlement
            </p>
            <p className="text-xs text-muted-foreground -mt-2">
              Razorpay will deposit patient payments here within T+2 business days.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="op-beneficiary">Account Holder Name <span className="text-destructive">*</span></Label>
                <Input
                  id="op-beneficiary"
                  placeholder="Exactly as in bank records"
                  value={beneficiaryName}
                  onChange={(e) => setBeneficiaryName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="op-ifsc">IFSC Code <span className="text-destructive">*</span></Label>
                <Input
                  id="op-ifsc"
                  placeholder="e.g. SBIN0001234"
                  value={ifsc}
                  onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                  maxLength={11}
                  required
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="op-acc">Account Number <span className="text-destructive">*</span></Label>
                <Input
                  id="op-acc"
                  type="password"
                  placeholder="Bank account number"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                  required
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="op-acc-confirm">Confirm Account Number <span className="text-destructive">*</span></Label>
                <Input
                  id="op-acc-confirm"
                  placeholder="Re-enter account number"
                  value={confirmAccountNumber}
                  onChange={(e) => setConfirmAccountNumber(e.target.value.replace(/\D/g, ""))}
                  required
                />
              </div>
            </div>

            <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-700 dark:text-blue-300 space-y-1">
              <p className="font-semibold">What happens next?</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Razorpay creates a linked sub-account under the Doctylia platform</li>
                <li>Activation usually takes a few hours (sometimes instant in test mode)</li>
                <li>Once active, patient payments route directly to your bank — no waiting for the platform to pay you</li>
              </ul>
            </div>

            <div className="flex gap-3 flex-wrap">
              <Button type="submit" disabled={submitting} className="gap-1.5">
                {submitting ? "Submitting..." : "Submit for Activation"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} disabled={submitting}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {/* Active — allow sync for refresh */}
        {status === "active" && (
          <Button variant="ghost" size="sm" onClick={handleSync} disabled={syncing} className="gap-1.5 text-muted-foreground">
            <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
            Verify status
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default DoctorPaymentOnboarding;
