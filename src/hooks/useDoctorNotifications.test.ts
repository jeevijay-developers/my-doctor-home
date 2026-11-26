import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { notificationRoute, type DoctorNotification } from "./useDoctorNotifications";

const n = (over: Partial<DoctorNotification>): DoctorNotification => ({
  id: "n1", source_type: "broadcast", title: "Hello", message: "", ticket_id: null, is_read: false,
  created_at: "2026-11-25T00:00:00Z", ...over,
});

describe("notificationRoute", () => {
  it("sends a new booking to the appointments list", () => {
    expect(notificationRoute(n({ source_type: "new_booking", title: "New booking" }))).toBe("/admin/appointments");
  });

  it("sends a new booking to appointments even when the title mentions a plan", () => {
    expect(notificationRoute(n({ source_type: "new_booking", title: "New booking: subscription consult" }))).toBe("/admin/appointments");
  });

  it("keeps the existing routes", () => {
    expect(notificationRoute(n({ source_type: "ticket_reply", ticket_id: "t9" }))).toBe("/admin/support?ticket=t9");
    expect(notificationRoute(n({ source_type: "cap_warning" }))).toBe("/admin/settings?tab=subscription");
    expect(notificationRoute(n({ source_type: "broadcast", title: "Your subscription renews" }))).toBe("/admin/settings?tab=subscription");
    expect(notificationRoute(n({ source_type: "paid_no_show" }))).toBe("/admin/appointments");
    expect(notificationRoute(n({ source_type: "broadcast", title: "Your plan is expiring" }))).toBe("/admin/settings?tab=subscription");
    expect(notificationRoute(n({ source_type: "broadcast", title: "Trial ends soon" }))).toBe("/admin/settings?tab=subscription");
    expect(notificationRoute(n({ source_type: "broadcast", title: "Explanation of changes" }))).toBeNull();
    expect(notificationRoute(n({ source_type: "broadcast", title: "Hello" }))).toBeNull();
  });
});

describe("notificationRoute booking_refund", () => {
  it("sends a failed-confirmation refund notice to billing, even with 'plan' in the title", () => {
    expect(notificationRoute(n({ source_type: "booking_refund", title: "Refund needed" }))).toBe("/admin/billing");
    expect(notificationRoute(n({ source_type: "booking_refund", title: "Plan consult refund" }))).toBe("/admin/billing");
  });
});
