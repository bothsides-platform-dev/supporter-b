-- Apply AFTER 20261108-agent-channel.sql and BEFORE deploying analytics code.
-- Existing events remain unknown: do not infer production or backfill token success.
BEGIN;
ALTER TABLE agent_events ADD COLUMN environment text NOT NULL DEFAULT 'unknown';
CREATE INDEX agent_event_environment_time_idx ON agent_events(environment, created_at);
CREATE TABLE agent_observations (
  id uuid PRIMARY KEY,
  schema_version integer NOT NULL DEFAULT 1,
  environment text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  connection_id uuid REFERENCES agent_connections(id) ON DELETE CASCADE,
  request_id uuid REFERENCES agent_requests(id) ON DELETE CASCADE,
  surface text NOT NULL,
  operation text NOT NULL,
  outcome text NOT NULL,
  duration_ms integer NOT NULL,
  error_code text,
  dimensions jsonb NOT NULL DEFAULT '{}',
  CONSTRAINT agent_observation_duration_check CHECK(duration_ms BETWEEN 0 AND 3600000),
  CONSTRAINT agent_observation_request_connection_check CHECK(request_id IS NULL OR connection_id IS NOT NULL)
);
CREATE INDEX agent_observation_environment_time_idx ON agent_observations(environment, occurred_at);
CREATE INDEX agent_observation_time_idx ON agent_observations(occurred_at);
CREATE INDEX agent_observation_connection_time_idx ON agent_observations(connection_id, occurred_at);
CREATE INDEX agent_observation_request_idx ON agent_observations(request_id);
COMMIT;
-- App rollback: disable AGENT_ANALYTICS_ENABLED, deploy previous app, retain data.
-- Destructive schema removal only after an export and explicit approval:
-- DROP TABLE agent_observations;
-- DROP INDEX agent_event_environment_time_idx;
-- ALTER TABLE agent_events DROP COLUMN environment;
