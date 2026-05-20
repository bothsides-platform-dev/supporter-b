-- Multi-workspace membership: remember a user's last active workspace so a
-- user belonging to several workspaces is restored to the right one on login.
-- Hand-written per project convention (no db:generate — snapshot chain
-- intentionally not maintained). Idempotent DDL so it applies cleanly whether
-- the target already has the column (prod schema-reflect path) or not (fresh
-- pglite test DB).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_active_workspace_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_last_active_workspace_id_workspaces_id_fk" FOREIGN KEY ("last_active_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
