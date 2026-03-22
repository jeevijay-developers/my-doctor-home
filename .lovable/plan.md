

## Plan: Add More Dashboard Features & Enhance UI

### New Features to Add

#### 1. Prescription/Treatment Notes Page (NEW)
New admin page `/admin/prescriptions` where doctors can write quick treatment notes per patient per visit. Table: `prescriptions` (id, doctor_id, patient_id, patient_name, diagnosis, medications text, notes, date, created_at). This is a core clinic workflow — doctors need to record what they prescribed.

#### 2. SMS/WhatsApp Quick Share Widget (Dashboard)
Add a "Share Your Website" card on dashboard with pre-written messages and one-click WhatsApp share link (`https://wa.me/?text=...`). Helps doctors promote their page instantly.

#### 3. Appointment Status Actions (Appointments Page)
Add inline action buttons on each appointment card: Mark Complete, Confirm, Cancel, No Show — with one-click status update. Currently appointments show status but can't be changed easily.

#### 4. Patient Visit Counter Auto-Update
When a new appointment is completed, auto-increment patient's `total_visits` and update `last_visit`. Add a trigger or handle in-app.

#### 5. Revenue Goal Tracker (Dashboard)
Add a monthly revenue goal widget — doctor sets a target (stored in profiles or settings), dashboard shows progress bar toward that goal.

#### 6. Quick Patient Search (Dashboard)
Add a global patient search input on the dashboard that quickly finds patients by name/phone and navigates to their detail.

#### 7. Reviews Management Page (NEW)
New admin page `/admin/reviews` to view, pin, hide, or delete patient reviews. Currently reviews table exists but no admin management UI.

### UI Enhancements

- **DashboardHome**: Add gradient card borders on stat cards, improve empty state illustrations, add the share widget and revenue goal tracker
- **AppointmentsPage**: Add inline status change dropdown/buttons on each card
- **PatientsPage**: Add patient visit count badges with color coding (new, regular, loyal)
- **Sidebar**: Add Reviews and Prescriptions nav items with icons

### Database Changes

**Migration 1**: `prescriptions` table
```sql
CREATE TABLE prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL,
  patient_id uuid REFERENCES patients(id),
  patient_name text NOT NULL,
  diagnosis text,
  medications text,
  notes text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Doctors manage own prescriptions" ON prescriptions FOR ALL USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);
```

**Migration 2**: Add `revenue_goal` column to profiles
```sql
ALTER TABLE profiles ADD COLUMN revenue_goal integer DEFAULT 0;
```

### File Summary

| Action | File |
|--------|------|
| Migration | `prescriptions` table + `revenue_goal` on profiles |
| Create | `src/components/admin/PrescriptionsPage.tsx` — treatment notes CRUD |
| Create | `src/components/admin/ReviewsManagePage.tsx` — manage reviews |
| Modify | `AdminDashboard.tsx` — add routes for prescriptions, reviews |
| Modify | `AdminSidebar.tsx` — add Prescriptions + Reviews nav items |
| Modify | `DashboardHome.tsx` — add WhatsApp share widget, revenue goal tracker, patient search |
| Modify | `AppointmentsPage.tsx` — add inline status change actions |
| Modify | `PatientsPage.tsx` — add visit-count color badges |

### Build Order
1. DB migrations (prescriptions table + revenue_goal)
2. Create PrescriptionsPage with full CRUD
3. Create ReviewsManagePage
4. Add new routes + sidebar nav items
5. Enhance DashboardHome with share widget + revenue goal
6. Add appointment status actions
7. Polish patient cards with badges

