import { LayoutDashboard, Globe, CalendarCheck, Users, CreditCard, Settings, LogOut, FileText, ClipboardList, MessageSquare, UserCircle } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ContactSupportDialog from "./ContactSupportDialog";
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

const mainItems = [
  { title: "Dashboard", url: "/admin/dashboard", icon: LayoutDashboard },
  { title: "My Website", url: "/admin/my-website", icon: Globe },
  { title: "Appointments", url: "/admin/appointments", icon: CalendarCheck },
  { title: "Patients", url: "/admin/patients", icon: Users },
  { title: "Prescriptions", url: "/admin/prescriptions", icon: ClipboardList },
  { title: "Reviews", url: "/admin/reviews", icon: MessageSquare },
  { title: "Blog", url: "/admin/blog", icon: FileText },
  { title: "Billing", url: "/admin/billing", icon: CreditCard },
  { title: "Profile", url: "/admin/profile", icon: UserCircle },
  { title: "Settings", url: "/admin/settings", icon: Settings },
];

const AdminSidebar = () => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();

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
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild className="rounded-xl h-11">
                    <NavLink
                      to={item.url}
                      end
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

        <ContactSupportDialog />
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
