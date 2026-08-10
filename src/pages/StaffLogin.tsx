import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";

const StaffLogin = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) { setError("Enter your login ID and password"); return; }

    setLoading(true);
    const { data, error: fnError } = await supabase.functions.invoke("staff-login", {
      body: { username: username.trim(), password },
    });
    if (fnError || !data?.session) {
      setLoading(false);
      setError("Invalid login ID or password");
      return;
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    setLoading(false);
    if (sessionError) { setError("Could not start your session. Please try again."); return; }
    navigate("/admin/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary px-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-lg p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <Link to="/">
            <img src="/doctylia-logo.png" alt="Doctylia" className="h-10 mb-4" />
          </Link>
          <div className="w-11 h-11 rounded-full bg-royal/10 flex items-center justify-center mb-3">
            <ShieldCheck className="h-5.5 w-5.5 text-royal" />
          </div>
          <h1 className="font-heading font-bold text-xl text-primary">Staff Login</h1>
          <p className="text-xs text-muted-foreground mt-1">Sign in with the login ID your clinic gave you</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="staff-username">Login ID / Username</Label>
            <Input
              id="staff-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-10"
              autoComplete="username"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-password">Password</Label>
            <PasswordInput
              id="staff-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <Button type="submit" disabled={loading} className="w-full h-10 bg-royal hover:bg-royal/90">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Login"}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default StaffLogin;
