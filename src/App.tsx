import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import LandingPage from "./pages/LandingPage";
import TermsOfService from "./pages/TermsOfService";
import Auth from "./pages/Auth";
import StaffLogin from "./pages/StaffLogin";
import ResetPassword from "./pages/ResetPassword";
import Onboarding from "./pages/Onboarding";
import AdminDashboard from "./pages/AdminDashboard";
import DoctorPublicPage from "./pages/DoctorPublicPage";
import BlogListPage from "./pages/BlogListPage";
import BlogPostPage from "./pages/BlogPostPage";
import ManageAppointment from "./pages/ManageAppointment";
import OAuthConsent from "./pages/OAuthConsent";
import ProtectedRoute from "./components/ProtectedRoute";
import SuperAdminRoute from "./components/SuperAdminRoute";
import SuperAdminLayout from "./components/superadmin/SuperAdminLayout";
import SAOverview from "./components/superadmin/SAOverview";
import SADoctors from "./components/superadmin/SADoctors";
import SADoctorDetail from "./components/superadmin/SADoctorDetail";
import SALeads from "./components/superadmin/SALeads";
import SASubscriptions from "./components/superadmin/SASubscriptions";
import SATickets from "./components/superadmin/SATickets";
import SAModeration from "./components/superadmin/SAModeration";
import SABilling from "./components/superadmin/SABilling";
import SAPayments from "./components/superadmin/SAPayments";
import SAFlags from "./components/superadmin/SAFlags";
import SAAuditLog from "./components/superadmin/SAAuditLog";
import SANotificationTesting from "./components/superadmin/SANotificationTesting";
import SATeam from "./components/superadmin/SATeam";
import MaintenanceGate from "./components/MaintenanceGate";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <MaintenanceGate>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/terms" element={<TermsOfService />} />
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
        </MaintenanceGate>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
