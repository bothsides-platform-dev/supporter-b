-- Apply before deploying the application. Existing requests retain an empty list.
ALTER TABLE rfp_matching_requests ADD COLUMN IF NOT EXISTS current_pgs jsonb NOT NULL DEFAULT '[]'::jsonb;
