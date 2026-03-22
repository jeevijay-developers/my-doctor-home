import { Routes, Route, Navigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import DashboardHome from "@/components/admin/DashboardHome";
import MyWebsite from "@/components/admin/MyWebsite";
import AppointmentsPage from "@/components/admin/AppointmentsPage";
import PatientsPage from "@/components/admin/PatientsPage";
import BlogPage from "@/components/admin/BlogPage";
import BillingPage from "@/components/admin/BillingPage";
import SettingsPage from "@/components/admin/SettingsPage";
import PrescriptionsPage from "@/components/admin/PrescriptionsPage";
import ReviewsManagePage from "@/components/admin/ReviewsManagePage";

const AdminDashboard = () => (
  <AdminLayout>
    <Routes>
      <Route path="dashboard" element={<DashboardHome />} />
      <Route path="my-website" element={<MyWebsite />} />
      <Route path="appointments" element={<AppointmentsPage />} />
      <Route path="patients" element={<PatientsPage />} />
      <Route path="blog" element={<BlogPage />} />
      <Route path="billing" element={<BillingPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="prescriptions" element={<PrescriptionsPage />} />
      <Route path="reviews" element={<ReviewsManagePage />} />
      <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
    </Routes>
  </AdminLayout>
);

export default AdminDashboard;
