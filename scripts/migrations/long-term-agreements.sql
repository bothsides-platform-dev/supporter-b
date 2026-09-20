-- Additive only. Apply BEFORE admin-supporter-b and bidit application deployment.
-- Existing signing_contracts, provider references and archives are untouched.
BEGIN;
CREATE TABLE IF NOT EXISTS pg_agreement_rates (
  pg_ws_id uuid PRIMARY KEY REFERENCES workspaces(id),
  version integer NOT NULL DEFAULT 1,
  rates jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS signing_agreement_drafts (
  contract_id uuid PRIMARY KEY REFERENCES signing_contracts(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1,
  parties jsonb NOT NULL,
  prepared jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
