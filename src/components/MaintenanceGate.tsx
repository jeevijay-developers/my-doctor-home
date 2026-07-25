import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { Wrench } from "lucide-react";

const MaintenanceGate = ({ children }: { children: ReactNode }) => {
  const { settings, loading } = usePlatformSettings();
  const location = useLocation();
  const isSuperAdmin = location.pathname.startsWith("/superadmin");
  const isAuth = location.pathname.startsWith("/auth");

  if (loading) return <>{children}</>;
  if (settings.maintenance_mode !== true || isSuperAdmin || isAuth) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary p-6">
      <div className="max-w-md text-center bg-card border rounded-2xl p-8 shadow-lg">
        <div className="w-14 h-14 rounded-xl bg-royal/10 flex items-center justify-center mx-auto mb-4">
          <Wrench className="h-7 w-7 text-royal" />
        </div>
        <h1 className="font-heading font-bold text-2xl text-primary mb-2">We'll be right back</h1>
        <p className="text-muted-foreground">Doctylia is undergoing scheduled maintenance. Please check back shortly.</p>
      </div>
    </div>
  );
};

export default MaintenanceGate;
