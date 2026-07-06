import { ConsultButton } from './ConsultButton';
import { LandingHeroSection } from './LandingHeroSection';
import { HeroKineticHeadline } from './hero/HeroKineticHeadline';
import { PgHeroProductWindow } from './hero/PgHeroProductWindow';

// PG 파트너 히어로 — 구매사 히어로와 동일한 핀 씬(다크 오프닝 ASCII → 제품 창 부상 → 라이트
// 리빌 → 헤더 톤 스위치)을 PG 카피·CTA·목업으로 재사용한다. 씬 튜닝은 HeroPinnedScene 이
// 단일 소유. 여기선 콘텐츠 슬롯만 주입한다.
// 랜딩/마케팅 면이라 '경쟁 입찰' 프레이밍 허용(CLAUDE.md). '만나세요' = 인바운드 수신 강조.
const PG_LINE1_WORDS = ['Supporter', 'B로'];
const PG_PHRASES = [
  '확실한 니즈의 고객사를',
  '검증된 영업 기회를',
  '새로운 성장 가맹점을',
  '먼저 도착하는 인바운드를',
  '조건이 정리된 리드를',
];

const PG_SUBCOPY = (
  <>
    고객사가 거래 조건을 직접 정리해 견적을 요청하면, 조건이 맞는 파트너 PG사에게 그대로 전달됩니다.
    <br />
    리드 발굴과 자격 검증에 쓰던 시간을 아끼고, 수주 가능성이 높은 기회부터 제안하세요.
  </>
);

// 제품 창 바로 위 리드 카피 — 라이트 리빌 때 목업과 함께 자리잡는 인바운드 가치 한 줄.
const PG_PRODUCT_LEAD = (
  <p className="text-center text-[clamp(20px,3vw,32px)] font-medium leading-[1.32] tracking-[-0.018em] text-[var(--md-sys-color-on-surface)] text-balance break-keep">
    콜드콜보다 빠르게.
    <br />
    광고 리드보다 정확하게.
    <br />
    <span className="text-[var(--md-sys-color-primary)]">
      이미 PG 조건을 비교 중인 고객사에게 먼저 닿으세요.
    </span>
  </p>
);

export function PgHeroSection() {
  return (
    <LandingHeroSection
      headline={
        <HeroKineticHeadline line1Words={PG_LINE1_WORDS} phrases={PG_PHRASES} suffix="만나세요." />
      }
      subCopy={PG_SUBCOPY}
      cta={
        <ConsultButton href="/signup/pg" variant="on-dark">
          파트너로 시작하기 →
        </ConsultButton>
      }
      productWindow={<PgHeroProductWindow />}
      productLead={PG_PRODUCT_LEAD}
    />
  );
}
