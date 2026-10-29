import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Clock, Copy, ExternalLink, MoreVertical, PhoneCall, RotateCcw, SkipForward, Star, Users } from "lucide-react";
import {
  PAYMENT_METHODS,
  averageConsultMinutes,
  clinicToday,
  estimateWaitMinutes,
  formatWait,
  isUnpaid,
  queueErrorMessage,
  splitQueue,
  type QueueAppointment,
} from "@/lib/queue";

type Props = {
  doctorId: string;
  doctorSlug?: string | null;
  // appointments.edit — without it the screen is a read-only board.
  canAct: boolean;
  // The read-only grace period after a plan lapses.
  writeDisabled?: boolean;
};

const COLUMNS =
  "id, patient_name, service_name, status, payment_status, payment_method, amount, time_slot, sort_time, created_at, queue_number, serving_started_at, skipped_at, completed_at, priority, priority_reason, appointment_type";

const minutesSince = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000)) : 0);
const tokenLabel = (n: number | null) => (n == null ? "—" : `#${n}`);

// "call" = the patient in the room is unpaid and staff asked to call someone else out of order.
type PendingPayment = { appointment: QueueAppointment; then: "next" | "complete" | "call"; callId?: string };

// Data older than this is not trustworthy enough to act on or to show as live.
const STALE_AFTER_MS = 45000;

