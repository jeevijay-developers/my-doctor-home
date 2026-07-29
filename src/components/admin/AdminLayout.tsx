import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useProfile } from "@/hooks/useProfile";
import { useLocation, Link } from "react-router-dom";
import { Bell, BellOff, ChevronRight, Home, Megaphone } from "lucide-react";
import AdminSidebar from "./AdminSidebar";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePanelTheme } from "@/hooks/usePanelTheme";
import ThemeToggle from "@/components/ThemeToggle";

const pageTitles: Record<string, string> = {
  "/admin/dashboard": "Dashboard",
  "/admin/my-website": "My Website",
  "/admin/appointments": "Appointments",
  "/admin/patients": "Patients",
  "/admin/blog": "Blog",
  "/admin/billing": "Billing",
  "/admin/profile": "Profile",
  "/admin/settings": "Settings",
};

const AdminLayout = ({ children }: { children: ReactNode }) => {
  const { profile } = useProfile();
  const location = useLocation();
  const pageTitle = pageTitles[location.pathname] || "Dashboard";
  const { settings } = usePlatformSettings();
  const banner = typeof settings.announcement_banner === "string" ? settings.announcement_banner : "";
  const { mode, setTheme } = usePanelTheme("doctylia-admin-theme");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AdminSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center justify-between bg-background px-4 md:px-6">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div className="hidden md:block h-5 w-px bg-border" />
              <div className="hidden md:flex items-center gap-1.5 text-sm">
                <Link to="/admin/dashboard" className="text-muted-foreground hover:text-foreground">
                  <Home className="h-3.5 w-3.5" />
                </Link>
                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                <span className="font-semibold text-foreground">{pageTitle}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle mode={mode} onChange={setTheme} />
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    aria-label="Notifications"
                    className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors relative"
                  >
                    <Bell className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-0">
                  <div className="px-4 py-3 border-b border-border">
                    <h4 className="font-semibold text-sm text-foreground">Notifications</h4>
                  </div>
                  <div className="p-6 flex flex-col items-center justify-center text-center">
                    <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center mb-3">
                      <BellOff className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground">No notifications yet</p>
                    <p className="text-xs text-muted-foreground mt-1">You're all caught up.</p>
                  </div>
                </PopoverContent>
              </Popover>
              <div className="h-5 w-px bg-border" />
              <Link to="/admin/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                {profile?.profile_photo_url ? (
                  <img src={profile.profile_photo_url} alt="" className="w-8 h-8 rounded-full object-cover border border-border" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-royal/10 flex items-center justify-center text-xs font-bold text-royal">
                    {profile?.full_name?.charAt(0)?.toUpperCase() || "D"}
                  </div>
                )}
                <div className="hidden md:block text-left">
                  <div className="text-xs font-medium text-foreground leading-tight">{profile?.full_name || "Doctor"}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight">{profile?.specialization || "Doctor"}</div>
                </div>
              </Link>
            </div>
          </header>
          {banner && (
            <div className="bg-spark/20 border-b border-spark/30 px-4 py-2 flex items-center gap-2 text-sm text-primary">
              <Megaphone className="h-4 w-4 flex-shrink-0" />
              <span>{banner}</span>
            </div>
          )}
          <main className="flex-1 bg-background p-4 md:p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AdminLayout;
