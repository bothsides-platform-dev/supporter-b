-- Apply before deploying the signup consent code. Additive; never backfill old users.
-- Approved immutable document editions are a separate release prerequisite.
BEGIN;

CREATE TABLE IF NOT EXISTS user_signup_consents (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  terms_accepted boolean NOT NULL,
  privacy_accepted boolean NOT NULL,
  marketing_accepted boolean NOT NULL DEFAULT false,
  terms_version text NOT NULL,
  terms_url text NOT NULL,
  privacy_version text NOT NULL,
  privacy_url text NOT NULL,
  marketing_version text NOT NULL,
  marketing_url text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_signup_consents_required CHECK (terms_accepted = true AND privacy_accepted = true),
  CONSTRAINT user_signup_consents_documents_present CHECK (
    btrim(terms_version) <> '' AND btrim(terms_url) <> '' AND
    btrim(privacy_version) <> '' AND btrim(privacy_url) <> '' AND
    btrim(marketing_version) <> '' AND btrim(marketing_url) <> ''
  )
);

COMMIT;
