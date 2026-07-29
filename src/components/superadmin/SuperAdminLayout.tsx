import { Outlet, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Shield } from "lucide-react";
import SuperAdminSidebar from "./SuperAdminSidebar";
import { usePanelTheme } from "@/hooks/usePanelTheme";
import ThemeToggle from "@/components/ThemeToggle";

const titles: Record<string, string> = {
  "/superadmin/overview": "Overview",
  "/superadmin/doctors": "Doctors",
  "/superadmin/leads": "Leads",
  "/superadmin/subscriptions": "Subscriptions",
  "/superadmin/tickets": "Support Tickets",
  "/superadmin/moderation": "Content Moderation",
  "/superadmin/billing": "Billing",
  "/superadmin/flags": "Feature Flags",
  "/superadmin/audit-log": "Audit Log",
  "/superadmin/team": "Team",
};

const SuperAdminLayout = () => {
  const location = useLocation();
  const title = Object.entries(titles).find(([k]) => location.pathname.startsWith(k))?.[1] || "Super Admin";
  const { mode, setTheme } = usePanelTheme("doctylia-superadmin-theme");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <SuperAdminSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center justify-between bg-background px-4 md:px-6">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div className="hidden md:block h-5 w-px bg-border" />
              <div className="hidden md:flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-primary" />
                <span className="font-semibold text-foreground">{title}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle mode={mode} onChange={setTheme} />
              <span className="text-[10px] uppercase tracking-wider bg-primary text-primary-foreground px-2 py-1 rounded font-bold">
                Super Admin
              </span>
            </div>
          </header>
          <main className="flex-1 bg-background p-4 md:p-6 overflow-auto">

            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default SuperAdminLayout;
