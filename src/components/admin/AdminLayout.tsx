import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import AdminSidebar from "./AdminSidebar";

const AdminLayout = ({ children }: { children: ReactNode }) => (
  <SidebarProvider>
    <div className="min-h-screen flex w-full">
      <AdminSidebar />
      <div className="flex-1 flex flex-col">
        <header className="h-14 flex items-center border-b border-border bg-white px-4">
          <SidebarTrigger className="mr-4" />
        </header>
        <main className="flex-1 bg-secondary p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  </SidebarProvider>
);

export default AdminLayout;
