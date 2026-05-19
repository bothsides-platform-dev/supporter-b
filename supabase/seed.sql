-- Supabase local seed (executed by `supabase start` / `supabase db reset`).
--
-- Creates the `attachments` Storage bucket the application reads + writes
-- through `lib/server/storage/supabase.ts`. Without this, the first file
-- upload against a fresh local Supabase instance fails with "Bucket not
-- found". Idempotent via ON CONFLICT so re-running `supabase db reset`
-- is safe.
--
-- Production buckets are managed via the Supabase dashboard (or a
-- one-time migration). This file targets the local Docker stack only.

INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;