const LiveQueue = ({ doctorId, doctorSlug, canAct, writeDisabled = false }: Props) => {
  const [rows, setRows] = useState<QueueAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [tick, setTick] = useState(0);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const [payFor, setPayFor] = useState<PendingPayment | null>(null);
  const [priorityFor, setPriorityFor] = useState<QueueAppointment | null>(null);
  const [priorityReason, setPriorityReason] = useState("");
  const today = clinicToday();
  const requestSeq = useRef(0);
  const busyRef = useRef(false);

  const load = useCallback(async (): Promise<boolean> => {
    const seq = ++requestSeq.current;
    const { data, error } = await supabase
      .from("appointments")
      .select(COLUMNS)
      .eq("doctor_id", doctorId)
      .eq("date", today)
      .eq("appointment_type", "clinic")
      .order("sort_time", { ascending: true })
      .order("created_at", { ascending: true });
    if (seq !== requestSeq.current) return true;
    setLoading(false);
    if (error) {
      // Keep the board we already have rather than blanking it on a hiccup; the stale
      // banner tells staff it may be out of date.
      console.error("Queue load failed:", error.message);
      return false;
    }
    setRows((data ?? []) as unknown as QueueAppointment[]);
    setLastOkAt(Date.now());
    return true;
  }, [doctorId, today]);

  // Realtime pushes changes; polling and tab-focus refetch cover a dropped socket.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    loadRef.current();
    // One staff action fires several row events; coalesce them into a single reload.
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const reloadSoon = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => loadRef.current(), 250);
    };
    const channel = supabase
      .channel(`live-queue-${doctorId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `doctor_id=eq.${doctorId}` }, reloadSoon)
      .subscribe();
    const visible = () => document.visibilityState === "visible";
    const poll = setInterval(() => { if (visible()) loadRef.current(); }, 15000);
    const tickTimer = setInterval(() => { if (visible()) setTick((t) => t + 1); }, 15000);
    const onVisible = () => { if (visible()) { loadRef.current(); setTick((t) => t + 1); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(debounce);
      supabase.removeChannel(channel);
      clearInterval(poll);
      clearInterval(tickTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [doctorId, today]);

  const queue = useMemo(() => splitQueue(rows, from, to), [rows, from, to]);
  const avgMinutes = useMemo(() => averageConsultMinutes(rows.filter((r) => r.status === "completed")), [rows]);
  // `tick` re-renders every 15s so this flips without a new fetch.
  const stale = lastOkAt != null && Date.now() - lastOkAt > STALE_AFTER_MS && tick >= 0;
  const disabled = !canAct || writeDisabled || busy || stale;

  // `expect` = who this screen believes is in the room right now ("none" or an appointment id).
  // If another device changed that, the server answers STALE instead of completing the wrong patient.
  const run = async (action: string, appointmentId?: string, reason?: string, method?: string, expect?: string): Promise<boolean> => {
    if (busyRef.current) { toast.info("Still working on the previous action..."); return false; }
    busyRef.current = true;
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("queue_action", {
        _action: action,
        _appointment_id: appointmentId ?? null,
        _reason: reason ?? null,
        _payment_method: method ?? null,
        _expect: expect ?? null,
      });
      if (error || !data?.ok) {
        toast.error(queueErrorMessage(data?.error));
        // The screen was out of date: show the real state right away.
        if (data?.error === "STALE") await load();
        return false;
      }
      if (!(await load())) {
        toast.warning("Done, but the board could not refresh. Check the queue before the next action.");
      }
      return true;
    } catch {
      toast.error("Could not reach the server. Please try again.");
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // Finishing a patient who hasn't paid asks how they paid first, so money is never
  // forgotten: the counter takes cash/UPI/card, or the doctor chooses to bill later.
  const finish = (appointment: QueueAppointment, then: "next" | "complete") => {
    if (isUnpaid(appointment)) {
      setPayFor({ appointment, then });
      return;
    }
    if (then === "next") run("call_next", undefined, undefined, undefined, appointment.id);
    else run("complete", appointment.id);
  };

  // Calling someone out of order completes the patient in the room, so an unpaid one gets
  // the same payment prompt as every other way of finishing them.
  const callNow = (target: QueueAppointment) => {
    if (serving && serving.id !== target.id && isUnpaid(serving)) {
      setPayFor({ appointment: serving, then: "call", callId: target.id });
      return;
    }
    run("call", target.id, undefined, undefined, serving ? serving.id : "none");
  };

  const confirmPayment = async (method: string | null) => {
    if (!payFor) return;
    const { appointment, then, callId } = payFor;
    setPayFor(null);
    if (method && !(await run("mark_paid", appointment.id, undefined, method))) return;
    if (then === "call") await run("call", callId, undefined, undefined, appointment.id);
    else if (then === "next") await run("call_next", undefined, undefined, undefined, appointment.id);
    else await run("complete", appointment.id);
  };

  const submitPriority = async () => {
    if (!priorityFor) return;
    const target = priorityFor;
    if (!priorityReason.trim()) { toast.error(queueErrorMessage("REASON_REQUIRED")); return; }
    // Keep the dialog and the typed reason if the server refuses, so nothing is retyped.
    if (await run("set_priority", target.id, priorityReason.trim())) {
      setPriorityFor(null);
      setPriorityReason("");
    }
  };

  const markPaidLater = async (a: QueueAppointment, method: string) => {
    await run("mark_paid", a.id, undefined, method);
  };

  const publicLink = doctorSlug ? `${window.location.origin}/dr/${doctorSlug}/queue` : null;

  const serving = queue.serving;
  const waitingCount = queue.waiting.length;

  if (loading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Loading today's queue…</div>;
  }

  return (
    <div className="space-y-4">
      {stale && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm px-3 py-2 flex items-center justify-between gap-2">
          <span>Cannot reach the server. This board may be out of date, so actions are paused.</span>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => loadRef.current()}>Retry</Button>
        </div>
      )}
      {/* Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Now serving", value: serving ? tokenLabel(serving.queue_number) : "—", tone: "bg-royal/10 text-royal" },
          { label: "Waiting", value: String(waitingCount), tone: "bg-warning/10 text-warning" },
          { label: "Done", value: String(queue.done.length), tone: "bg-success/10 text-success" },
          { label: "Skipped", value: String(queue.skipped.length), tone: "bg-muted text-muted-foreground" },
        ].map((c) => (
          <div key={c.label} className={`${c.tone} rounded-xl p-3 text-center`}>
            <div className="font-heading font-bold text-2xl">{c.value}</div>
            <div className="text-[11px] opacity-80">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Time window (view only) + public screen link */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
        <div className="flex items-end gap-2 flex-wrap">
          <div className="space-y-1">
            <Label htmlFor="queue-from" className="text-xs">From</Label>
            <Input id="queue-from" type="time" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-32" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="queue-to" className="text-xs">To</Label>
            <Input id="queue-to" type="time" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-32" />
          </div>
          {(from || to) && (
            <Button variant="ghost" size="sm" className="h-9" onClick={() => { setFrom(""); setTo(""); }}>Clear window</Button>
          )}
        </div>
        {publicLink && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9" onClick={async () => {
              try {
                await navigator.clipboard.writeText(publicLink);
                toast.success("Waiting-room screen link copied");
              } catch {
                toast.error(`Could not copy automatically. Link: ${publicLink}`);
              }
            }}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Copy screen link
            </Button>
            <Button variant="outline" size="sm" className="h-9" asChild>
              <a href={publicLink} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1" /> Open</a>
            </Button>
          </div>
        )}
      </div>
      {(from || to) && (
        <p className="text-xs text-muted-foreground">Showing patients who arrived or are booked {from ? `from ${from}` : ""} {to ? `until ${to}` : ""}. Actions still follow the full line.</p>
      )}

      {/* Now serving */}
      <Card className={`border-2 ${serving ? "border-royal/40 bg-royal/5" : "border-dashed border-border"} shadow-none`}>
        <CardContent className="p-4 sm:p-5">
          {serving ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-16 h-16 rounded-2xl bg-royal text-white flex items-center justify-center font-heading font-bold text-2xl shrink-0">
                  {tokenLabel(serving.queue_number)}
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Now serving</div>
                  <div className="font-heading font-semibold text-lg text-foreground truncate">{serving.patient_name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                    <span>{serving.service_name || "Clinic Visit"}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {minutesSince(serving.serving_started_at)} min in room</span>
                    {isUnpaid(serving) && <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30">Unpaid ₹{serving.amount}</Badge>}
                  </div>
                </div>
              </div>
              {canAct && (
                <div className="flex flex-wrap gap-2">
                  <Button className="bg-royal hover:bg-royal/90" disabled={disabled} onClick={() => finish(serving, "next")}>
                    <PhoneCall className="h-4 w-4 mr-1" /> {waitingCount > 0 ? "Complete & call next" : "Complete"}
                  </Button>
                  {waitingCount > 0 && (
                    <Button variant="outline" disabled={disabled} onClick={() => finish(serving, "complete")}>Complete only</Button>
                  )}
                  <Button variant="outline" disabled={disabled} onClick={() => run("skip", serving.id)}>
                    <SkipForward className="h-4 w-4 mr-1" /> Skip
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="font-heading font-semibold text-foreground">Nobody is being seen right now</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {waitingCount > 0 ? `${waitingCount} waiting${avgMinutes ? ` · about ${formatWait(estimateWaitMinutes(waitingCount, avgMinutes))} to clear the line` : ""}` : "The line is empty."}
                </p>
              </div>
              {canAct && waitingCount > 0 && (
                <Button className="bg-royal hover:bg-royal/90" disabled={disabled} onClick={() => run("call_next", undefined, undefined, undefined, "none")}>
                  <PhoneCall className="h-4 w-4 mr-1" /> Call next patient
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Waiting line */}
      <div>
        <h2 className="font-heading font-semibold text-sm text-foreground flex items-center gap-2 mb-2">
          <Users className="h-4 w-4 text-royal" /> Waiting ({waitingCount})
        </h2>
        {waitingCount === 0 ? (
          <Card className="border-border/60 shadow-none"><CardContent className="py-8 text-center text-sm text-muted-foreground">No one is waiting.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {queue.waiting.map((a, index) => {
              const est = estimateWaitMinutes(index, avgMinutes, !!serving);
              return (
                <Card key={a.id} className={`shadow-none border-border/60 ${a.priority ? "border-l-4 border-l-destructive" : ""}`}>
                  <CardContent className="p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center font-heading font-bold text-foreground shrink-0">
                        {tokenLabel(a.queue_number)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate flex items-center gap-2">
                          {a.patient_name}
                          {a.priority ? (
                            <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30" title={a.priority_reason ?? undefined}>
                              <Star className="h-3 w-3 mr-0.5" /> Priority
                            </Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                          <span>{a.time_slot ? `Slot ${a.time_slot.slice(0, 5)}` : `Arrived ${a.sort_time.slice(0, 5)}`}</span>
                          <span>·</span>
                          <span>{index === 0 ? "Next" : `${index} ahead`}{est != null ? ` · ~${formatWait(est)}` : ""}</span>
                          {isUnpaid(a) && <span>· ₹{a.amount} due</span>}
                        </div>
                        {a.priority && a.priority_reason ? <div className="text-[11px] text-destructive mt-0.5">{a.priority_reason}</div> : null}
                      </div>
                    </div>
                    {canAct && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={disabled} onClick={() => callNow(a)}>Call now</Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`More actions for ${a.patient_name}`} disabled={disabled}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {a.priority ? (
                              <DropdownMenuItem onClick={() => run("clear_priority", a.id)}>Remove priority</DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => { setPriorityReason(""); setPriorityFor(a); }}>Mark as priority…</DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => run("skip", a.id)}>Skip for now</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => run("no_show", a.id)}>Mark no-show</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Skipped */}
      {queue.skipped.length > 0 && (
        <div>
          <h2 className="font-heading font-semibold text-sm text-foreground mb-2">Skipped ({queue.skipped.length})</h2>
          <div className="space-y-2">
            {queue.skipped.map((a) => (
              <Card key={a.id} className="shadow-none border-border/60 bg-muted/30">
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center font-heading font-bold text-muted-foreground shrink-0">{tokenLabel(a.queue_number)}</div>
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">{a.patient_name}</div>
                      <div className="text-xs text-muted-foreground">Recall puts them back at their original place</div>
                    </div>
                  </div>
                  {canAct && (
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="outline" className="h-8 text-xs" disabled={disabled} onClick={() => run("recall", a.id)}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Recall
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={disabled} onClick={() => run("no_show", a.id)}>No-show</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Done */}
      {queue.done.length > 0 && (
        <div>
          <button type="button" className="flex items-center gap-1 text-sm font-heading font-semibold text-foreground mb-2" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
            Done today ({queue.done.length}) {showDone ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showDone && (
            <div className="space-y-2">
              {queue.done.map((a) => (
                <Card key={a.id} className="shadow-none border-border/60">
                  <CardContent className="p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-success/10 flex items-center justify-center font-heading font-bold text-success shrink-0">{tokenLabel(a.queue_number)}</div>
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">{a.patient_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {a.payment_status === "paid" ? `Paid ₹${a.amount}${a.payment_method ? ` · ${a.payment_method.toUpperCase()}` : ""}` : isUnpaid(a) ? `₹${a.amount} not collected` : a.payment_status}
                        </div>
                      </div>
                    </div>
                    {canAct && isUnpaid(a) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={disabled}>Mark paid</Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {PAYMENT_METHODS.map((m) => (
                            <DropdownMenuItem key={m.value} onClick={() => markPaidLater(a, m.value)}>{m.label}</DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Payment prompt */}
      <Dialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Collect ₹{payFor?.appointment.amount}</DialogTitle>
            <DialogDescription>{payFor?.appointment.patient_name} hasn't paid yet. How did they pay?</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map((m) => (
              <Button key={m.value} variant="outline" disabled={busy} onClick={() => confirmPayment(m.value)}>{m.label}</Button>
            ))}
          </div>
          <DialogFooter className="sm:justify-center">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => confirmPayment(null)}>Continue without payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Priority reason */}
      <Dialog open={!!priorityFor} onOpenChange={(o) => !o && setPriorityFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Move {priorityFor?.patient_name} up the line</DialogTitle>
            <DialogDescription>Patients can see the order change, so a short reason is required and is recorded.</DialogDescription>
          </DialogHeader>
          <Label htmlFor="priority-reason" className="sr-only">Reason for priority</Label>
          <Textarea id="priority-reason" value={priorityReason} onChange={(e) => setPriorityReason(e.target.value)} placeholder="e.g. Chest pain, elderly, infant with fever" maxLength={200} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPriorityFor(null)}>Cancel</Button>
            <Button className="bg-royal hover:bg-royal/90" disabled={!priorityReason.trim()} onClick={submitPriority}>Mark priority</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LiveQueue;
