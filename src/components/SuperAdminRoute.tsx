import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const SuperAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatus] = useState<"loading" | "no-session" | "not-admin" | "ok">("loading");

  useEffect(() => {
    let mounted = true;
    const check = async (session: any) => {
      if (!session) {
        if (mounted) setStatus("no-session");
        return;
      }
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: session.user.id,
        _role: "admin",
      });
      if (!mounted) return;
      setStatus(isAdmin ? "ok" : "not-admin");
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      check(session);
    });
    supabase.auth.getSession().then(({ data: { session } }) => check(session));

    return () => {
      mounted = false;
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
