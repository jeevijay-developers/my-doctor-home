import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

const Auth = () => {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">(
    searchParams.get("mode") === "login" ? "login" : "signup"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/admin/dashboard");
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Password reset link sent! Check your email.");
        setMode("login");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        // Auto-confirm is enabled — user is auto-logged in
        if (data.session) {
          toast.success("Account created! Let's set up your profile.");
          navigate("/onboarding");
        } else {
          toast.success("Account created! Please check your email to verify, then log in.");
          setMode("login");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_completed")
          .single();

        if (profile?.onboarding_completed) {
          navigate("/admin/dashboard");
        } else {
          navigate("/onboarding");
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-secondary flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to Doctylia
        </Link>

        <div className="bg-white rounded-2xl shadow-lg border border-border p-8">
          <div className="text-center mb-6">
            <img src="/doctylia-logo.png" alt="Doctylia" className="h-10 mx-auto mb-4" />
            <h1 className="font-heading font-bold text-2xl text-primary">
              {mode === "signup" ? "Start Your Free Trial" : mode === "forgot" ? "Reset Password" : "Welcome Back"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "signup" ? "7 days free. No credit card required." : mode === "forgot" ? "Enter your email to receive a reset link." : "Log in to your dashboard."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <Label htmlFor="fullName">Full Name</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Dr. Rahul Sharma" required />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="doctor@example.com" required />
            </div>
            {mode !== "forgot" && (
              <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" required minLength={6} />
              </div>
            )}

            <Button type="submit" className="w-full bg-royal hover:bg-royal/90 text-white" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signup" ? "Create Account" : mode === "forgot" ? "Send Reset Link" : "Log In"}
            </Button>
          </form>

          <div className="text-center mt-5 text-sm text-muted-foreground space-y-2">
            {mode === "signup" ? (
              <p>Already have an account?{" "}
                <button onClick={() => setMode("login")} className="text-royal font-medium hover:underline">Log In</button>
              </p>
            ) : mode === "login" ? (
              <>
                <p>Don't have an account?{" "}
                  <button onClick={() => setMode("signup")} className="text-royal font-medium hover:underline">Sign Up Free</button>
                </p>
                <p>
                  <button onClick={() => setMode("forgot")} className="text-royal font-medium hover:underline">Forgot Password?</button>
                </p>
              </>
            ) : (
              <p>Remember your password?{" "}
                <button onClick={() => setMode("login")} className="text-royal font-medium hover:underline">Log In</button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
