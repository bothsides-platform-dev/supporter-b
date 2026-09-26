-- Apply after 20260924-pg-matching-defaults.sql and before the buyer app.
-- Frozen copy of admin-supporter-b/lib/mcc-catalog.ts (29 entries, 2026-09-24).
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE rfp_matching_requests ADD COLUMN IF NOT EXISTS is_custom_industry boolean NOT NULL DEFAULT false;

-- Operations-only ledger: app startup never imports or restores industries.
CREATE TABLE IF NOT EXISTS app_data_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  INSERT INTO app_data_migrations (id) VALUES ('20260924-standard-industries') ON CONFLICT DO NOTHING;
  IF FOUND THEN
    INSERT INTO pg_recommendation_groups (mcc_code, name, mcc_version, sort_order) VALUES
      ('5411', '식료품점·슈퍼마켓', 'visa-2026-04', 0),
      ('5499', '편의점·기타 식품 판매', 'visa-2026-04', 1),
      ('5651', '종합 의류 판매', 'visa-2026-04', 2),
      ('5661', '신발 판매', 'visa-2026-04', 3),
      ('5699', '기타 의류·패션 잡화 판매', 'visa-2026-04', 4),
      ('5712', '가구·홈퍼니싱 판매', 'visa-2026-04', 5),
      ('5722', '가전제품 판매', 'visa-2026-04', 6),
      ('5732', '전자제품 판매', 'visa-2026-04', 7),
      ('5941', '스포츠용품 판매', 'visa-2026-04', 8),
      ('5942', '서적 판매', 'visa-2026-04', 9),
      ('5943', '문구·사무·학용품 판매', 'visa-2026-04', 10),
      ('5944', '보석·시계·은제품 판매', 'visa-2026-04', 11),
      ('5945', '장난감·취미·보드게임용품 판매', 'visa-2026-04', 12),
      ('5977', '화장품 판매', 'visa-2026-04', 13),
      ('5995', '반려동물·사료·용품 판매', 'visa-2026-04', 14),
      ('5812', '음식점', 'visa-2026-04', 15),
      ('5814', '패스트푸드 음식점', 'visa-2026-04', 16),
      ('5815', '전자책·영상·음악·디지털 이미지 판매', 'visa-2026-04', 17),
      ('5816', '디지털 게임 판매', 'visa-2026-04', 18),
      ('5817', '디지털 소프트웨어 판매 (게임 제외)', 'visa-2026-04', 19),
      ('7372', '프로그래밍·데이터 처리·시스템 개발', 'visa-2026-04', 20),
      ('8241', '원격 교육', 'visa-2026-04', 21),
      ('8299', '기타 교육 서비스', 'visa-2026-04', 22),
      ('7392', '경영 컨설팅·홍보 서비스', 'visa-2026-04', 23),
      ('4722', '여행사·여행 운영', 'visa-2026-04', 24),
      ('7011', '호텔·모텔·리조트·숙박 예약', 'visa-2026-04', 25),
      ('7991', '관광명소·전시', 'visa-2026-04', 26),
      ('7997', '회원제 스포츠·레크리에이션 클럽', 'visa-2026-04', 27),
      ('7999', '기타 레크리에이션 서비스', 'visa-2026-04', 28)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
COMMIT;
