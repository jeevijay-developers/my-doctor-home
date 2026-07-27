import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

type Status = "loading" | "no-session" | "not-admin" | "ok";

const SuperAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatus] = useState<Status>("loading");
  const statusRef = useRef<Status>("loading");
  const resolvedRef = useRef(false);

  const update = (next: Status) => {
    statusRef.current = next;
    if (next !== "loading") resolvedRef.current = true;
    setStatus((prev) => (prev === next ? prev : next));
  };

  useEffect(() => {
    let mounted = true;

    const verify = (session: any) => {
      if (!session) {
        // Only downgrade to no-session if we haven't already authorised.
        // Token refresh events with a transient null must not evict an admin.
        if (mounted && statusRef.current !== "ok") update("no-session");
        return;
      }
      // Skip re-verification once we've confirmed admin — prevents
      // token-refresh churn from triggering redirects.
      if (statusRef.current === "ok") return;

      setTimeout(async () => {
        const { data: isAdmin } = await supabase.rpc("has_role", {
          _user_id: session.user.id,
          _role: "admin",
        });
        if (!mounted) return;
        update(isAdmin ? "ok" : "not-admin");
      }, 0);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      verify(session);
    });
    supabase.auth.getSession().then(({ data: { session } }) => verify(session));

    const failsafe = setTimeout(() => {
      if (mounted && !resolvedRef.current) update("no-session");
    }, 5000);

    return () => {
      mounted = false;
      clearTimeout(failsafe);
      subscription.unsubscribe();
    };
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
