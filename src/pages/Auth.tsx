import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2, CheckCircle, Shield, Zap, Users } from "lucide-react";
import { motion } from "framer-motion";
import type { Session } from "@supabase/supabase-js";
import PhoneOtpForm from "@/components/auth/PhoneOtpForm";

// Phone OTP (sent via MSG91 by the send-sms-hook auth hook) is the only way
// to log in or sign up — email/password and Google sign-in were removed.
const Auth = () => {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup">(
    searchParams.get("mode") === "login" ? "login" : "signup"
  );
  const [checkingSession, setCheckingSession] = useState(true);
  const navigate = useNavigate();

  // Preserve a same-origin relative `next` (e.g. /.lovable/oauth/consent?authorization_id=...)
  const rawNext = searchParams.get("next");
  const safeNext =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        setCheckingSession(false);
        return;
      }
      if (safeNext) {
        window.location.href = safeNext;
        return;
      }
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: session.user.id,
        _role: "admin",
      });
      if (isAdmin) {
        navigate("/superadmin", { replace: true });
      } else {
        navigate("/admin/dashboard", { replace: true });
      }
    });
  }, [navigate, safeNext]);

  const handleAuthenticated = async (session: Session) => {
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
  };

  const trustPoints = [
    { icon: Users, text: "Join 10,000+ doctors across India" },
    { icon: Zap, text: "Go live in under 5 minutes" },
    { icon: Shield, text: "7-day free trial · No credit card" },
  ];

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary">
        <Loader2 className="h-8 w-8 animate-spin text-royal" />
      </div>
    );
  }

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
            <div className="text-center mb-6">
              <h1 className="font-heading font-bold text-2xl text-primary">
                {mode === "signup" ? "Start Your Free Trial" : "Welcome Back"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {mode === "signup"
                  ? "7 days free"
                  : "Log in to your dashboard with your phone number."}
              </p>
            </div>

            <PhoneOtpForm
              mode={mode}
              onAuthenticated={handleAuthenticated}
              onRequestSignup={() => setMode("signup")}
            />

            <div className="text-center mt-5 text-sm text-muted-foreground">
              {mode === "signup" ? (
                <p>
                  Already have an account?{" "}
                  <button onClick={() => setMode("login")} className="text-royal font-medium hover:underline">
                    Log In
                  </button>
                </p>
              ) : (
                <p>
                  Don't have an account?{" "}
                  <button onClick={() => setMode("signup")} className="text-royal font-medium hover:underline">
                    Sign Up Free
                  </button>
                </p>
              )}
            </div>
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
