import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ArrowRight, Loader2, CheckCircle, Shield, Calendar, Users, TrendingUp, Heart } from "lucide-react";
import { motion } from "framer-motion";
import type { Session } from "@supabase/supabase-js";
import PhoneOtpForm from "@/components/auth/PhoneOtpForm";
import loginDoctor from "@/assets/login-doctor.png";
import avatar1 from "@/assets/testimonial-doctor-1.png";
import avatar2 from "@/assets/testimonial-doctor-2.png";
import avatar3 from "@/assets/testimonial-doctor-3.png";

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
    { icon: Calendar, title: "Online Appointments", text: "Let patients book, reschedule and manage appointments easily." },
    { icon: Users, title: "Patient Management", text: "Keep your patient records, history and communication in one place." },
    { icon: TrendingUp, title: "Grow Your Practice", text: "Get more visibility, build trust and attract new patients." },
  ];

  if (checkingSession) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-secondary">
        <Loader2 className="h-8 w-8 animate-spin text-royal" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-white">
      <header className="w-full flex items-center justify-between px-5 sm:px-8 lg:px-10 py-4 border-b border-border/60">
        <Link to="/" className="inline-flex items-center gap-2.5">
          <img src="/doctylia-logo.webp" alt="Doctylia" className="h-8 sm:h-9" />
          <span className="hidden sm:block text-xs text-muted-foreground border-l border-border pl-2.5">
            The Complete Doctor Platform
          </span>
        </Link>
        <nav className="hidden lg:flex items-center gap-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Heart className="h-4 w-4 text-royal" /> Better Care
          </span>
          <span className="flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-royal" /> Smarter Practice
          </span>
          <span className="flex items-center gap-1.5">
            <Shield className="h-4 w-4 text-royal" /> Healthier Tomorrow
          </span>
        </nav>
      </header>

      <div className="flex-1 flex relative overflow-hidden">
        <img
          src={loginDoctor}
          alt="Doctor using Doctylia"
          className="hidden lg:block absolute inset-0 w-full h-full object-cover object-[center_15%]"
        />
        <div className="hidden lg:block absolute inset-0 bg-gradient-to-r from-white/60 via-white/15 to-white/35" />

        <div className="hidden lg:flex lg:w-1/2 relative p-10 flex-col justify-center">
          <div className="relative z-10 space-y-6 max-w-lg">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> Trusted by 10,000+ Doctors
            </span>

            <h2 className="font-heading font-extrabold text-4xl text-primary leading-tight">
              Manage Your Patients,<br />
              <span className="text-royal">Grow Your Practice</span>
            </h2>
            <p className="text-muted-foreground text-sm max-w-sm">
              Doctylia helps you book appointments, consult online, manage patients and build your digital presence — all in one place.
            </p>

            <div className="space-y-4">
              {trustPoints.map((tp, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.15 }}
                  className="flex items-start gap-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-royal/10 flex items-center justify-center flex-shrink-0">
                    <tp.icon className="h-5 w-5 text-royal" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-primary">{tp.title}</p>
                    <p className="text-xs text-muted-foreground">{tp.text}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <p className="font-script text-2xl text-royal/70 pt-1">Your Patients → Our Priority</p>
          </div>

          <div className="absolute right-0 bottom-10 top-24 w-[46%] hidden xl:block pointer-events-none">
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-2 right-0 bg-white rounded-xl shadow-lg px-3 py-2 border border-border"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-royal/10 flex items-center justify-center">
                  <Users className="h-4 w-4 text-royal" />
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground leading-tight">Total Patients</div>
                  <div className="text-sm font-bold text-primary leading-tight flex items-center gap-1">
                    1,248 <span className="text-success text-xs">↑12%</span>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, delay: 1, repeat: Infinity, ease: "easeInOut" }}
              className="absolute bottom-24 -left-10 bg-white rounded-xl shadow-lg px-3 py-2.5 border border-border flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-full bg-royal/10 flex items-center justify-center flex-shrink-0">
                <Calendar className="h-4 w-4 text-royal" />
              </div>
              <div className="pr-1">
                <div className="text-[10px] text-muted-foreground leading-tight">Upcoming Appointment</div>
                <div className="text-sm font-bold text-primary leading-tight">10:30 AM</div>
                <div className="text-[10px] text-muted-foreground leading-tight">Today, 18 Oct 2025</div>
              </div>
              <div className="w-7 h-7 rounded-full bg-royal flex items-center justify-center flex-shrink-0">
                <ArrowRight className="h-3.5 w-3.5 text-white" />
              </div>
            </motion.div>

            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, delay: 2, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -bottom-6 -left-10 bg-white rounded-full shadow-lg pl-1 pr-3 py-1 border border-border flex items-center gap-2"
            >
              <div className="flex -space-x-2">
                {[avatar1, avatar2, avatar3].map((src, i) => (
                  <img key={i} src={src} alt="" className="h-7 w-7 rounded-full object-cover border-2 border-white" />
                ))}
              </div>
              <div className="leading-tight">
                <div className="text-xs font-bold text-primary">10,000+</div>
                <div className="text-[9px] text-muted-foreground">Happy Doctors</div>
              </div>
            </motion.div>
          </div>
        </div>

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8 bg-secondary lg:bg-transparent">
          <div className="lg:hidden mb-6 text-center">
            <Link to="/">
              <img src="/doctylia-logo.webp" alt="Doctylia" className="h-9 mx-auto mb-2" />
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

            <div className="relative overflow-hidden bg-card rounded-2xl shadow-xl border border-border p-5 sm:p-7">
              <div
                className="absolute top-0 right-0 w-16 h-16 opacity-40 pointer-events-none"
                style={{
                  backgroundImage: "radial-gradient(hsl(var(--royal)) 1px, transparent 1px)",
                  backgroundSize: "8px 8px",
                }}
              />
              <div className="text-center mb-6 relative">
                <img src="/doctylia-logo.webp" alt="Doctylia" className="h-8 mx-auto mb-3" />
                <span className="inline-block rounded-full bg-royal/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-royal mb-3">
                  DOCTYLIA FOR DOCTORS
                </span>
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
                    <button type="button" onClick={() => setMode("login")} className="text-royal font-medium hover:underline">
                      Log In
                    </button>
                  </p>
                ) : (
                  <p>
                    Don&apos;t have an account?{" "}
                    <button type="button" onClick={() => setMode("signup")} className="text-royal font-medium hover:underline">
                      Sign Up Free
                    </button>
                  </p>
                )}
              </div>

              <div className="flex items-center justify-center gap-1.5 mt-5 text-xs text-muted-foreground">
                <Shield className="h-3.5 w-3.5" />
                Your data is secure and encrypted
              </div>
            </div>

            <div className="lg:hidden mt-6 space-y-3">
              {trustPoints.map((tp, i) => (
                <div key={i} className="flex items-center gap-3 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-success flex-shrink-0" />
                  <span>{tp.title}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      <div className="hidden lg:block text-center py-3">
        <p className="text-muted-foreground/60 text-xs">
          © {new Date().getFullYear()} Doctylia by Jeevijay Technologies Pvt. Ltd.
        </p>
      </div>
    </div>
  );
};

export default Auth;
