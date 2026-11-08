import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { workspaces } from "./workspaces";
import type { AgentScope } from "@/lib/server/agent/account-contract";
import type {
  AgentAnalyticsEnvironment,
  AgentObservation,
} from "@/lib/analytics/agent-contract";

export const agentClients = pgTable("agent_clients", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const agentConnections = pgTable(
  "agent_connections",
  {
    id: uuid("id").primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => agentClients.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sessionVersion: integer("session_version").notNull(),
    scopes: jsonb("scopes").$type<AgentScope[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("agent_connection_owner_idx").on(t.userId, t.workspaceId)],
);
export const agentCodes = pgTable("agent_codes", {
  hash: text("hash").primaryKey(),
  connectionId: uuid("connection_id")
    .notNull()
    .references(() => agentConnections.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  challenge: text("challenge").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});
export const agentTokens = pgTable(
  "agent_tokens",
  {
    accessHash: text("access_hash").primaryKey(),
    refreshHash: text("refresh_hash").notNull().unique(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => agentConnections.id, { onDelete: "cascade" }),
    scopes: jsonb("scopes").$type<AgentScope[]>().notNull(),
    accessExpiresAt: timestamp("access_expires_at", {
      withTimezone: true,
    }).notNull(),
    refreshExpiresAt: timestamp("refresh_expires_at", {
      withTimezone: true,
    }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("agent_token_connection_idx").on(t.connectionId)],
);
export const agentRequests = pgTable(
  "agent_requests",
  {
    id: uuid("id").primaryKey(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => agentConnections.id, { onDelete: "cascade" }),
    requestKey: uuid("request_key").notNull().unique(),
    revision: integer("revision").notNull().default(1),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    rfpCode: text("rfp_code"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("agent_request_connection_idx").on(t.connectionId),
    check("agent_request_revision_check", sql`${t.revision} > 0`),
  ],
);
export const agentEvents = pgTable(
  "agent_events",
  {
    id: uuid("id").primaryKey(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => agentConnections.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").references(() => agentRequests.id, {
      onDelete: "cascade",
    }),
    event: text("event")
      .$type<
        | "connected"
        | "token_issued"
        | "revoked"
        | "token_refreshed"
        | "draft_created"
        | "draft_updated"
        | "request_submitted"
        | "status_read"
      >()
      .notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    environment: text("environment")
      .$type<AgentAnalyticsEnvironment>()
      .notNull()
      .default("unknown"),
    revision: integer("revision"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("agent_event_connection_time_idx").on(t.connectionId, t.createdAt),
    index("agent_event_environment_time_idx").on(t.environment, t.createdAt),
  ],
);

export const agentObservations = pgTable(
  "agent_observations",
  {
    id: uuid("id").primaryKey(),
    schemaVersion: integer("schema_version").notNull().default(1),
    environment: text("environment")
      .$type<AgentAnalyticsEnvironment>()
      .notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    connectionId: uuid("connection_id").references(() => agentConnections.id, {
      onDelete: "cascade",
    }),
    requestId: uuid("request_id").references(() => agentRequests.id, {
      onDelete: "cascade",
    }),
    surface: text("surface").$type<AgentObservation["surface"]>().notNull(),
    operation: text("operation")
      .$type<AgentObservation["operation"]>()
      .notNull(),
    outcome: text("outcome").$type<AgentObservation["outcome"]>().notNull(),
    durationMs: integer("duration_ms").notNull(),
    errorCode: text("error_code").$type<AgentObservation["errorCode"]>(),
    dimensions: jsonb("dimensions")
      .$type<
        Pick<
          AgentObservation,
          "contractType" | "missingRules" | "candidateCount"
        >
      >()
      .notNull()
      .default({}),
  },
  (t) => [
    index("agent_observation_environment_time_idx").on(
      t.environment,
      t.occurredAt,
    ),
    index("agent_observation_time_idx").on(t.occurredAt),
    index("agent_observation_connection_time_idx").on(
      t.connectionId,
      t.occurredAt,
    ),
    index("agent_observation_request_idx").on(t.requestId),
    check(
      "agent_observation_duration_check",
      sql`${t.durationMs} BETWEEN 0 AND 3600000`,
    ),
    check(
      "agent_observation_request_connection_check",
      sql`${t.requestId} IS NULL OR ${t.connectionId} IS NOT NULL`,
    ),
  ],
);
