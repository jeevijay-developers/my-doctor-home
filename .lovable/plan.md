## Zoom Integration Plan

### Creation Timing recommendation: **Lazy (on-demand)**

Generate the Zoom meeting when the **doctor clicks "Start Meeting"** (or 15 min before, whichever comes first), not at booking time.

Trade-offs:
- **Lazy pros:** No wasted Zoom meetings for no-shows/cancellations. No reschedule-sync race conditions before the day of the visit. Fewer Zoom API calls (rate limits). Cheaper.
- **Lazy cons:** Slight delay (~1s) on first click. Patient can't preview the link far in advance.
- **Eager cons:** Every cancel/reschedule must call Zoom API; meetings pile up if patient never joins; harder to recover from Zoom API outages at booking time.

We still store the generated `join_url` / `start_url` after first generation, so subsequent clicks are instant and reschedule/cancel still sync.

### 1. Secrets
Request `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` via `add_secret` (Server-to-Server OAuth app).

### 2. Database migration
Add nullable columns to `appointments`:
- `zoom_meeting_id text`
- `zoom_join_url text`
- `zoom_start_url text`

**RLS:** Existing row-level policies already restrict `appointments` to doctor + assigned patient. To hide `zoom_start_url` from patients we do NOT rely on column-level RLS (PostgREST supports it but it's fragile with anon patient access). Instead:
- The edge function is the only path that returns `start_url` to clients.
- Client code (`AppointmentsPage`, `VideoConsultationCard`) never selects `zoom_start_url` on the patient side; patient-side manage page selects only `zoom_join_url`.
- Add a `REVOKE SELECT (zoom_start_url) ... GRANT SELECT (zoom_start_url) TO authenticated` so the anon role used for patient-manage pages cannot read it. Doctor role (authenticated) still can.

### 3. Edge function `create-zoom-meeting` (rewrite)
Actions:
- `POST { appointment_id, action: "get" | "create" | "update" | "delete" }`
- Verify JWT → `user.id`.
- Load appointment; authorize: user is doctor (`profiles.user_id = appointment.doctor_profile.user_id`) OR user is the assigned patient (`appointment.patient_user_id = user.id`).
- Fetch Zoom OAuth token (server-to-server, cached in-memory per invocation).
- `create`: if no meeting yet, POST `/users/me/meetings`, store `id/join_url/start_url` on row. Doctor only.
- `update`: PATCH meeting time. Doctor only (also invoked from reschedule flow).
- `delete`: DELETE meeting. Doctor only.
- `get`: return `{ join_url }` to patient, `{ join_url, start_url }` to doctor. Never leak `start_url` to patient.

### 4. Frontend
New `src/components/VideoConsultationCard.tsx`:
- Props: `appointment`, `role: "doctor" | "patient"`.
- Computes `minutesUntil = (appt_time - now) / 60000`.
- Button disabled with tooltip until `minutesUntil <= 15`.
- On click: `supabase.functions.invoke("create-zoom-meeting", { body: { appointment_id, action: role === "doctor" ? "create" : "get" }})`. Opens returned URL in new tab (`start_url` for doctor, `join_url` for patient).
- Loading state, Sonner error toasts.

Integrate card into:
- `AppointmentsPage.tsx` for online appointments (replaces existing `generateZoomMeeting` stub button).
- `ManageAppointment.tsx` patient view for online appointments.

### 5. Lifecycle sync
In `AppointmentsPage.tsx`:
- On **reschedule** (already exists): if row has `zoom_meeting_id`, call function with `action: "update"`.
- On **cancel/delete**: if row has `zoom_meeting_id`, call function with `action: "delete"` before deleting row.

### 6. Config
Add `[functions.create-zoom-meeting] verify_jwt = true` (already present — confirm).

### Technical notes
- Use `npm:@supabase/supabase-js@2` inside function to load appointment with service role.
- Return 401/403 with clear messages so Sonner toasts show useful errors.
- 15-minute gate is enforced **both** client-side (UX) and server-side (create/get returns 425 if `now < scheduled - 60min` — a bit more lenient than UI to allow doctor prep).

### Order of implementation
1. Add secrets prompt.
2. Migration for columns + grants.
3. Rewrite edge function.
4. Build `VideoConsultationCard`.
5. Wire into `AppointmentsPage` + `ManageAppointment`.
6. Reschedule/cancel sync hooks.
