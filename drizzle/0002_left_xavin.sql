ALTER TYPE "public"."grade_source" ADD VALUE 'unset';--> statement-breakpoint
ALTER TABLE "biz_profiles" ALTER COLUMN "biz_no" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "biz_profiles" ALTER COLUMN "tax_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "biz_profiles" ALTER COLUMN "status" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rfps" ALTER COLUMN "biz_profile_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "biz_profiles" ADD CONSTRAINT "biz_profile_at_least_one_field" CHECK ("biz_profiles"."biz_no" IS NOT NULL OR "biz_profiles"."grade" IS NOT NULL);