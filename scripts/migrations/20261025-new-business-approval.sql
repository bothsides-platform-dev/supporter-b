-- Commit before deploying consumers; does not reclassify existing buyers.
ALTER TYPE grade_source ADD VALUE IF NOT EXISTS 'new_business_exception';
