import { LayoutDashboard, Users, Inbox, CreditCard, LifeBuoy, ShieldAlert, Receipt, Flag, ScrollText, UserCog, LogOut, Shield } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Overview", url: "/superadmin/overview", icon: LayoutDashboard },
  { title: "Doctors", url: "/superadmin/doctors", icon: Users },
  { title: "Leads", url: "/superadmin/leads", icon: Inbox },
  { title: "Subscriptions", url: "/superadmin/subscriptions", icon: CreditCard },
  { title: "Support Tickets", url: "/superadmin/tickets", icon: LifeBuoy },
  { title: "Moderation", url: "/superadmin/moderation", icon: ShieldAlert },
  { title: "Billing", url: "/superadmin/billing", icon: Receipt },
  { title: "Feature Flags", url: "/superadmin/flags", icon: Flag },
  { title: "Audit Log", url: "/superadmin/audit-log", icon: ScrollText },
  { title: "Team", url: "/superadmin/team", icon: UserCog },
];

const SuperAdminSidebar = () => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth?mode=login");
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent className="bg-sidebar">
        <div className="px-4 py-6 flex items-center gap-2">
          {!collapsed ? (
            <>
              <img
                src="/doctylia-logo.png"
                alt="Doctylia"
                className="h-12 w-auto object-contain select-none"
                draggable={false}
                style={{ imageRendering: "-webkit-optimize-contrast" }}
              />
              <span className="ml-auto text-[10px] font-bold uppercase tracking-wider bg-spark text-primary px-2 py-0.5 rounded">Super</span>
            </>
          ) : (
            <Shield className="h-6 w-6 text-primary" />
          )}
        </div>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/70 text-xs font-semibold uppercase tracking-wider">Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild className="rounded-xl h-11">
                    <NavLink
                      to={item.url}
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
      <SidebarFooter className="bg-sidebar p-3 border-t border-sidebar-border">


        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="flex items-center gap-2 text-primary-foreground/60 hover:text-white text-sm w-full px-2 py-1.5">
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Logout</span>}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Log out?</AlertDialogTitle>
              <AlertDialogDescription>You'll need to sign in again to access the Super Admin console.</AlertDialogDescription>
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

export default SuperAdminSidebar;
