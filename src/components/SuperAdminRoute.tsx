import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const SuperAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatus] = useState<"loading" | "no-session" | "not-admin" | "ok">("loading");

  useEffect(() => {
    let mounted = true;

    const verify = (session: any) => {
      if (!session) {
        if (mounted) setStatus("no-session");
        return;
      }
      // Defer supabase call out of the auth callback to avoid deadlocks.
      setTimeout(async () => {
        const { data: isAdmin } = await supabase.rpc("has_role", {
          _user_id: session.user.id,
          _role: "admin",
        });
        if (!mounted) return;
        setStatus(isAdmin ? "ok" : "not-admin");
      }, 0);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      verify(session);
    });
    supabase.auth.getSession().then(({ data: { session } }) => verify(session));

    const failsafe = setTimeout(() => {
      if (mounted && status === "loading") setStatus("no-session");
    }, 5000);

    return () => {
      mounted = false;
      clearTimeout(failsafe);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-royal" />
      </div>
    );
  }
  if (status === "no-session") return <Navigate to="/auth?mode=login" replace />;
  if (status === "not-admin") return <Navigate to="/" replace />;
  return <>{children}</>;
};

export default SuperAdminRoute;
