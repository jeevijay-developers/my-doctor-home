import { Outlet, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import SuperAdminSidebar from "./SuperAdminSidebar";

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
  const [userName, setUserName] = useState("Admin");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const n = (data.user?.user_metadata as any)?.full_name || data.user?.email?.split("@")[0] || "Admin";
      setUserName(n);
    });
  }, []);

  return (
    <SidebarProvider>
      <div className="sa-theme min-h-screen flex w-full bg-[#F7F9FC]">
        <SuperAdminSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 flex items-center justify-between bg-white px-4 md:px-8 border-b border-slate-100">
            <div className="flex items-center gap-3 flex-1 max-w-xl">
              <SidebarTrigger className="text-slate-500 hover:text-slate-900" />
              <div className="relative flex-1 hidden md:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="w-full h-10 pl-9 pr-4 rounded-full bg-slate-50 border border-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-royal/20 focus:border-royal/40"
                />
              </div>
              <div className="md:hidden font-heading font-bold text-slate-900">{title}</div>
            </div>
            <div className="flex items-center gap-3 text-right">
              <div className="hidden sm:block">
                <div className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">Welcome</div>
                <div className="text-sm font-semibold text-slate-900">{userName}</div>
              </div>
              <span className="text-[10px] uppercase tracking-wider bg-royal text-white px-2.5 py-1 rounded-full font-bold">
                Super Admin
              </span>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-8 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default SuperAdminLayout;
