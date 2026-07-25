import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [suspended, setSuspended] = useState(false);

  useEffect(() => {
    const check = async (s: any) => {
      setSession(s);
      if (s) {
        const { data: prof } = await supabase.from("profiles").select("plan_status").eq("id", s.user.id).maybeSingle();
        setSuspended(prof?.plan_status === "cancelled");
      }
      setLoading(false);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => check(s));
    supabase.auth.getSession().then(({ data: { session } }) => check(session));
    return () => subscription.unsubscribe();
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
