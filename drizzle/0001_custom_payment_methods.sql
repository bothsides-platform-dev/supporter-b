ALTER TABLE "rfps" ADD COLUMN IF NOT EXISTS "custom_payment_methods" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN IF NOT EXISTS "custom_fees" jsonb DEFAULT '{}'::jsonb NOT NULL;
