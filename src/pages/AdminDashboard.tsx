import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";

const DashboardHome = lazy(() => import("@/components/admin/DashboardHome"));
const MyWebsite = lazy(() => import("@/components/admin/MyWebsite"));
const AppointmentsPage = lazy(() => import("@/components/admin/AppointmentsPage"));
const PatientsPage = lazy(() => import("@/components/admin/PatientsPage"));
const BlogPage = lazy(() => import("@/components/admin/BlogPage"));
const BillingPage = lazy(() => import("@/components/admin/BillingPage"));
const SettingsPage = lazy(() => import("@/components/admin/SettingsPage"));
const ProfilePage = lazy(() => import("@/components/admin/ProfilePage"));
const PrescriptionsPage = lazy(() => import("@/components/admin/PrescriptionsPage"));
const ReviewsManagePage = lazy(() => import("@/components/admin/ReviewsManagePage"));

const PageFallback = () => (
  <div className="flex items-center justify-center py-24">
    <Loader2 className="h-7 w-7 animate-spin text-royal" />
  </div>
);

const AdminDashboard = () => (
  <AdminLayout>
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="dashboard" element={<DashboardHome />} />
        <Route path="my-website" element={<MyWebsite />} />
        <Route path="appointments" element={<AppointmentsPage />} />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="blog" element={<BlogPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="prescriptions" element={<PrescriptionsPage />} />
        <Route path="reviews" element={<ReviewsManagePage />} />
        <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
      </Routes>
    </Suspense>
  </AdminLayout>
);

export default AdminDashboard;
