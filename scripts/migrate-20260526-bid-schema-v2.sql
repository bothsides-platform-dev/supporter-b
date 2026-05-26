-- 기존 DB (0000_black_famine.sql 이미 적용된 상태)에 bid 스키마 v2 변경 사항을 증분 적용.
-- 신규 DB에는 0000_past_klaw.sql 이 전체 스키마를 담고 있으므로 이 파일을 사용하지 않아도 됨.
--
-- 실행: psql $DATABASE_URL -f scripts/migrate-20260526-bid-schema-v2.sql

BEGIN;

-- 1. bids: 기존 컬럼 제거
ALTER TABLE "bids" DROP COLUMN IF EXISTS "deposit";
ALTER TABLE "bids" DROP COLUMN IF EXISTS "setup_fee";
ALTER TABLE "bids" DROP COLUMN IF EXISTS "monthly_min";
ALTER TABLE "bids" DROP COLUMN IF EXISTS "bank_transfer_fee_pct";
ALTER TABLE "bids" DROP COLUMN IF EXISTS "easy_pay_fee_pct";
ALTER TABLE "bids" DROP COLUMN IF EXISTS "card_fees_by_issuer";
ALTER TABLE "bids" DROP COLUMN IF EXISTS "overseas_card_fee_pct";

-- 2. bids: settle_cycle enum → text
ALTER TABLE "bids" ALTER COLUMN "settle_cycle" TYPE text USING "settle_cycle"::text;
DROP TYPE IF EXISTS "public"."settle_cycle";

-- 3. bids: 신규 컬럼 추가
ALTER TABLE "bids" ADD COLUMN IF NOT EXISTS "settle_limit" numeric(14,2) NOT NULL DEFAULT '0';
ALTER TABLE "bids" ADD COLUMN IF NOT EXISTS "guarantee_insurance" numeric(14,2) NOT NULL DEFAULT '0';
ALTER TABLE "bids" ADD COLUMN IF NOT EXISTS "payment_fees" jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 4. rfps: required_payment_methods 추가
ALTER TABLE "rfps" ADD COLUMN IF NOT EXISTS "required_payment_methods" text[] NOT NULL DEFAULT '{}';

COMMIT;
