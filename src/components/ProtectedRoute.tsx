import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [suspended, setSuspended] = useState(false);

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
            .select("plan_status")
            .eq("id", s.user.id)
            .maybeSingle();
          if (mounted) setSuspended(prof?.plan_status === "cancelled");
        }, 0);
      } else {
        setSuspended(false);
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
  if (suspended) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary p-6">
        <div className="max-w-md text-center bg-card border rounded-2xl p-8 shadow-lg">
          <h1 className="font-heading font-bold text-2xl text-primary mb-2">Account suspended</h1>
          <p className="text-muted-foreground">Your Doctylia account is currently suspended. Please contact support for assistance.</p>
          <button onClick={() => supabase.auth.signOut().then(() => window.location.assign("/"))} className="mt-4 text-royal text-sm hover:underline">Log out</button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
};

export default ProtectedRoute;
