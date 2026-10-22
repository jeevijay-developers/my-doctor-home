import { Suspense, lazy, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import LandingPage from "./pages/LandingPage";
import ProtectedRoute from "./components/ProtectedRoute";
import MaintenanceGate from "./components/MaintenanceGate";
import Analytics from "./components/shared/Analytics";

const AboutPage = lazy(() => import("./pages/AboutPage"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));
const Auth = lazy(() => import("./pages/Auth"));
const StaffLogin = lazy(() => import("./pages/StaffLogin"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const DoctorPublicPage = lazy(() => import("./pages/DoctorPublicPage"));
const BlogListPage = lazy(() => import("./pages/BlogListPage"));
const BlogPostPage = lazy(() => import("./pages/BlogPostPage"));
const ManageAppointment = lazy(() => import("./pages/ManageAppointment"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
const SuperAdminRoute = lazy(() => import("./components/SuperAdminRoute"));
const SuperAdminLayout = lazy(() => import("./components/superadmin/SuperAdminLayout"));
const SAOverview = lazy(() => import("./components/superadmin/SAOverview"));
const SADoctors = lazy(() => import("./components/superadmin/SADoctors"));
const SADoctorDetail = lazy(() => import("./components/superadmin/SADoctorDetail"));
const SALeads = lazy(() => import("./components/superadmin/SALeads"));
const SASubscriptions = lazy(() => import("./components/superadmin/SASubscriptions"));
const SATickets = lazy(() => import("./components/superadmin/SATickets"));
const SAModeration = lazy(() => import("./components/superadmin/SAModeration"));
const SABilling = lazy(() => import("./components/superadmin/SABilling"));
const SAPayments = lazy(() => import("./components/superadmin/SAPayments"));
const SAFlags = lazy(() => import("./components/superadmin/SAFlags"));
const SAAuditLog = lazy(() => import("./components/superadmin/SAAuditLog"));
const SANotificationTesting = lazy(() => import("./components/superadmin/SANotificationTesting"));
const SATeam = lazy(() => import("./components/superadmin/SATeam"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="h-7 w-7 animate-spin text-royal" />
  </div>
);

// Cross-page nav links (e.g. the footer's "About Us") land you at whatever
// scroll position the target page's route last rendered at — React Router
// doesn't reset scroll on navigation the way a full page load does. This
// resets to the top on every route change; a hash present in the URL (the
// "/#section" links LandingNavbar/LandingFooter use) is left alone, since
// LandingPage's own effect scrolls those to the target section instead.
const ScrollToTop = () => {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <Analytics />
        <MaintenanceGate>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/refund-policy" element={<RefundPolicy />} />
              <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/staff-login" element={<StaffLogin />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
              <Route path="/admin/*" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/superadmin" element={<SuperAdminRoute><SuperAdminLayout /></SuperAdminRoute>}>
                <Route index element={<Navigate to="overview" replace />} />
                <Route path="overview" element={<SAOverview />} />
                <Route path="doctors" element={<SADoctors />} />
                <Route path="doctors/:id" element={<SADoctorDetail />} />
                <Route path="leads" element={<SALeads />} />
                <Route path="subscriptions" element={<SASubscriptions />} />
                <Route path="tickets" element={<SATickets />} />
                <Route path="moderation" element={<SAModeration />} />
                <Route path="billing" element={<SABilling />} />
                <Route path="payments" element={<SAPayments />} />
                <Route path="flags" element={<SAFlags />} />
                <Route path="audit-log" element={<SAAuditLog />} />
                <Route path="notifications" element={<SANotificationTesting />} />
                <Route path="team" element={<SATeam />} />
              </Route>
              <Route path="/dr/:slug" element={<DoctorPublicPage />} />
              <Route path="/dr/:slug/blog" element={<BlogListPage />} />
              <Route path="/dr/:slug/blog/:postId" element={<BlogPostPage />} />
              <Route path="/dr/:slug/manage" element={<ManageAppointment />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </MaintenanceGate>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
