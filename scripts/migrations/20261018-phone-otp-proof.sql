-- Apply before deploying purpose-bound, single-use phone OTP proofs.
-- Legacy rows intentionally keep NULL bindings and cannot authorize a write.
BEGIN;

DO $$ BEGIN
  CREATE TYPE phone_otp_purpose AS ENUM ('signup', 'profile_phone_update');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE phone_otps
  ADD COLUMN IF NOT EXISTS purpose phone_otp_purpose,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS proof_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;

COMMIT;
