-- Shared by supporter-b and admin-supporter-b. Apply before either application release.

ALTER TYPE outbox_event ADD VALUE IF NOT EXISTS 'rfp.consultation';

BEGIN;

ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS assignment_alimtalk_consent_at timestamptz;

ALTER TABLE alimtalk_outbox ADD COLUMN IF NOT EXISTS assignment jsonb;

ALTER TABLE rfp_matching_requests ADD COLUMN IF NOT EXISTS assignment_eligible boolean NOT NULL DEFAULT false;

ALTER TABLE guest_rfp_requests ADD COLUMN IF NOT EXISTS assignment_consent text;

CREATE TABLE IF NOT EXISTS "pg_assignment_policies" (
	"pg_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"alimtalk_ready" boolean DEFAULT false NOT NULL,
	"contact_days" integer NOT NULL,
	"window_days" integer NOT NULL,
	"threshold" integer NOT NULL,
	"manager_id" uuid NOT NULL,
	"roster" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "pg_assignment_positive_terms" CHECK ("pg_assignment_policies"."contact_days" BETWEEN 1 AND 30 AND "pg_assignment_policies"."window_days" > 0 AND "pg_assignment_policies"."threshold" > 0),
	CONSTRAINT "pg_assignment_policies_pg_id_workspaces_id_fk" FOREIGN KEY ("pg_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "pg_assignment_policies_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "pg_consultation_cases" (
	"review_id" uuid PRIMARY KEY NOT NULL,
	"assignee" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"notified_revision" integer DEFAULT 0 NOT NULL,
	"consent_by" uuid NOT NULL,
	"consent_version" text NOT NULL,
	"consent_text" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"contact_due" timestamp with time zone NOT NULL,
	"quote_due" timestamp with time zone NOT NULL,
	"late_quote_due" timestamp with time zone,
	"quoted_at" timestamp with time zone,
	CONSTRAINT "pg_consultation_cases_review_id_rfp_pg_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "rfp_pg_reviews"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "pg_consultation_cases_assignee_users_id_fk" FOREIGN KEY ("assignee") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action,
	CONSTRAINT "pg_consultation_cases_consent_by_users_id_fk" FOREIGN KEY ("consent_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "pg_consultation_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"reported_by" uuid NOT NULL,
	"recipient" uuid NOT NULL,
	"message_id" uuid,
	"reported_at" timestamp with time zone NOT NULL,
	"remind_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"answer" text,
	"answered_at" timestamp with time zone,
	"channel" text,
	"judgment" text,
	"judged_by" text,
	"reason" text,
	"judged_at" timestamp with time zone,
	CONSTRAINT "pg_consultation_questions_message_id_unique" UNIQUE("message_id"),
	CONSTRAINT "pg_consultation_questions_review_id_pg_consultation_cases_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "pg_consultation_cases"("review_id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "pg_consultation_questions_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action,
	CONSTRAINT "pg_consultation_questions_recipient_users_id_fk" FOREIGN KEY ("recipient") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action,
	CONSTRAINT "pg_consultation_questions_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE set null ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "pg_consultation_evidence" (
	"question_id" uuid NOT NULL,
	"key" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "pg_consultation_evidence_question_id_key_pk" PRIMARY KEY("question_id","key"),
	CONSTRAINT "pg_consultation_evidence_question_id_pg_consultation_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "pg_consultation_questions"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "pg_consultation_evidence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "pg_consultation_events" (
	"review_id" uuid NOT NULL,
	"key" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	CONSTRAINT "pg_consultation_events_review_id_key_pk" PRIMARY KEY("review_id","key"),
	CONSTRAINT "pg_consultation_events_review_id_pg_consultation_cases_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "pg_consultation_cases"("review_id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "pg_consultation_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pg_id" uuid NOT NULL,
	"manager_id" uuid NOT NULL,
	"case_ids" uuid[] NOT NULL,
	"body" text NOT NULL,
	"confirmed_by" text NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fingerprint" text NOT NULL,
	CONSTRAINT "pg_consultation_corrections_pg_id_workspaces_id_fk" FOREIGN KEY ("pg_id") REFERENCES "workspaces"("id") ON DELETE no action ON UPDATE no action,
	CONSTRAINT "pg_consultation_corrections_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "pg_consultation_contact_due" ON "pg_consultation_cases" USING btree ("contact_due");

CREATE UNIQUE INDEX IF NOT EXISTS "pg_correction_snapshot" ON "pg_consultation_corrections" USING btree ("pg_id","fingerprint");

CREATE INDEX IF NOT EXISTS "pg_consultation_questions_review" ON "pg_consultation_questions" USING btree ("review_id","reported_at");

CREATE OR REPLACE VIEW "public"."pg_consultation_progress" AS (
  WITH facts AS (
    SELECT q.review_id, q.reported_at AS at, 'claim' AS kind,
      q.answer IS DISTINCT FROM 'missed' OR q.judgment = 'accepted' AS valid
    FROM pg_consultation_questions q
    UNION ALL
    SELECT q.review_id, q.answered_at, q.answer, q.answer = 'received'
    FROM pg_consultation_questions q WHERE q.answer IS NOT NULL
    UNION ALL
    SELECT q.review_id, e.observed_at, 'observed',
      q.answer IS DISTINCT FROM 'missed' OR q.judgment = 'accepted' OR e.observed_at > q.answered_at
    FROM pg_consultation_evidence e JOIN pg_consultation_questions q ON q.id = e.question_id
  ), evidence AS (
    SELECT review_id, min(at) FILTER (WHERE valid) AS first_at,
      (array_agg(kind ORDER BY at DESC, CASE kind WHEN 'missed' THEN 0 WHEN 'received' THEN 1 ELSE 2 END))[1] AS latest
    FROM facts GROUP BY review_id
  ), cases AS (
    SELECT c.*, e.first_at, COALESCE(e.latest = 'missed', false) AS missed,
      EXISTS (SELECT 1 FROM pg_consultation_questions q WHERE q.review_id = c.review_id AND q.answer = 'missed' AND q.judgment IS NULL) AS disputed,
      r.status IN ('requested','reviewing') AND f.status = 'sent' AS open,
      LEAST(now(), CASE WHEN r.status IN ('rejected','withdrawn','buyer_ended') THEN r.updated_at END,
        CASE WHEN f.status <> 'sent' THEN f.updated_at END) AS until
    FROM pg_consultation_cases c JOIN rfp_pg_reviews r ON r.id=c.review_id
    JOIN rfps f ON f.id=r.rfp_id LEFT JOIN evidence e ON e.review_id=c.review_id
  )
  SELECT review_id, first_at AS first_contact_at, missed, disputed,
    NOT disputed AND (first_at > contact_due OR (first_at IS NULL AND until >= contact_due)) IS TRUE AS contact_late,
    late_quote_due IS NOT NULL OR (quoted_at > quote_due OR (quoted_at IS NULL AND until >= quote_due)) IS TRUE AS quote_late,
    open AND quoted_at IS NULL AND now() >= contact_due AND (first_at IS NULL OR missed) AS can_switch
  FROM cases
);

COMMIT;
