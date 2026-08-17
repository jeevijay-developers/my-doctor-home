import { LayoutDashboard, Globe, CalendarCheck, Users, CreditCard, Settings, LogOut, FileText, ClipboardList, MessageSquare, UserCog, LifeBuoy } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import type { PermissionKey } from "@/lib/staffPermissions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const mainItems: { title: string; url: string; icon: typeof LayoutDashboard; permission: PermissionKey | null }[] = [
  { title: "Dashboard", url: "/admin/dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { title: "My Website", url: "/admin/my-website", icon: Globe, permission: "website.view" },
  { title: "Appointments", url: "/admin/appointments", icon: CalendarCheck, permission: "appointments.view" },
  { title: "Patients", url: "/admin/patients", icon: Users, permission: "patients.view" },
  { title: "Prescriptions", url: "/admin/prescriptions", icon: ClipboardList, permission: "prescriptions.view" },
  { title: "Reviews", url: "/admin/reviews", icon: MessageSquare, permission: "reviews.view" },
  { title: "Blog", url: "/admin/blog", icon: FileText, permission: "blog.view" },
  { title: "Billing", url: "/admin/billing", icon: CreditCard, permission: "billing.view" },
  { title: "Staff Management", url: "/admin/staff", icon: UserCog, permission: "staff.view" },
  // Profile now lives inside Settings as a tab, so Settings is gated on
  // profile.view (not doctor-only anymore): staff who can view their own
  // profile need a way to reach it, and Settings is that page now.
  { title: "Settings", url: "/admin/settings", icon: Settings, permission: "profile.view" },
];

const AdminSidebar = () => {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const { isStaff, can, loading } = useProfile();

  // On mobile/tablet the sidebar renders as an overlay Sheet (see
  // ui/sidebar.tsx) — picking a section should navigate there AND close the
  // overlay immediately, same as any other mobile drawer nav. Desktop's
  // persistent sidebar (`state`/`open`) is untouched.
  const closeMobileSidebar = () => { if (isMobile) setOpenMobile(false); };

  // While the profile/permissions fetch is still in flight, `isStaff` hasn't
  // resolved yet and defaults to false — showing every link during that
  // window, however briefly, would mean a staff member momentarily sees
  // sections they were never granted. Show nothing until it settles instead.
  const visibleItems = loading ? [] : mainItems.filter((item) => {
    if (!isStaff) return true;
    if (item.permission === null) return false;
    return can(item.permission);
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent className="bg-sidebar">
        {/* Logo */}
        <div className="px-4 py-6 flex items-center gap-2">
          {!collapsed && (
            <>
              <img
                src="/doctylia-logo.png"
                alt="Doctylia"
                className="h-12 w-[134px] object-contain object-left select-none block dark:hidden"
                draggable={false}
                style={{ imageRendering: "-webkit-optimize-contrast" }}
              />
              <img
                src="/doctylia-logo-dark.png"
                alt="Doctylia"
                className="h-12 w-[134px] object-contain object-left select-none hidden dark:block"
                draggable={false}
                style={{ imageRendering: "-webkit-optimize-contrast" }}
              />
            </>
          )}
          {collapsed && (
            <span className="text-primary font-heading font-bold text-xl">D</span>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/70 text-xs font-semibold uppercase tracking-wider">Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild className="rounded-xl h-11">
                    <NavLink
                      to={item.url}
                      end
                      onClick={closeMobileSidebar}
                      className="text-sidebar-foreground/90 font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="!bg-primary !text-primary-foreground !font-semibold shadow-lg shadow-primary/30"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>

      <SidebarFooter className="bg-sidebar p-3 space-y-1 border-t border-sidebar-border">

        <NavLink
          to="/admin/support"
          onClick={closeMobileSidebar}
          className="flex items-center gap-2 text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent text-sm font-medium w-full px-2 py-1.5 rounded-lg transition-colors"
          activeClassName="!bg-sidebar-accent !text-sidebar-accent-foreground"
        >
          <LifeBuoy className="h-4 w-4" />
          {!collapsed && <span>Contact Support</span>}
        </NavLink>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="flex items-center gap-2 text-sidebar-foreground hover:text-destructive hover:bg-sidebar-accent text-sm font-medium w-full px-2 py-1.5 rounded-lg transition-colors">
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Logout</span>}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Log out of Doctylia?</AlertDialogTitle>
              <AlertDialogDescription>You'll need to sign in again to access your dashboard.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleLogout}>Log Out</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AdminSidebar;
