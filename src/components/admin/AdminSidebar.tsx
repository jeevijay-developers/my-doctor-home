import { LayoutDashboard, Globe, CalendarCheck, Users, CreditCard, Settings, LogOut } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
  { title: "Billing", url: "/admin/billing", icon: CreditCard },
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
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarContent className="bg-primary">
        {/* Logo */}
        <div className="px-4 py-5 flex items-center gap-2">
          {!collapsed && (
            <img src="/doctylia-logo.png" alt="Doctylia" className="h-7 brightness-0 invert" />
          )}
          {collapsed && (
            <span className="text-white font-heading font-bold text-lg">D</span>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className="text-primary-foreground/40 text-xs uppercase">Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="text-primary-foreground/70 hover:bg-sidebar-accent hover:text-white"
                      activeClassName="bg-sidebar-accent text-white font-medium"
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

      <SidebarFooter className="bg-primary p-3">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-primary-foreground/60 hover:text-white text-sm w-full px-2 py-1.5"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Logout</span>}
        </button>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AdminSidebar;
