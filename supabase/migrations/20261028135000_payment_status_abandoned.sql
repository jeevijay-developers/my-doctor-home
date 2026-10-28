-- Separate migration: a new enum value cannot be used in the transaction that adds it.
ALTER TYPE public.payment_txn_status ADD VALUE IF NOT EXISTS 'abandoned';
