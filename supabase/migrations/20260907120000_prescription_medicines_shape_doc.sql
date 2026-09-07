-- Documentation-only: records the actual MedicineItem shape now written by
-- the Add Prescription "+ Add Medicine" UI. The `medicines` jsonb column
-- itself already exists (20260810040000_prescription_template_upgrade.sql)
-- and needs no schema change — only the shape the app writes into it changed.
--
-- Current shape: { name, strength, morning: 0|1, afternoon: 0|1,
-- evening: 0|1, durationDays: number, food: "before"|"after" }
-- (the standard Indian Rx "1-0-1" morning/afternoon/evening dosage notation).
--
-- The earlier documented shape ({name,strength,frequency,duration,timing,
-- route,instructions}) was never actually written by any UI — the prior Add
-- Prescription form only ever wrote the legacy free-text `medications`
-- column, so no existing rows needed migrating.
COMMENT ON COLUMN public.prescriptions.medicines IS
  'Array of structured medicine line items: { name, strength, morning: 0|1, afternoon: 0|1, evening: 0|1, durationDays: number, food: "before"|"after" }.';
