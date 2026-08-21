import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useProfile } from "@/hooks/useProfile";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { AlertTriangle, Bell, BellOff, ChevronRight, Clock, CreditCard, Gauge, Home, Megaphone, MessageSquare, Radio, LifeBuoy } from "lucide-react";
import AdminSidebar from "./AdminSidebar";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePanelTheme } from "@/hooks/usePanelTheme";
import ThemeToggle from "@/components/ThemeToggle";
import { useDoctorNotifications, type DoctorNotification } from "@/hooks/useDoctorNotifications";
import { useTrialStatus } from "@/contexts/TrialStatusContext";
import { Button } from "@/components/ui/button";
import UpgradeCheckoutDialog from "./UpgradeCheckoutDialog";

const SOURCE_ICON: Record<DoctorNotification["source_type"], typeof MessageSquare> = {
  ticket_reply: LifeBuoy,
  direct_message: MessageSquare,
  broadcast: Radio,
  trial_warning: Clock,
  cap_warning: Gauge,
  plan_warning: CreditCard,
};

// Coarse "Xh" / "Xd Yh" remaining, not a live-ticking countdown — this is a
// soft/UI-level nudge (see TrialStatusContext), re-derived on every render
// rather than a timer, which is precise enough given how often admin pages
// naturally re-render/navigate during a session.
function formatGraceRemaining(endsAt: Date | null): string | null {
  if (!endsAt) return null;
  const ms = endsAt.getTime() - Date.now();
  if (ms <= 0) return null;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return "less than an hour";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

const pageTitles: Record<string, string> = {
  "/admin/dashboard": "Dashboard",
  "/admin/my-website": "My Website",
  "/admin/appointments": "Appointments",
  "/admin/patients": "Patients",
  "/admin/blog": "Blog",
  "/admin/billing": "Billing",
  "/admin/settings": "Settings",
  "/admin/staff": "Staff Management",
  "/admin/support": "Support",
  "/admin/inquiries": "Inquiries",
};

const AdminLayout = ({ children }: { children: ReactNode }) => {
  const { profile, isStaff, staffName, authUserId } = useProfile();
  const location = useLocation();
  const navigate = useNavigate();
  const pageTitle = location.pathname.startsWith("/admin/patients/")
    ? "Medical Record"
    : pageTitles[location.pathname] || "Dashboard";
  const { settings } = usePlatformSettings();
  const banner = typeof settings.announcement_banner === "string" ? settings.announcement_banner : "";
  const { mode, setTheme } = usePanelTheme("doctylia-admin-theme");

  const { notifications, unreadCount, markAsRead, markAllAsRead } = useDoctorNotifications(authUserId ?? undefined);
  const trialStatus = useTrialStatus();
  const graceRemaining = trialStatus.accessLevel === "grace" ? formatGraceRemaining(trialStatus.graceEndsAt) : null;

  const openNotification = (n: DoctorNotification) => {
    if (!n.is_read) markAsRead(n.id);
    if (n.source_type === "ticket_reply" && n.ticket_id) {
      navigate(`/admin/support?ticket=${n.ticket_id}`);
    } else if (n.source_type === "trial_warning" || n.source_type === "cap_warning" || n.source_type === "plan_warning") {
      navigate("/admin/settings?tab=subscription");
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AdminSidebar />
        {/* min-w-0 stops this column's default min-width:auto from letting
            wide/unbreakable descendant content bloat it past the viewport
            width — without it, any such content anywhere on a page forces
            the whole row (and every section in it) to overflow together. */}
        <div className="flex-1 flex flex-col min-w-0">
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
                    {unreadCount > 0 && (
                      <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-0">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <h4 className="font-semibold text-sm text-foreground">Notifications</h4>
                    {unreadCount > 0 && (
                      <button onClick={markAllAsRead} className="text-xs text-royal hover:underline">Mark all read</button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div className="p-6 flex flex-col items-center justify-center text-center">
                      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center mb-3">
                        <BellOff className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-foreground">No notifications yet</p>
                      <p className="text-xs text-muted-foreground mt-1">You're all caught up.</p>
                    </div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto divide-y divide-border">
                      {notifications.map((n) => {
                        const Icon = SOURCE_ICON[n.source_type];
                        return (
                          <button
                            key={n.id}
                            onClick={() => openNotification(n)}
                            className={`w-full text-left px-4 py-3 hover:bg-secondary/60 transition-colors flex items-start gap-2.5 ${!n.is_read ? "bg-royal/5" : ""}`}
                          >
                            <div className="w-7 h-7 rounded-full bg-royal/10 flex items-center justify-center shrink-0 mt-0.5">
                              <Icon className="h-3.5 w-3.5 text-royal" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-royal shrink-0" />}
                                <span className="text-sm font-medium text-foreground truncate">{n.title}</span>
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                              <p className="text-[11px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
              <div className="h-5 w-px bg-border" />
              {isStaff && (
                <span className="hidden sm:inline-flex items-center text-[10px] font-bold uppercase tracking-wider bg-warning/15 text-warning px-2 py-1 rounded">
                  Staff
                </span>
              )}
              {/* isStaff sessions never link anywhere here — clicking a staff
                  member's own name/avatar isn't a shortcut to editing the
                  DOCTOR's profile, which is what /admin/settings shows by
                  default (its Profile tab is a staff member's own profile,
                  reached from the sidebar instead). */}
              {isStaff ? (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-warning/10 flex items-center justify-center text-xs font-bold text-warning">
                    {staffName?.charAt(0)?.toUpperCase() || "S"}
                  </div>
                  <div className="hidden md:block text-left">
                    <div className="text-xs font-medium text-foreground leading-tight">{staffName || "Staff"}</div>
                    <div className="text-[10px] text-muted-foreground leading-tight">Staff · Dr. {profile?.full_name || "Doctor"}</div>
                  </div>
                </div>
              ) : (
                <Link to="/admin/settings?tab=profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
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
              )}
            </div>
          </header>
          {trialStatus.accessLevel === "grace" && (
            <div className="bg-warning/15 border-b border-warning/30 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm text-primary">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 text-warning" />
                <span>
                  {trialStatus.isStaff
                    ? "Your clinic's Doctylia plan needs renewal. Editing is disabled until it's upgraded — contact your administrator."
                    : `Your trial has ended. You have read-only access${graceRemaining ? ` for ${graceRemaining} more` : ""} — upgrade to keep editing.`}
                </span>
              </div>
              {!trialStatus.isStaff && (
                <div className="flex gap-2 shrink-0">
                  <UpgradeCheckoutDialog targetTier="pro" trigger={<Button size="sm" variant="outline">Upgrade Pro</Button>} />
                  <UpgradeCheckoutDialog targetTier="premium" trigger={<Button size="sm" className="bg-royal hover:bg-royal/90">Upgrade Premium</Button>} />
                </div>
              )}
            </div>
          )}
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
