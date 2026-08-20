# Bug/Feature: Slot-Already-Booked Error Shows Too Late in Booking Flow

## Context

The public booking flow on a doctor's site (e.g. `doctylia.com/dr/anmol-bohra`) is a multi-step wizard — time slot selection happens early (visible in the "Select Time Slot" step), but Patient Details is **Step 5 of 6**, several steps later.

Currently, if a patient picks a time slot that has since been taken by someone else, the "slot already booked" conflict is **only detected and shown as an error on the Patient Details step**, after the patient clicks **Continue** — i.e., after they've already gone through Service, Date, Time, and filled in their name/phone/age/etc. on Patient Details.

## Problem

This is confusing and wastes the patient's effort: they fill out multiple steps of the form only to be told, several screens later, that the time they picked at the very beginning is no longer available. It also isn't caught **at the moment of selection** on the Select Time Slot step itself, even though that's the step where the conflict actually originates.

## Task

Move the "slot already booked" check to fire **at (or immediately after) time slot selection**, not after the patient has proceeded through later steps and clicked Continue on Patient Details.

## Where to Look

1. Locate the booking wizard's step components (likely something like `BookingWizard.tsx` or individual step files — `SelectTimeSlotStep.tsx`, `PatientDetailsStep.tsx`, etc.) and the shared state/context that tracks the selected date/time across steps.
2. Locate wherever the "slot was just booked by someone else" conflict is currently detected/thrown — this is likely a Supabase insert/RPC call that only runs on final submission or on the Patient Details step's Continue handler, rather than at time-of-selection.
3. Check whether there's already a live-availability mechanism at play — the Select Time Slot screen shows "Live availability — full slots update automatically," suggesting there may already be a realtime subscription or polling mechanism for slot availability that could be leveraged here.

## Target Behavior

1. **Re-validate at selection time.** When the patient clicks a time slot on the "Select Time Slot" step, re-check (via a quick availability query) that the slot is still open *before* advancing to the next step.
   - If it's still available: proceed to the next step as normal.
   - If it's just been taken: show the error immediately on the Select Time Slot screen (e.g. "Sorry, this slot was just booked by someone else. Please choose another time."), keep the patient on that step, and refresh the slot list so the now-unavailable time is disabled/removed.
2. **Defense-in-depth: also re-validate on final submit.** Since a slot could still be taken by someone else in the gap between Step 1 selection and final Continue/submit (race condition inherent to concurrent bookings), keep a final availability check at actual submission time too — but if it fails at that point, send the patient back to the Select Time Slot step (not just show a toast on Patient Details) so they can immediately pick a new time without re-entering their other details if possible.
3. **Preserve already-entered patient details where feasible.** If the patient is bounced back to reselect a time slot after already filling in Patient Details (defense-in-depth case above), don't make them re-type their name/phone/age/etc. — keep that data in the wizard's state and just have them reselect the time, then return to a pre-filled Patient Details step.
4. **Live slot list refresh.** Since the UI already indicates "Live availability — full slots update automatically," ensure that once a slot is confirmed taken (whether by this check or another patient's concurrent booking), it's visually reflected (disabled/removed) in the slot grid for anyone else currently viewing that same day.

## Acceptance Criteria

- [ ] Selecting an already-booked time slot on the Select Time Slot step shows the conflict error immediately on that step, not after proceeding through later steps.
- [ ] The taken slot is visually disabled/removed from the slot grid once detected as unavailable.
- [ ] A final availability re-check still exists at actual submission time as a safety net for true race conditions (two patients selecting the same open slot within moments of each other).
- [ ] If the safety-net check at submission does catch a conflict, the patient is returned to slot selection without losing already-entered Patient Details.
- [ ] No change to slot booking logic itself for the happy path (slot is available and successfully booked) — this is purely about when/where the conflict is surfaced.
