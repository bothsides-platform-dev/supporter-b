ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "has_logo" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_logo_blobs" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	"mime" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_logo_blobs" ADD CONSTRAINT "workspace_logo_blobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
