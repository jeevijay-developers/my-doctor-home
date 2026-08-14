import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import UpgradeCheckoutDialog from "@/components/admin/UpgradeCheckoutDialog";
import { Button } from "@/components/ui/button";
import { TrialStatusProvider, computeTrialAccess, graceEndsAtFrom, type TrialAccessLevel } from "@/contexts/TrialStatusContext";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  // "cancelled" (suspended) and "expired-beyond-grace" both render the same
  // hard-block wall below — the distinction only matters for its copy, kept
  // in blockReason so a suspended doctor doesn't see trial-expiry wording.
  const [accessLevel, setAccessLevel] = useState<TrialAccessLevel>("full");
  const [blockReason, setBlockReason] = useState<"cancelled" | "trial">("trial");
  const [isStaff, setIsStaff] = useState(false);
  const [trialEnd, setTrialEnd] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    // Synchronous listener only — never await supabase calls inside this callback
    // (doing so deadlocks the auth client on refresh / token refresh events).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!mounted) return;
      setSession(s);
      setLoading(false);
      if (s?.user?.id) {
        // Defer the profile lookup so the auth callback returns immediately.
        setTimeout(async () => {
          const { data: prof } = await supabase
            .from("profiles")
            .select("plan_status, trial_end")
            .eq("id", s.user.id)
            .maybeSingle();
          if (prof) {
            if (!mounted) return;
            setIsStaff(false);
            setBlockReason(prof.plan_status === "cancelled" ? "cancelled" : "trial");
            setTrialEnd(prof.trial_end);
            setAccessLevel(computeTrialAccess(prof.plan_status, prof.trial_end));
            return;
          }
          // No profiles row under this session's own id — check whether
          // it's a staff session, and if so gate on their ASSIGNED
          // doctor's plan_status, so a suspended/expired doctor's staff
          // can't use their staff login as a workaround.
          const { data: staffRow } = await supabase
            .from("staff_members")
            .select("doctor_id, status")
            .eq("id", s.user.id)
            .maybeSingle();
          if (staffRow?.status !== "active") {
            if (mounted) { setIsStaff(true); setAccessLevel("full"); }
            return;
          }
          // Plain profiles SELECT is gated by "View Profile", which this
          // shouldn't depend on — use the narrow RPC instead.
          const { data } = await supabase.rpc("get_doctor_plan_details", { _doctor_id: staffRow.doctor_id });
          const detail = data?.[0];
          if (!mounted) return;
          setIsStaff(true);
          setBlockReason(detail?.plan_status === "cancelled" ? "cancelled" : "trial");
          setTrialEnd(detail?.trial_end ?? null);
          setAccessLevel(computeTrialAccess(detail?.plan_status, detail?.trial_end));
        }, 0);
      } else {
        setAccessLevel("full");
        setIsStaff(false);
      }
    });

    // Prime with current session in case no auth event fires immediately.
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      setSession((prev: any) => prev ?? s);
      setLoading(false);
    });

    // Safety net: never stay in loading forever.
    const failsafe = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 4000);

    return () => {
      mounted = false;
      clearTimeout(failsafe);
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-royal" />
      </div>
    );
  }

  if (!session) return <Navigate to="/auth?mode=login" replace />;

  if (accessLevel === "blocked") {
    const logOut = () => supabase.auth.signOut().then(() => window.location.assign("/"));
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary p-6">
        <div className="max-w-md text-center bg-card border rounded-2xl p-8 shadow-lg">
          {blockReason === "cancelled" ? (
            <>
              <h1 className="font-heading font-bold text-2xl text-primary mb-2">Account suspended</h1>
              <p className="text-muted-foreground">Your Doctylia account is currently suspended. Please contact support for assistance.</p>
            </>
          ) : isStaff ? (
            <>
              <h1 className="font-heading font-bold text-2xl text-primary mb-2">Access unavailable</h1>
              <p className="text-muted-foreground">Your clinic's Doctylia plan needs to be renewed. Please contact your administrator to restore access.</p>
            </>
          ) : (
            <>
              <h1 className="font-heading font-bold text-2xl text-primary mb-2">Your trial has ended</h1>
              <p className="text-muted-foreground">Upgrade to a paid plan to get back into your dashboard — your data is safe and waiting for you.</p>
              {/* Embedded directly rather than a link to /admin/billing —
                  that route is behind this same ProtectedRoute, so a blocked
                  doctor would just hit this wall again. */}
              <div className="flex flex-col sm:flex-row gap-2 mt-4">
                <UpgradeCheckoutDialog targetTier="pro" trigger={<Button variant="outline" className="w-full">Reactivate Pro</Button>} />
                <UpgradeCheckoutDialog targetTier="premium" trigger={<Button className="w-full bg-royal hover:bg-royal/90">Reactivate Premium</Button>} />
              </div>
            </>
          )}
          <button onClick={logOut} className="mt-4 text-royal text-sm hover:underline block mx-auto">Log out</button>
        </div>
      </div>
    );
  }

  return (
    <TrialStatusProvider value={{ accessLevel, isStaff, graceEndsAt: accessLevel === "grace" ? graceEndsAtFrom(trialEnd) : null }}>
      {children}
    </TrialStatusProvider>
  );
};

export default ProtectedRoute;
