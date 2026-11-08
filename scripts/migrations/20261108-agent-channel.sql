-- Apply once before enabling AGENT_ACCOUNT_CHANNEL_ENABLED. Additive only.
BEGIN;
CREATE TABLE "agent_clients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"redirect_uris" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);

CREATE TABLE "agent_codes" (
	"hash" text PRIMARY KEY NOT NULL,
	"connection_id" uuid NOT NULL,
	"redirect_uri" text NOT NULL,
	"challenge" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);

CREATE TABLE "agent_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"session_version" integer NOT NULL,
	"scopes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);

CREATE TABLE "agent_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"connection_id" uuid NOT NULL,
	"request_id" uuid,
	"event" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"revision" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "agent_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"connection_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"content" jsonb NOT NULL,
	"rfp_code" text,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_requests_request_key_unique" UNIQUE("request_key"),
	CONSTRAINT "agent_request_revision_check" CHECK ("agent_requests"."revision" > 0)
);

CREATE TABLE "agent_tokens" (
	"access_hash" text PRIMARY KEY NOT NULL,
	"refresh_hash" text NOT NULL,
	"connection_id" uuid NOT NULL,
	"scopes" jsonb NOT NULL,
	"access_expires_at" timestamp with time zone NOT NULL,
	"refresh_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "agent_tokens_refresh_hash_unique" UNIQUE("refresh_hash")
);

ALTER TABLE "agent_codes" ADD CONSTRAINT "agent_codes_connection_id_agent_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."agent_connections"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "agent_connections" ADD CONSTRAINT "agent_connections_client_id_agent_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."agent_clients"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "agent_connections" ADD CONSTRAINT "agent_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "agent_connections" ADD CONSTRAINT "agent_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_connection_id_agent_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."agent_connections"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_request_id_agent_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."agent_requests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_connection_id_agent_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."agent_connections"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "agent_tokens" ADD CONSTRAINT "agent_tokens_connection_id_agent_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."agent_connections"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "agent_connection_owner_idx" ON "agent_connections" USING btree ("user_id","workspace_id");
CREATE INDEX "agent_event_connection_time_idx" ON "agent_events" USING btree ("connection_id","created_at");
CREATE INDEX "agent_request_connection_idx" ON "agent_requests" USING btree ("connection_id");
CREATE INDEX "agent_token_connection_idx" ON "agent_tokens" USING btree ("connection_id");
COMMIT;
