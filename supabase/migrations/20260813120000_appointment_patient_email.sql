-- Root cause of the "patient email not showing on Doctor Side" bug: the
-- appointments table never had a column to store the email the patient
-- types into the booking form, so it was discarded at insert time and had
-- nothing to sync onto patients.email later. Add the missing column so the
-- booking flow (BookingWidget.tsx) and the pay-first flow
-- (create-razorpay-order / verify-razorpay-payment) can persist it, and
-- AppointmentsPage's completion-time patient upsert can copy it onto the
-- patient's profile.
ALTER TABLE public.appointments ADD COLUMN patient_email text;
