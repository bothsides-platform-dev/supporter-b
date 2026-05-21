-- Generic workspace share link — anyone with the link can join the workspace.
-- Mirrors rfps.share_token. Hand-written per project convention (no db:generate
-- — snapshot chain intentionally not maintained). Idempotent so it applies
-- cleanly whether the target already has the column (prod schema-reflect path)
-- or not (fresh pglite test DB). The volatile gen_random_uuid()::text DEFAULT
-- backfills a distinct value per existing row; UNIQUE then applies against
-- already-unique data.
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "share_token" text NOT NULL DEFAULT gen_random_uuid()::text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_share_token_unique" UNIQUE("share_token");
EXCEPTION WHEN duplicate_object THEN null; END $$;
