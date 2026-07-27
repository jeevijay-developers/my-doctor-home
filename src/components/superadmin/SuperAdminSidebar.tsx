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

const adminTools = [
  { title: "Overview", url: "/superadmin/overview", icon: LayoutDashboard },
  { title: "Doctors", url: "/superadmin/doctors", icon: Users },
  { title: "Subscriptions", url: "/superadmin/subscriptions", icon: CreditCard },
  { title: "Billing", url: "/superadmin/billing", icon: Receipt },
  { title: "Team", url: "/superadmin/team", icon: UserCog },
];

const insights = [
  { title: "Leads", url: "/superadmin/leads", icon: Inbox },
  { title: "Support Tickets", url: "/superadmin/tickets", icon: LifeBuoy },
  { title: "Moderation", url: "/superadmin/moderation", icon: ShieldAlert },
  { title: "Feature Flags", url: "/superadmin/flags", icon: Flag },
  { title: "Audit Log", url: "/superadmin/audit-log", icon: ScrollText },
];

const SuperAdminSidebar = () => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth?mode=login");
  };

  const renderItems = (items: typeof adminTools) => (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton asChild className="h-11">
            <NavLink
              to={item.url}
              className="text-slate-600 hover:bg-slate-100 hover:text-slate-900 rounded-xl mx-2 px-3"
              activeClassName="!bg-royal !text-white font-semibold shadow-sm hover:!bg-royal hover:!text-white"
            >
              <item.icon className="mr-3 h-[18px] w-[18px]" />
              {!collapsed && <span className="text-sm">{item.title}</span>}
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-slate-100">
      <SidebarContent className="bg-white">
        <div className="px-5 py-5 flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-full bg-royal flex items-center justify-center flex-shrink-0">
            <Shield className="h-4 w-4 text-white" />
          </div>
          {!collapsed && (
            <span className="font-heading font-bold text-slate-900 tracking-tight">Doctylia</span>
          )}
        </div>

        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-slate-400 text-[10px] uppercase tracking-widest px-5 mt-2">
              Admin tools
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>{renderItems(adminTools)}</SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-slate-400 text-[10px] uppercase tracking-widest px-5 mt-4">
              Insights
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>{renderItems(insights)}</SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="bg-white p-3 border-t border-slate-100">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="flex items-center gap-2 text-slate-500 hover:text-slate-900 text-sm w-full px-3 py-2 rounded-xl hover:bg-slate-100">
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
