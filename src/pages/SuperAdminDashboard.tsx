import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, Shield } from "lucide-react";

const SuperAdminDashboard = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth?mode=login");
  };

  return (
    <div className="min-h-screen bg-secondary">
      <header className="bg-primary text-primary-foreground px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/doctylia-logo.png" alt="Doctylia" className="h-7 brightness-0 invert" />
          <span className="text-xs uppercase tracking-wider bg-white/10 px-2 py-1 rounded">
            Super Admin
          </span>
        </div>
        <Button onClick={handleLogout} variant="ghost" size="sm" className="text-white hover:bg-white/10">
          <LogOut className="h-4 w-4 mr-2" /> Log Out
        </Button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-16">
        <div className="bg-card rounded-2xl border border-border p-8 shadow-sm">
          <div className="w-14 h-14 rounded-xl bg-royal/10 flex items-center justify-center mb-4">
            <Shield className="h-7 w-7 text-royal" />
          </div>
          <h1 className="font-heading font-extrabold text-3xl text-primary">Super Admin</h1>
          <p className="text-muted-foreground mt-2">
            Welcome{email ? `, ${email}` : ""}. The full Super Admin control panel — doctors, leads,
            subscriptions, and more — is coming soon.
          </p>
        </div>
      </main>
    </div>
  );
};

export default SuperAdminDashboard;
