import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Loader2, CheckCircle, Shield, Zap, Users, Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";

const Auth = () => {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">(
    searchParams.get("mode") === "login" ? "login" : "signup"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const navigate = useNavigate();

  // Preserve a same-origin relative `next` (e.g. /.lovable/oauth/consent?authorization_id=...)
  const rawNext = searchParams.get("next");
  const safeNext =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      if (safeNext) {
        window.location.href = safeNext;
        return;
      }
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: session.user.id,
        _role: "admin",
      });
      if (isAdmin) {
        navigate("/superadmin");
      } else {
        navigate("/admin/dashboard");
      }
    });
  }, [navigate, safeNext]);

  const getPasswordStrength = (pwd: string) => {
    if (!pwd) return { level: 0, label: "", color: "" };
    let score = 0;
    if (pwd.length >= 6) score++;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^a-zA-Z0-9]/.test(pwd)) score++;
    if (score <= 1) return { level: 20, label: "Weak", color: "bg-destructive" };
    if (score <= 2) return { level: 40, label: "Fair", color: "bg-warning" };
    if (score <= 3) return { level: 60, label: "Good", color: "bg-teal" };
    if (score <= 4) return { level: 80, label: "Strong", color: "bg-success" };
    return { level: 100, label: "Very Strong", color: "bg-success" };
  };

  const strength = getPasswordStrength(password);

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
            emailRedirectTo: safeNext
              ? `${window.location.origin}${safeNext}`
              : window.location.origin,
          },
        });
        if (error) throw error;
        if (data.session) {
          if (safeNext) {
            window.location.href = safeNext;
            return;
          }
          toast.success("Account created! Let's set up your profile.");
          navigate("/onboarding");
        } else {
          setSignupSuccess(email);
        }
      } else {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (safeNext) {
          window.location.href = safeNext;
          return;
        }
        const { data: isAdmin } = await supabase.rpc("has_role", {
          _user_id: signInData.user.id,
          _role: "admin",
        });
        if (isAdmin) {
          navigate("/superadmin");
          return;
        }
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

  const trustPoints = [
    { icon: Users, text: "Join 10,000+ doctors across India" },
    { icon: Zap, text: "Go live in under 5 minutes" },
    { icon: Shield, text: "7-day free trial · No credit card" },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Left Brand Panel — hidden on mobile */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden gradient-navy-teal p-10 flex-col justify-between">
        {/* Decorative circles */}
        <div className="absolute top-20 -left-10 w-64 h-64 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute bottom-20 right-10 w-48 h-48 rounded-full bg-spark/10 blur-2xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full border border-white/5" />

        <div className="relative z-10">
          <Link to="/" className="inline-flex items-center gap-2 mb-2">
            <img src="/doctylia-logo.png" alt="Doctylia" className="h-10 brightness-0 invert" />
          </Link>
          <p className="text-white/50 text-sm mt-1">The Complete Doctor Platform</p>
        </div>

        <div className="relative z-10 space-y-6">
          <h2 className="font-heading font-extrabold text-3xl text-white leading-tight">
            Your patients are<br />searching online.<br />
            <span className="text-spark">Be where they look.</span>
          </h2>
          <div className="space-y-4">
            {trustPoints.map((tp, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.15 }}
                className="flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                  <tp.icon className="h-5 w-5 text-spark" />
                </div>
                <span className="text-white/80 text-sm font-medium">{tp.text}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-white/30 text-xs">© 2025 Doctylia by Jeevijay Technologies Pvt. Ltd.</p>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 bg-secondary">
        {/* Mobile brand header */}
        <div className="lg:hidden mb-6 text-center">
          <Link to="/">
            <img src="/doctylia-logo.png" alt="Doctylia" className="h-9 mx-auto mb-2" />
          </Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-5">
            <ArrowLeft className="h-4 w-4" /> Back to Doctylia
          </Link>

          <div className="bg-card rounded-2xl shadow-xl border border-border p-5 sm:p-7">
            {signupSuccess ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-7 w-7 text-success" />
                </div>
                <h1 className="font-heading font-bold text-xl text-primary mb-2">Check your email</h1>
                <p className="text-sm text-muted-foreground mb-5">
                  We sent a verification link to <strong className="text-foreground">{signupSuccess}</strong>.
                  Click it to activate your account, then log in.
                </p>
                <Button className="w-full h-11 bg-royal hover:bg-royal/90 text-white font-semibold"
                  onClick={() => { setSignupSuccess(null); setMode("login"); }}>
                  Go to Login
                </Button>
                <button
                  className="text-xs text-muted-foreground hover:text-royal mt-3"
                  onClick={() => setSignupSuccess(null)}
                >
                  Use a different email
                </button>
              </div>
            ) : (
            <>
            <div className="text-center mb-6">
              <h1 className="font-heading font-bold text-2xl text-primary">
                {mode === "signup" ? "Start Your Free Trial" : mode === "forgot" ? "Reset Password" : "Welcome Back"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {mode === "signup"
                  ? "7 days free. No credit card required."
                  : mode === "forgot"
                  ? "Enter your email to receive a reset link."
                  : "Log in to your dashboard."}
              </p>
            </div>

            {/* Google OAuth Placeholder */}
            {mode !== "forgot" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full mb-4 h-11 font-medium"
                  onClick={() => toast.info("Google login coming soon!")}
                >
                  <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Continue with Google
                </Button>
                <div className="relative mb-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-3 bg-card text-muted-foreground">or continue with email</span>
                  </div>
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div>
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Dr. Rahul Sharma"
                    required
                    className="h-11"
                  />
                </div>
              )}
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="doctor@example.com"
                  required
                  className="h-11"
                />
              </div>
              {mode !== "forgot" && (
                <div>
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      required
                      minLength={6}
                      className="h-11 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {mode === "signup" && password && (
                    <div className="mt-2 space-y-1">
                      <div className="flex gap-1">
                        {[20, 40, 60, 80, 100].map((level) => (
                          <div
                            key={level}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                              strength.level >= level ? strength.color : "bg-muted"
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{strength.label}</p>
                    </div>
                  )}
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-11 bg-royal hover:bg-royal/90 text-white font-semibold"
                disabled={loading}
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {mode === "signup" ? "Create Free Account" : mode === "forgot" ? "Send Reset Link" : "Log In"}
              </Button>
            </form>

            <div className="text-center mt-5 text-sm text-muted-foreground space-y-2">
              {mode === "signup" ? (
                <p>
                  Already have an account?{" "}
                  <button onClick={() => setMode("login")} className="text-royal font-medium hover:underline">
                    Log In
                  </button>
                </p>
              ) : mode === "login" ? (
                <>
                  <p>
                    Don't have an account?{" "}
                    <button onClick={() => setMode("signup")} className="text-royal font-medium hover:underline">
                      Sign Up Free
                    </button>
                  </p>
                  <p>
                    <button onClick={() => setMode("forgot")} className="text-royal font-medium hover:underline">
                      Forgot Password?
                    </button>
                  </p>
                </>
              ) : (
                <p>
                  Remember your password?{" "}
                  <button onClick={() => setMode("login")} className="text-royal font-medium hover:underline">
                    Log In
                  </button>
                </p>
              )}
            </div>
            </>
            )}
          </div>

          {/* Mobile trust points */}
          <div className="lg:hidden mt-6 space-y-3">
            {trustPoints.map((tp, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-success flex-shrink-0" />
                <span>{tp.text}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Auth;
