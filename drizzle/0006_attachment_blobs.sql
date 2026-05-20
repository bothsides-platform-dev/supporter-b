-- Attachment payload bytes, moved off Supabase Storage into Postgres.
-- The `attachments` table keeps metadata + the storage path; the bytes live
-- here keyed by that path. No FK to `attachments` — the upload route writes
-- the blob before the metadata row exists, and the path is the join key.
CREATE TABLE IF NOT EXISTS "attachment_blobs" (
  "path" text PRIMARY KEY NOT NULL,
  "mime" text NOT NULL,
  "bytes" bytea NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
