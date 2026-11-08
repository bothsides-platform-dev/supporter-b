-- Apply once after agent-channel + agent-analytics DDL, before app deployment.
-- Append-only evidence records. OAuth deletion unlinks attribution, not money facts.
BEGIN;
CREATE TABLE partner_outcome_entries (
  id uuid PRIMARY KEY,
  command_id uuid NOT NULL UNIQUE,
  input_hash text NOT NULL,
  request_id uuid REFERENCES agent_requests(id) ON DELETE SET NULL,
  request_created_at timestamptz NOT NULL,
  rfp_id uuid NOT NULL REFERENCES rfps(id) ON DELETE RESTRICT,
  provider_workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  environment text NOT NULL,
  kind text NOT NULL,
  source text NOT NULL,
  reference text NOT NULL,
  evidence_reference text NOT NULL,
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text NOT NULL,
  amount numeric(20,4),
  currency text,
  agreement_reference text,
  calculation_reference text,
  period_start date,
  period_end date,
  integration_environment text,
  related_entry_id uuid REFERENCES partner_outcome_entries(id) ON DELETE RESTRICT,
  reason text,
  schema_version integer NOT NULL DEFAULT 1,
  CONSTRAINT partner_outcome_kind_check CHECK(kind IN ('provider_contract_confirmed','integration_verified','commission_confirmed','commission_paid','voided')),
  CONSTRAINT partner_outcome_amount_check CHECK(
    (kind IN ('commission_confirmed','commission_paid') AND amount IS NOT NULL AND amount>=0 AND currency IS NOT NULL AND currency ~ '^[A-Z]{3}$')
    OR (kind NOT IN ('commission_confirmed','commission_paid') AND amount IS NULL AND currency IS NULL)),
  CONSTRAINT partner_outcome_related_check CHECK(
    (kind IN ('commission_paid','voided') AND related_entry_id IS NOT NULL)
    OR (kind NOT IN ('commission_paid','voided') AND related_entry_id IS NULL)),
  CONSTRAINT partner_outcome_payment_check CHECK(kind<>'commission_paid' OR amount>0),
  CONSTRAINT partner_outcome_basis_check CHECK(kind<>'commission_confirmed' OR (agreement_reference IS NOT NULL AND calculation_reference IS NOT NULL)),
  CONSTRAINT partner_outcome_integration_check CHECK(
    (kind='integration_verified' AND integration_environment IS NOT NULL AND integration_environment IN ('sandbox','live'))
    OR (kind<>'integration_verified' AND integration_environment IS NULL)),
  CONSTRAINT partner_outcome_void_reason_check CHECK(kind<>'voided' OR (reason IS NOT NULL AND length(btrim(reason))>0)),
  CONSTRAINT partner_outcome_period_check CHECK((period_start IS NULL AND period_end IS NULL) OR (period_start IS NOT NULL AND period_end IS NOT NULL AND period_start<=period_end))
);
CREATE UNIQUE INDEX partner_outcome_reference_unique ON partner_outcome_entries(provider_workspace_id,kind,reference);
CREATE UNIQUE INDEX partner_outcome_void_unique ON partner_outcome_entries(related_entry_id) WHERE kind='voided';
CREATE INDEX partner_outcome_rfp_idx ON partner_outcome_entries(rfp_id,recorded_at);
CREATE INDEX partner_outcome_request_idx ON partner_outcome_entries(request_id);
CREATE INDEX partner_outcome_related_idx ON partner_outcome_entries(related_entry_id);
CREATE INDEX partner_outcome_cohort_idx ON partner_outcome_entries(environment,request_created_at);
COMMIT;
-- Rollback app code first and retain the ledger. Removing this table destroys
-- verified accounting history and requires a separate export/approval decision.
