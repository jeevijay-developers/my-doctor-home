import { Fragment, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Clock, Copy, ExternalLink, Loader2, MoreVertical, Pencil, Plus, Stethoscope, UserRound, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { usePractitioners } from "@/hooks/usePractitioners";
import type { Practitioner } from "@/lib/practitioners/types";
import { practitionersOverSeats } from "@/lib/practitioners/seats";
import { practitionerErrorMessage } from "@/lib/practitioners/errors";
import { PERMISSION_PRESETS, type Permissions } from "@/lib/staffPermissions";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { normalizePhoneNumber } from "@/lib/auth/otp/productionOtpService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormattedPhoneInput } from "@/components/ui/formatted-phone-input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import LockedFeatureCard from "../LockedFeatureCard";
import DoctorFormDialog from "./DoctorFormDialog";
import DoctorHoursEditor from "./DoctorHoursEditor";
import DeactivateDoctorDialog from "./DeactivateDoctorDialog";
import BuyDoctorSeatsDialog from "./BuyDoctorSeatsDialog";
import { formatIstDate } from "@/lib/istDate";
import {
  completenessChipLabel, notIndexableNote, practitionerCompleteness, practitionerPublicPath,
} from "@/lib/profileCompleteness";
import { clinicSitePath } from "@/lib/clinicSlug";

const SEATS_ENDING_SOON_MS = 7 * 24 * 60 * 60 * 1000;

type DoctorLogin = { id: string; practitioner_id: string | null; staff_name: string; status: string };
type RpcResult = { ok?: boolean; error?: string } | null;

const PHONE_REGEX = /^\+[1-9]\d{7,14}$/;
const DOCTOR_PERMISSIONS: Permissions = Object.fromEntries(PERMISSION_PRESETS.doctor.map((k) => [k, true]));
const failMessage = (code: string | null | undefined) =>
  practitionerErrorMessage(code) ?? "Something went wrong. Please try again.";

const DoctorsPage = () => {
  const { profile, role, can } = useProfile();
  const { practitioners, access, isMulti, loading, refetch } = usePractitioners();
  const clinicId = profile?.id ?? null;
  const canManage = can("practitioners.manage");
  const isOwner = role === "owner";
  // A clinic with 2+ active doctors is multi-doctor whatever its plan (its doctors and bookings
  // remain after a downgrade); the plan only decides whether doctors can be ADDED or re-enabled.
  const canAdd = !!access?.has_feature && !!access?.enabled;
  const showPage = isMulti || canAdd;
  const overSeatIds = practitionersOverSeats(practitioners, access ? access.seat_limit : null);
  const addBlockedReason = "Your plan no longer includes extra doctors. Upgrade to add or re-enable doctors.";

  const [logins, setLogins] = useState<DoctorLogin[]>([]);
  const [editing, setEditing] = useState<Practitioner | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [hoursFor, setHoursFor] = useState<Practitioner | null>(null);
  const [deactivating, setDeactivating] = useState<Practitioner | null>(null);
  const [loginFor, setLoginFor] = useState<Practitioner | null>(null);
  const [removingLogin, setRemovingLogin] = useState<{ doctor: Practitioner; login: DoctorLogin } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [seatsOpen, setSeatsOpen] = useState(false);

  const clinicSlug = ((profile as { slug?: string | null } | null)?.slug ?? "").trim() || null;
  const activeCount = practitioners.filter((p) => p.is_active).length;
  const publicPathOf = (p: Practitioner) =>
    practitionerPublicPath({ clinicSlug, doctorSlug: p.slug, isActive: p.is_active, activeDoctors: activeCount });
  const copyLink = async (path: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy the link. Open the page and copy it from the address bar.");
    }
  };

  // Doctor logins are staff_members rows with role 'doctor'. RLS decides who may read them;
  // anyone who can't simply sees no "Has login" badges.
  const loadLogins = useCallback(async () => {
    if (!clinicId || !showPage) return;
    const { data } = await supabase
      .from("staff_members")
      .select("id, practitioner_id, staff_name, status")
      .eq("doctor_id", clinicId)
      .eq("role", "doctor");
    setLogins((data ?? []) as DoctorLogin[]);
  }, [clinicId, showPage]);

  useEffect(() => { loadLogins(); }, [loadLogins]);

  const isOwnerRow = (p: Practitioner) => !!clinicId && p.user_id === clinicId;
  const loginOf = (p: Practitioner) =>
    isOwnerRow(p) ? undefined : logins.find((l) => l.practitioner_id === p.id || (p.user_id != null && l.id === p.user_id));

  const callStatus = async (p: Practitioner, fn: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, ok: string) => {
    setBusyId(p.id);
    try {
      const { data, error } = await fn();
      const res = data as RpcResult;
      if (error || !res?.ok) { toast.error(failMessage(error?.message ?? res?.error)); return; }
      toast.success(ok);
      await refetch();
    } finally {
      setBusyId(null);
    }
  };

  const setBookable = (p: Practitioner, bookable: boolean) =>
    callStatus(p, () => supabase.rpc("set_practitioner_status", { _id: p.id, _is_active: true, _is_bookable: bookable }),
      bookable ? `${p.display_name} is taking bookings again` : `${p.display_name} is no longer taking bookings`);
  const makePrimary = (p: Practitioner) =>
    callStatus(p, () => supabase.rpc("set_primary_practitioner", { _id: p.id }), `${p.display_name} is now the main doctor`);

  const removeLogin = async () => {
    if (!removingLogin) return;
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.functions.invoke("delete-staff-account", {
      headers: { Authorization: `Bearer ${session?.access_token}` },
      body: { staff_id: removingLogin.login.id },
    });
    if (error) {
      const msg = await edgeFunctionErrorMessage(error, "Could not remove the login");
      toast.error(practitionerErrorMessage(msg) ?? msg);
      return;
    }
    toast.success("Login removed");
    setRemovingLogin(null);
    loadLogins();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-royal" />
      </div>
    );
  }

  if (!showPage && !access?.has_feature) {
    return (
      <div className="max-w-6xl mx-auto">
        <LockedFeatureCard
          featureName="Multiple Doctors"
          description="Add the other doctors who see patients at your clinic, each with their own hours, queue and fee. Available on Premium."
        />
      </div>
    );
  }

  if (!showPage) {
    return (
      <div className="max-w-6xl mx-auto">
        <Card className="border-dashed border-2 border-border">
          <CardContent className="py-16 flex flex-col items-center text-center gap-3 max-w-md mx-auto">
            <div className="h-14 w-14 rounded-full bg-royal/10 flex items-center justify-center text-royal">
              <Stethoscope className="h-6 w-6" />
            </div>
            <h2 className="font-heading font-bold text-xl text-primary">Doctors</h2>
            <p className="text-sm text-muted-foreground">Multiple doctors is coming soon for your clinic.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Seat purchase UI exists only while a seat price is set AND the server says this clinic may buy.
  const sellsSeats = access?.seat_price != null;
  const canBuySeats = sellsSeats && !!access?.can_buy_seats && (isOwner || can("billing.manage"));
  const purchased = sellsSeats ? access?.purchased_seats ?? 0 : 0;
  const seatsEnd = sellsSeats && purchased > 0 && access?.seats_valid_until ? new Date(access.seats_valid_until) : null;
  const seatsEndingSoon = !!seatsEnd && seatsEnd.getTime() > Date.now() && seatsEnd.getTime() - Date.now() <= SEATS_ENDING_SOON_MS;

  const clinicFee = profile?.consultation_fee ?? null;
  const feeText = (p: Practitioner) =>
    p.consultation_fee != null ? `₹${p.consultation_fee}` : clinicFee != null ? `₹${clinicFee} (clinic fee)` : "Clinic fee";

  const badges = (p: Practitioner) => {
    const out: { label: string; className: string }[] = [];
    if (p.is_primary) out.push({ label: "Main doctor", className: "bg-royal/10 text-royal border-royal/20" });
    if (!p.is_active) out.push({ label: "Inactive", className: "bg-muted text-muted-foreground" });
    else if (!p.is_bookable) out.push({ label: "Not taking bookings", className: "bg-warning/15 text-warning border-warning/30" });
    if (p.is_active && !p.online_booking) out.push({ label: "Online booking off", className: "bg-muted text-muted-foreground" });
    if (p.is_active && p.is_bookable && overSeatIds.has(p.id)) out.push({ label: "Not taking bookings (over seat limit)", className: "bg-warning/15 text-warning border-warning/30" });
    if (loginOf(p)) out.push({ label: "Has login", className: "bg-success/15 text-success border-success/30" });
    return out;
  };

  const ownerNote = (p: Practitioner) =>
    isOwnerRow(p) ? (
      <p className="text-xs text-muted-foreground">
        {isOwner ? "Edit your name, photo and signature in Profile. " : "Name, photo and signature come from the clinic owner's Profile. "}
        {isOwner && <Link to="/admin/profile" className="text-royal font-medium hover:underline">Open Profile</Link>}
      </p>
    ) : null;

  type MenuEntry = {
    key: string; label: string; onSelect?: () => void; to?: string;
    disabled?: boolean; title?: string; destructive?: boolean; separatorBefore?: boolean;
    icon?: LucideIcon;
  };

  // Edit is the one everyday action and stays a pencil icon button; Hours and everything else live in the
  // vertical-dots menu (destructive ones last, in red, behind a separator) so the row stays tidy on any width.
  const actions = (p: Practitioner) => {
    const name = p.display_name;
    const login = loginOf(p);
    const busy = busyId === p.id;
    const primary: JSX.Element[] = [];
    const menu: MenuEntry[] = [];
    if (!p.is_active) {
      if (canManage) {
        primary.push(
          <Button key="reactivate" size="sm" variant="outline" disabled={busy || !canAdd} title={!canAdd ? addBlockedReason : undefined} aria-label={`Reactivate ${name}`}
            onClick={() => callStatus(p, () => supabase.rpc("set_practitioner_status", { _id: p.id, _is_active: true, _is_bookable: true }), `${name} reactivated`)}>
            Reactivate
          </Button>,
        );
      }
      return <div className="flex items-center justify-end gap-1.5">{primary}</div>;
    }
    if (canManage) {
      primary.push(
        <Button key="edit" size="icon" variant="outline" title="Edit" aria-label={`Edit ${name}`}
          className="h-10 w-10 shrink-0 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => { setEditing(p); setFormOpen(true); }}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Button>,
      );
      menu.push({ key: "hours", label: "Hours", icon: Clock, onSelect: () => setHoursFor(p) });
    }
    if (isOwner && !isOwnerRow(p)) {
      if (login) {
        menu.push(
          { key: "perms", label: "Permissions", to: `/admin/staff?edit=${login.id}` },
          { key: "rmlogin", label: "Remove login", onSelect: () => setRemovingLogin({ doctor: p, login }) },
        );
      } else {
        menu.push({ key: "mklogin", label: "Create login", onSelect: () => setLoginFor(p) });
      }
    }
    if (isOwner && !p.is_primary && p.is_bookable) {
      menu.push({ key: "primary", label: "Make main doctor", disabled: busy, onSelect: () => makePrimary(p) });
    }
    if (canManage && !p.is_primary) {
      menu.push(
        p.is_bookable
          ? { key: "stop", label: "Stop bookings", disabled: busy, onSelect: () => setBookable(p, false) }
          : { key: "resume", label: "Resume bookings", disabled: busy || !canAdd, title: !canAdd ? addBlockedReason : undefined, onSelect: () => setBookable(p, true) },
        { key: "deactivate", label: "Deactivate", destructive: true, separatorBefore: true, onSelect: () => setDeactivating(p) },
      );
    }
    return (
      <div className="flex items-center justify-end gap-1.5">
        {primary}
        {menu.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="outline" className="h-10 w-10 shrink-0 p-0 focus-visible:ring-2 focus-visible:ring-ring" aria-label={`More actions for ${name}`}>
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[11rem]">
              {menu.map((m) => (
                <Fragment key={m.key}>
                  {m.separatorBefore && <DropdownMenuSeparator />}
                  {m.to ? (
                    <DropdownMenuItem asChild>
                      <Link to={m.to}>{m.label}</Link>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      disabled={m.disabled}
                      title={m.title}
                      onSelect={m.onSelect}
                      className={m.destructive ? "text-destructive focus:text-destructive" : undefined}
                    >
                      {m.icon && <m.icon className="mr-2 h-4 w-4" aria-hidden="true" />}
                      {m.label}
                    </DropdownMenuItem>
                  )}
                </Fragment>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  };

  const photo = (p: Practitioner) =>
    p.photo_url ? (
      <img src={p.photo_url} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />
    ) : (
      <div className="h-10 w-10 rounded-full bg-royal/10 text-royal flex items-center justify-center shrink-0">
        <UserRound className="h-5 w-5" aria-hidden="true" />
      </div>
    );

  // Profile completeness: only for active doctors of a team clinic, where each has a page of their own.
  const profileInfo = (p: Practitioner) => {
    if (!p.is_active || activeCount < 2) return null;
    const publicPath = publicPathOf(p);
    const c = practitionerCompleteness(p);
    const note = notIndexableNote(c);
    const warn = !c.hasIndexableBio || !c.indexable;
    return (
      <div className="space-y-1">
        <Badge variant="outline" className={warn ? "bg-warning/15 text-warning border-warning/30" : "bg-success/15 text-success border-success/30"}
          title={c.missing.length ? `Still missing: ${c.missing.map((m) => m.label.toLowerCase()).join(", ")}` : "Profile complete"}>
          {completenessChipLabel(c)}
        </Badge>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
        {publicPath && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <a href={publicPath} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-royal hover:underline min-h-6">
              Public page<span className="sr-only"> for {p.display_name} (opens in a new tab)</span>
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            <button type="button" onClick={() => { void copyLink(publicPath); }}
              className="inline-flex items-center gap-1 text-xs font-medium text-royal hover:underline min-h-6"
              aria-label={`Copy link to ${p.display_name}'s public page`}>
              <Copy className="h-3 w-3" aria-hidden="true" /> Copy link
            </button>
          </div>
        )}
      </div>
    );
  };

  const badgeList = (p: Practitioner) => (
    <div className="flex flex-wrap gap-1">
      {badges(p).map((b) => <Badge key={b.label} variant="outline" className={b.className}>{b.label}</Badge>)}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-royal" /> Doctors
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {access && (
              <>Doctor seats used: <span className="font-semibold text-foreground">{access.seats_used} / {access.seat_limit}</span>{" · "}</>
            )}
            {purchased > 0 && seatsEnd && <>{purchased} bought, valid until {formatIstDate(seatsEnd)}{" · "}</>}
            {!sellsSeats && <>Need more seats? <Link to="/admin/support" className="text-royal font-medium hover:underline">Contact support</Link></>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {clinicSlug && (
          <Button asChild variant="outline">
            <a href={clinicSitePath(clinicSlug)} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-1" aria-hidden="true" /> View clinic page
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </Button>
        )}
        {canBuySeats && (
          <Button variant="outline" onClick={() => setSeatsOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add seats
          </Button>
        )}
        {canManage && (
          <Button className="bg-royal hover:bg-royal/90" disabled={!canAdd} title={!canAdd ? addBlockedReason : undefined} onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add doctor
          </Button>
        )}
        </div>
      </div>

      {seatsEndingSoon && seatsEnd && (
        <div role="status" className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          <p>Your extra seats end on {formatIstDate(seatsEnd)}. Renew your plan with seats to keep them.</p>
        </div>
      )}

      {!canAdd && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          <p>
            Your plan no longer includes extra doctors. Existing doctors and bookings stay; only the first {access?.seat_limit ?? 1}{" "}
            {(access?.seat_limit ?? 1) === 1 ? "doctor" : "doctors"} (main doctor first) can take new bookings.
            Upgrade to add or re-enable doctors.
          </p>
        </div>
      )}

      {practitioners.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">No doctors yet.</p>
      ) : (
        <>
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="p-3 font-semibold">Doctor</th>
                    <th className="p-3 font-semibold">Status</th>
                    <th className="p-3 font-semibold">Fee</th>
                    <th className="p-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {practitioners.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 align-top">
                      <td className="p-3">
                        <div className="flex items-start gap-3">
                          {photo(p)}
                          <div className="space-y-0.5">
                            <div className="font-medium text-foreground">{p.display_name}</div>
                            {p.specialization && <div className="text-xs text-muted-foreground">{p.specialization}</div>}
                            {ownerNote(p)}
                            {profileInfo(p)}
                          </div>
                        </div>
                      </td>
                      <td className="p-3">{badgeList(p)}</td>
                      <td className="p-3 whitespace-nowrap">{feeText(p)}</td>
                      <td className="p-3">{actions(p)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="md:hidden space-y-2">
            {practitioners.map((p) => (
              <Card key={p.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start gap-3">
                    {photo(p)}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="font-medium text-foreground">{p.display_name}</div>
                      {p.specialization && <div className="text-xs text-muted-foreground">{p.specialization}</div>}
                      <div className="text-xs text-muted-foreground">Fee: {feeText(p)}</div>
                    </div>
                  </div>
                  {badgeList(p)}
                  {profileInfo(p)}
                  {ownerNote(p)}
                  <div className="pt-1">{actions(p)}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {clinicId && (
        <>
          <DoctorFormDialog
            open={formOpen}
            onOpenChange={setFormOpen}
            practitioner={editing}
            clinicId={clinicId}
            isOwnerRow={!!editing && isOwnerRow(editing)}
            onSaved={refetch}
            bioContext={{
              clinicName: profile?.clinic_name,
              city: profile?.city,
              locality: (profile as { locality?: string | null } | null)?.locality,
            }}
          />
          <DoctorHoursEditor open={!!hoursFor} onOpenChange={(o) => !o && setHoursFor(null)} practitioner={hoursFor} clinicId={clinicId} />
          <DeactivateDoctorDialog practitioner={deactivating} clinicId={clinicId} onClose={() => setDeactivating(null)} onDone={refetch} />
        </>
      )}
      {(canBuySeats || seatsOpen) && <BuyDoctorSeatsDialog open={seatsOpen} onOpenChange={setSeatsOpen} />}
      <DoctorLoginDialog doctor={loginFor} onClose={() => setLoginFor(null)} onCreated={loadLogins} />

      <AlertDialog open={!!removingLogin} onOpenChange={(o) => !o && setRemovingLogin(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removingLogin?.doctor.display_name}'s login?</AlertDialogTitle>
            <AlertDialogDescription>
              They will be signed out and can no longer log in. The doctor stays on your clinic, with their bookings and records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={removeLogin}>Remove login</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// A StaffManagementPage-style dialog that gives a doctor their own phone + OTP login,
// starting from the doctor permission preset.
const DoctorLoginDialog = ({ doctor, onClose, onCreated }: {
  doctor: Practitioner | null; onClose: () => void; onCreated: () => void | Promise<void>;
}) => {
  const [form, setForm] = useState({ staff_name: "", phone: "", confirm_phone: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!doctor) return;
    setForm({ staff_name: doctor.display_name, phone: "", confirm_phone: "" });
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctor?.id]);

  const create = async () => {
    if (!doctor) return;
    setError(null);
    if (!form.staff_name.trim()) { setError("Enter the doctor's name."); return; }
    const phone = normalizePhoneNumber(form.phone);
    if (!PHONE_REGEX.test(phone)) { setError("Enter a valid phone number, e.g. +919876543210"); return; }
    if (phone !== normalizePhoneNumber(form.confirm_phone)) { setError("Phone numbers do not match"); return; }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error: fnError } = await supabase.functions.invoke("create-staff-account", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: {
          role: "doctor",
          practitioner_id: doctor.id,
          staff_name: form.staff_name.trim(),
          phone,
          permissions: DOCTOR_PERMISSIONS,
        },
      });
      if (fnError) {
        const msg = await edgeFunctionErrorMessage(fnError, "Could not create the login. Please try again.");
        setError(practitionerErrorMessage(msg) ?? msg);
        return;
      }
      toast.success("Login created. The doctor can now log in with this phone number.");
      await onCreated();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!doctor} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create login for {doctor?.display_name}</DialogTitle>
          <DialogDescription>
            The doctor logs in at Doctylia's login page with this number and a one-time code. They start with the doctor
            permissions; you can change them later in Staff Management.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="login-name">Name on the login *</Label>
            <Input id="login-name" value={form.staff_name} onChange={(e) => setForm({ ...form, staff_name: e.target.value })} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="login-phone">Phone number *</Label>
            <FormattedPhoneInput id="login-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+91 98765 43210" className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="login-phone2">Confirm phone number *</Label>
            <FormattedPhoneInput id="login-phone2" value={form.confirm_phone} onChange={(e) => setForm({ ...form, confirm_phone: e.target.value })}
              placeholder="Re-enter the number" className="h-10" />
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="bg-royal hover:bg-royal/90" onClick={create} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Create login
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DoctorsPage;
