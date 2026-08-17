import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import PermissionGate from "@/components/admin/PermissionGate";
import { ProfileProvider } from "@/hooks/useProfile";

const DashboardHome = lazy(() => import("@/components/admin/DashboardHome"));
const MyWebsite = lazy(() => import("@/components/admin/MyWebsite"));
const AppointmentsPage = lazy(() => import("@/components/admin/AppointmentsPage"));
const PatientsPage = lazy(() => import("@/components/admin/PatientsPage"));
const PatientMedicalRecord = lazy(() => import("@/components/admin/PatientMedicalRecord"));
const BlogPage = lazy(() => import("@/components/admin/BlogPage"));
const BillingPage = lazy(() => import("@/components/admin/BillingPage"));
const SettingsPage = lazy(() => import("@/components/admin/SettingsPage"));
const PrescriptionsPage = lazy(() => import("@/components/admin/PrescriptionsPage"));
const ReviewsManagePage = lazy(() => import("@/components/admin/ReviewsManagePage"));
const StaffManagementPage = lazy(() => import("@/components/admin/StaffManagementPage"));
const SupportPage = lazy(() => import("@/components/admin/SupportPage"));

const PageFallback = () => (
  <div className="flex items-center justify-center py-24">
    <Loader2 className="h-7 w-7 animate-spin text-royal" />
  </div>
);

// Each route is wrapped in PermissionGate — the sidebar already hides links
// staff can't use, but a manually-typed URL must be blocked here too (spec
// section 8). Doctors always pass through untouched (PermissionGate is a
// no-op unless the current session is staff).
const AdminDashboard = () => (
  <ProfileProvider>
    <AdminLayout>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="dashboard" element={<PermissionGate permission="dashboard.view"><DashboardHome /></PermissionGate>} />
          <Route path="my-website" element={<PermissionGate permission="website.view"><MyWebsite /></PermissionGate>} />
          <Route path="appointments" element={<PermissionGate permission="appointments.view"><AppointmentsPage /></PermissionGate>} />
          <Route path="patients" element={<PermissionGate permission="patients.view"><PatientsPage /></PermissionGate>} />
          <Route path="patients/:patientId" element={<PermissionGate permission="patients.view"><PatientMedicalRecord /></PermissionGate>} />
          <Route path="blog" element={<PermissionGate permission="blog.view"><BlogPage /></PermissionGate>} />
          <Route path="billing" element={<PermissionGate permission="billing.view"><BillingPage /></PermissionGate>} />
          {/* Profile now lives inside Settings as a tab — this old direct URL just
              redirects there so existing bookmarks/links keep working. */}
          <Route path="profile" element={<Navigate to="/admin/settings?tab=profile" replace />} />
          <Route path="settings" element={<PermissionGate permission="profile.view"><SettingsPage /></PermissionGate>} />
          <Route path="prescriptions" element={<PermissionGate permission="prescriptions.view"><PrescriptionsPage /></PermissionGate>} />
          <Route path="reviews" element={<PermissionGate permission="reviews.view"><ReviewsManagePage /></PermissionGate>} />
          <Route path="staff" element={<PermissionGate permission="staff.view"><StaffManagementPage /></PermissionGate>} />
          {/* Not permission-gated — same as the sidebar's old Contact Support
              trigger before this became a page. There's no staff.* permission
              key for support requests, and RLS already scopes support_tickets
              to auth.uid() = doctor_id, so a staff session lands on a correctly
              empty page rather than someone else's data. */}
          <Route path="support" element={<SupportPage />} />
          <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
        </Routes>
      </Suspense>
    </AdminLayout>
  </ProfileProvider>
);

export default AdminDashboard;
