-- Apply before deploying either application. Existing RFP contracts retain their source.

ALTER TYPE outbox_event ADD VALUE IF NOT EXISTS 'pg.instant_quote';

BEGIN;

CREATE TABLE IF NOT EXISTS "instant_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"pg_id" uuid NOT NULL,
	"code" text NOT NULL,
	"stamp" text NOT NULL,
	"terms" jsonb NOT NULL,
	"screening" jsonb NOT NULL,
	"applicant" jsonb NOT NULL,
	"consent" text NOT NULL,
	"consent_version" text NOT NULL,
	"consent_by" uuid NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"retry_until" timestamp with time zone NOT NULL,
	"ack_due" timestamp with time zone NOT NULL,
	"apply_due" timestamp with time zone NOT NULL,
	"result_due" timestamp with time zone NOT NULL,
	"recipient" text NOT NULL,
	"channel_revision" integer NOT NULL,
	"signup_url" text NOT NULL,
	"visited_at" timestamp with time zone,
	"ack_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"result_at" timestamp with time zone,
	"decision" text,
	"tier" text,
	"buyer_applied_at" timestamp with time zone,
	"buyer_enrolled_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"selected_at" timestamp with time zone,
	"selected_by" uuid,
	"checked_at" timestamp with time zone,
	"differs" boolean,
	"reported" text,
	"resolution" text,
	"correction_requested_at" timestamp with time zone,
	"correction_requested_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	CONSTRAINT "instant_attempts_code_unique" UNIQUE("code"),
	CONSTRAINT "instant_decision_tier" CHECK (("instant_attempts"."decision" is null and "instant_attempts"."tier" is null and "instant_attempts"."result_at" is null)
    or ("instant_attempts"."decision" is not null and "instant_attempts"."result_at" is not null and "instant_attempts"."applied_at" is not null and
      (("instant_attempts"."decision"='declined' and "instant_attempts"."tier" is null) or ("instant_attempts"."decision"='approved' and "instant_attempts"."tier" is not null and "instant_attempts"."tier" in ('sole','sme1','sme2','sme3','general'))))),
	CONSTRAINT "instant_award_source" CHECK (("instant_attempts"."selected_at" is null and "instant_attempts"."selected_by" is null) or
    ("instant_attempts"."selected_at" is not null and "instant_attempts"."selected_by" is not null and ("instant_attempts"."buyer_enrolled_at" is not null or "instant_attempts"."decision" is not distinct from 'approved')))
);


CREATE TABLE IF NOT EXISTS "instant_pg_channels" (
	"pg_id" uuid PRIMARY KEY NOT NULL,
	"recipient" text NOT NULL,
	"signup_url" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL
);


CREATE TABLE IF NOT EXISTS "instant_policies" (
	"group_id" uuid NOT NULL,
	"pg_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"policy" jsonb NOT NULL,
	CONSTRAINT "instant_policies_group_id_pg_id_pk" PRIMARY KEY("group_id","pg_id")
);


CREATE TABLE IF NOT EXISTS "instant_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_key" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"creator" uuid NOT NULL,
	"input" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE signing_contracts ADD COLUMN IF NOT EXISTS instant_attempt_id uuid;

ALTER TABLE signing_contracts ALTER COLUMN rfp_id DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE signing_contracts ADD CONSTRAINT "signing_contracts_instant_attempt_id_unique" UNIQUE("instant_attempt_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE signing_contracts ADD CONSTRAINT "signing_one_source" CHECK (("signing_contracts"."rfp_id" IS NOT NULL AND "signing_contracts"."instant_attempt_id" IS NULL) OR ("signing_contracts"."rfp_id" IS NULL AND "signing_contracts"."instant_attempt_id" IS NOT NULL AND "signing_contracts"."kind" = 'platform_buyer'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "signing_contracts" ADD CONSTRAINT "signing_contracts_instant_attempt_id_instant_attempts_id_fk" FOREIGN KEY ("instant_attempt_id") REFERENCES "public"."instant_attempts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "instant_attempts" ADD CONSTRAINT "instant_attempts_request_id_instant_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."instant_requests"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "instant_attempts" ADD CONSTRAINT "instant_attempts_pg_id_workspaces_id_fk" FOREIGN KEY ("pg_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "instant_attempts" ADD CONSTRAINT "instant_attempts_consent_by_users_id_fk" FOREIGN KEY ("consent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "instant_attempts" ADD CONSTRAINT "instant_attempts_selected_by_users_id_fk" FOREIGN KEY ("selected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "instant_pg_channels" ADD CONSTRAINT "instant_pg_channels_pg_id_workspaces_id_fk" FOREIGN KEY ("pg_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "instant_policies" ADD CONSTRAINT "instant_policies_group_id_pg_recommendation_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."pg_recommendation_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "instant_policies" ADD CONSTRAINT "instant_policies_pg_id_instant_pg_channels_pg_id_fk" FOREIGN KEY ("pg_id") REFERENCES "public"."instant_pg_channels"("pg_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "instant_requests" ADD CONSTRAINT "instant_requests_buyer_id_workspaces_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "instant_requests" ADD CONSTRAINT "instant_requests_creator_users_id_fk" FOREIGN KEY ("creator") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "instant_active_attempt" ON "instant_attempts" USING btree ("request_id") WHERE "instant_attempts"."closed_at" is null;

CREATE UNIQUE INDEX IF NOT EXISTS "instant_request_pg" ON "instant_attempts" USING btree ("request_id","pg_id");

CREATE INDEX IF NOT EXISTS "instant_pg_inbox" ON "instant_attempts" USING btree ("pg_id");

CREATE INDEX IF NOT EXISTS "instant_followups" ON "instant_attempts" USING btree ("ack_due","apply_due","result_due") WHERE "instant_attempts"."closed_at" is null;

CREATE UNIQUE INDEX IF NOT EXISTS "instant_request_key" ON "instant_requests" USING btree ("buyer_id","request_key");

COMMIT;
