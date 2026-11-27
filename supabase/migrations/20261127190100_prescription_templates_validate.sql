-- Validates the constraints added NOT VALID by 20261127190000_prescription_templates.sql.
-- A separate file so the scan runs in its own transaction (VALIDATE only takes a light lock, and the
-- ACCESS EXCLUSIVE lock of the previous migration is already released).
-- NEVER tighten prescription_template_config_valid() in place: it backs CHECK constraints that are
-- re-run on every UPDATE of a prescription. Create a _v2 function and point new constraints at it.
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.prescriptions VALIDATE CONSTRAINT prescriptions_template_fk;
ALTER TABLE public.prescriptions VALIDATE CONSTRAINT prescriptions_extra_shape;
ALTER TABLE public.prescriptions VALIDATE CONSTRAINT prescriptions_template_snapshot_valid;
