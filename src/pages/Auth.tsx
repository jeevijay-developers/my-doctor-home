import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2, Check } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import PhoneOtpForm from "@/components/auth/PhoneOtpForm";

const PRIMARY = "#3C83FC";
const LIME = "#BFE038";
const NAVY = "hsl(234 82% 24%)";

const Auth = () => {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup">(
    searchParams.get("mode") === "login" ? "login" : "signup"
  );
  const [checkingSession, setCheckingSession] = useState(true);
  const navigate = useNavigate();

  const rawNext = searchParams.get("next");
  const safeNext =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;

  useEffect(() => {
    const prevTitle = document.title;
    document.title = mode === "signup" ? "Create Doctor Account | Doctylia" : "Doctor Login | Doctylia";
    const metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc?.getAttribute("content") ?? null;
    if (metaDesc) {
      metaDesc.setAttribute(
        "content",
        mode === "signup"
          ? "Start your 7-day free trial on Doctylia. Create your clinic booking website and practice management dashboard within 10 minutes."
          : "Sign in to your Doctylia doctor dashboard to manage appointments, patients, prescriptions, and billing."
      );
    }
    return () => {
      document.title = prevTitle;
      if (metaDesc && prevDesc !== null) metaDesc.setAttribute("content", prevDesc);
    };
  }, [mode]);

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
    "Join 2,500+ doctors across India",
    "Go live within 10 minutes",
    "7-day free trial. No credit card",
  ];

  if (checkingSession) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-secondary">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: PRIMARY }} />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex overflow-x-hidden">
      <aside
        className="hidden lg:flex lg:w-[44%] p-10 flex-col justify-between"
        style={{ backgroundColor: NAVY }}
      >
        <Link to="/" className="inline-flex items-center">
          <img src="/doctylia-logo.webp" alt="Doctylia" className="h-10 brightness-0 invert" />
        </Link>

        <div className="space-y-8">
          <h2 className="font-heading font-extrabold text-4xl text-white leading-[1.15] tracking-tight">
            Your patients are searching online.
            <span className="block mt-2" style={{ color: LIME }}>
              Be where they look.
            </span>
          </h2>
          <ul className="space-y-3">
            {trustPoints.map((text) => (
              <li key={text} className="flex items-start gap-3 text-white/85 text-sm font-medium">
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: LIME }}
                >
                  <Check className="h-3 w-3 text-navy" strokeWidth={3} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-white/40 text-xs">
          © {new Date().getFullYear()} Doctylia by Jeevijay Technologies Pvt. Ltd.
        </p>
      </aside>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 bg-secondary">
        <div className="lg:hidden mb-6 text-center">
          <Link to="/">
            <img src="/doctylia-logo.webp" alt="Doctylia" className="h-9 mx-auto" />
          </Link>
        </div>

        <div className="w-full max-w-md">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-5"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Doctylia
          </Link>

          <div className="bg-card rounded-2xl border border-border p-5 sm:p-7">
            <div className="mb-6">
              <h1 className="font-heading font-bold text-2xl text-foreground">
                {mode === "signup" ? "Start your free trial" : "Welcome back"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {mode === "signup"
                  ? "7 days free. Phone OTP only."
                  : "Log in with your clinic phone number."}
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
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className="font-medium hover:underline"
                    style={{ color: PRIMARY }}
                  >
                    Log in
                  </button>
                </p>
              ) : (
                <p>
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    className="font-medium hover:underline"
                    style={{ color: PRIMARY }}
                  >
                    Sign up free
                  </button>
                </p>
              )}
            </div>
          </div>

          <ul className="lg:hidden mt-6 space-y-2.5">
            {trustPoints.map((text) => (
              <li key={text} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <Check className="h-4 w-4 mt-0.5 shrink-0" style={{ color: LIME }} strokeWidth={2.5} />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Auth;
