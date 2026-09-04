'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { motion, useMotionValueEvent, useScroll, useTransform } from 'motion/react';
import { Button } from '@/components/primitives/Button';
import { ChevronDownIcon } from '@/components/icons';
import { LANDING_TYPE } from '@/components/landing/landing-type';
import { EASE_OUT } from '@/lib/landing/ease';
import { HeroAsciiField } from './HeroAsciiField';
import { HeroKineticHeadline } from './HeroKineticHeadline';
import { HeroProductWindow } from './HeroProductWindow';
import { useHeroToneStore } from './hero-tone-store';
import { useMagneticHover } from './useMagneticHover';

// 히어로 핀 트랙 길이. 240vh = 다크 오프닝 → 제품 창 부상 → 라이트 리빌까지 약 1.4 뷰포트 분량의
// 스크롤 스토리. ScrollPinnedSection과 같은 sticky 방식(스크롤 하이재킹 없음)이지만, 풀블리드
// 다크 씬(top-0·섹션 컨테이너 없음)이 필요해 트랙을 히어로 전용으로 둔다.
const TRACK_VH = 240;

// 스크롤 진행(0→1) 구간별 연출 타임라인. 수치는 눈 튜닝 대상.
//  0.00–0.06  스크롤 큐 페이드아웃(Phase B)
//  0.10–0.40  텍스트 이탈 패럴랙스(요소별 속도 차등)
//  0.06–0.68  제품 창 부상(y·rotateX·scale)
//  0.55–0.85  다크 레이어 페이드 → 라이트 리빌

// 히어로 콘텐츠 슬롯 — 구매사 기본값을 두고 PG 히어로가 같은 씬(다크 오프닝·제품 창 부상·라이트
// 리빌·톤 스위치)을 자기 카피/목업으로 재사용한다. 값 미지정 시 기존 구매사 히어로와 동일하다.
export type HeroContent = {
  headline?: ReactNode;
  subCopy?: ReactNode;
  cta?: ReactNode;
  productWindow?: ReactNode;
  /** 제품 창 바로 위 리드 카피(선택). 라이트 리빌 때 창과 함께 페이드+라이즈로 자리잡는다.
   *  PG 히어로만 주입 — 구매사 히어로는 미지정(렌더 안 함). */
  productLead?: ReactNode;
};

const BUYER_SUBCOPY = (
  <>
    여러 PG사의 제안을 동일한 기준으로 받아보고, 계약 조건을 표준화된 비교표로 검토하세요.
    <br />
    수수료뿐 아니라 정산주기, 보증금, 셋업비까지 협상 가능한 조건으로 정리합니다.
  </>
);

// 다크 씬 위 CTA — primary 토큰만 inverse로 뒤집어 다크 테마 primary 버튼과 동일한 대비
// (#9ECAFF 위 잉크 텍스트)를 얻는다. 마그네틱 호버 래퍼는 씬이 소유하므로 여기엔 토큰 반전만 둔다.
const BUYER_CTA = (
  <span className="inline-block [--md-sys-color-primary:var(--md-sys-color-inverse-primary)] [--md-sys-color-on-primary:var(--md-sys-color-inverse-surface)]">
    <Link href="/rfp-create">
      <Button size="lg">PG 비교 견적 무료로 시작하기 →</Button>
    </Link>
  </span>
);

export function HeroPinnedScene({
  headline = <HeroKineticHeadline />,
  subCopy = BUYER_SUBCOPY,
  cta = BUYER_CTA,
  productWindow = <HeroProductWindow />,
  productLead,
}: HeroContent = {}) {
  const trackRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end end'],
  });

  // ⚠ 모든 맵은 입력 구간을 1까지 명시한다. motion v12는 스크롤 연동 opacity를 WAAPI로
  // 가속하면서 offset 1.0에 '요소의 인라인 값'으로 암묵적 최종 키프레임을 추가하므로,
  // 구간이 중간에서 끝나면(예: [0.1, 0.32]) 그 뒤로 값이 인라인 값(1)으로 '되살아난다'.
  const headlineY = useTransform(scrollYProgress, [0.1, 0.4, 1], [0, -120, -120]);
  const headlineOpacity = useTransform(scrollYProgress, [0.1, 0.32, 1], [1, 0, 0]);
  const subY = useTransform(scrollYProgress, [0.1, 0.4, 1], [0, -80, -80]);
  const subOpacity = useTransform(scrollYProgress, [0.13, 0.35, 1], [1, 0, 0]);
  const ctaY = useTransform(scrollYProgress, [0.1, 0.4, 1], [0, -48, -48]);
  const ctaOpacity = useTransform(scrollYProgress, [0.16, 0.38, 1], [1, 0, 0]);
  // 페이드아웃(0.38)된 뒤에도 opacity:0 요소는 클릭을 가로채므로, 포인터 이벤트를
  // 스크롤 진행도에 연동해 CTA가 사라지면 클릭 대상에서도 제외한다(뒤 제품 창 위 오클릭 방지).
  const ctaPointerEvents = useTransform(scrollYProgress, (v) => (v > 0.38 ? 'none' : 'auto'));

  const windowY = useTransform(scrollYProgress, [0.06, 0.68, 1], ['82%', '0%', '0%']);
  const windowRotateX = useTransform(scrollYProgress, [0.06, 0.68, 1], [16, 0, 0]);
  const windowScale = useTransform(scrollYProgress, [0.06, 0.68, 1], [0.94, 1, 1]);

  // 제품 창 위 리드 카피 — 창이 정착(0.68)한 직후 라이트 리빌 구간에 페이드+라이즈로 등장해
  // 창과 함께 자리잡는다(다크 씬에서는 opacity 0 이라 헤드라인과 겹치지 않는다).
  const leadOpacity = useTransform(scrollYProgress, [0.66, 0.86, 1], [0, 1, 1]);
  const leadY = useTransform(scrollYProgress, [0.66, 0.86, 1], [24, 0, 0]);

  const darkOpacity = useTransform(scrollYProgress, [0.55, 0.85, 1], [1, 0, 0]);
  const cueOpacity = useTransform(scrollYProgress, [0, 0.06, 1], [1, 0, 0]);

  const [magnetRef, magnetX, magnetY] = useMagneticHover<HTMLSpanElement>(6);

  // 헤더 톤 스위치 — 다크 레이어 페이드(0.55–0.85) 중간점을 지나면 헤더가 라이트 톤으로 복귀.
  // 마운트 직후 동기화가 있어 앵커 딥링크(#pricing 등)로 진입해도 헤더가 올바른 톤에서 시작한다.
  const TONE_SWITCH = 0.7;
  const setOverDark = useHeroToneStore((s) => s.setOverDark);
  useMotionValueEvent(scrollYProgress, 'change', (v) => setOverDark(v < TONE_SWITCH));
  useEffect(() => {
    setOverDark(scrollYProgress.get() < TONE_SWITCH);
  }, [scrollYProgress, setOverDark]);

  return (
    // main의 pt-[--shell-topbar]를 상쇄해 다크 씬이 투명 헤더 아래까지 풀블리드로 깔린다.
    <section
      ref={trackRef}
      aria-label="서비스 소개"
      className="relative -mt-[var(--shell-topbar)]"
      style={{ height: `${TRACK_VH}vh` }}
    >
      {/* sticky 씬 — 조상에 transform이 있으면 sticky가 죽으므로 트랙·씬에는 transform을 두지
          않고, 모든 모션은 씬 내부 자식에만 건다. 높이는 dvh: svh 고정이면 모바일 주소창이
          접힐 때 (lvh−svh)만큼 씬 아래로 라이트 배경 띠가 노출된다. */}
      <div className="sticky top-0 h-dvh overflow-hidden bg-[var(--md-sys-color-surface)]">
        {/* 다크 오프닝 레이어 — 후반부 opacity 페이드로 라이트 리빌(배경색 보간 대신 레이어
            페이드: 토큰 네이티브 + GPU-cheap). 배경은 ASCII 문자 필드: 커서 궤적을 따라
            문자가 깨어나고, 은은한 블룸은 §9(블러 금지)의 사용자 승인 예외(랜딩 히어로 한정). */}
        <motion.div
          aria-hidden
          style={{ opacity: darkOpacity }}
          className="absolute inset-0 z-0 bg-[var(--md-sys-color-inverse-surface)]"
        >
          <HeroAsciiField scrollYProgress={scrollYProgress} />
        </motion.div>

        {/* 텍스트 블록 — 스크롤 transform(외부)과 진입 모션(내부)을 분리해 충돌을 피한다 */}
        <div className="relative z-20 mx-auto flex w-full max-w-[1080px] flex-col gap-[var(--s-7)] px-8 pt-[calc(var(--shell-topbar)+9svh)]">
          <motion.div style={{ y: headlineY, opacity: headlineOpacity }}>
            {headline}
          </motion.div>

          <motion.div style={{ y: subY, opacity: subOpacity }}>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.34, ease: EASE_OUT }}
              className={`max-w-[920px] text-pretty ${LANDING_TYPE.lead} text-[var(--md-sys-color-inverse-on-surface)]/72`}
            >
              {subCopy}
            </motion.p>
          </motion.div>

          <motion.div style={{ y: ctaY, opacity: ctaOpacity, pointerEvents: ctaPointerEvents }}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.36, delay: 0.5, ease: EASE_OUT }}
              className="flex flex-col items-start gap-[var(--s-4)]"
            >
              {/* 마그네틱 호버(±6px, pointer:fine 전용) 래퍼만 씬이 소유한다. 다크 씬 대비를
                  위한 토큰 반전은 각 CTA 노드가 스스로 책임진다(구매사 기본=BUYER_CTA,
                  PG=on-dark 버튼). */}
              <motion.span
                ref={magnetRef}
                style={{ x: magnetX, y: magnetY }}
                className="inline-block"
              >
                {cta}
              </motion.span>
            </motion.div>
          </motion.div>
        </div>

        {/* 스크롤 큐 — 첫 스크롤과 함께 사라진다 */}
        <motion.div
          aria-hidden
          style={{ opacity: cueOpacity }}
          className="pointer-events-none absolute inset-x-0 bottom-[9svh] z-30 flex flex-col items-center gap-1 text-[var(--md-sys-color-inverse-on-surface)]/60"
        >
          <span className="font-mono text-xs tracking-[0.18em] uppercase">Scroll</span>
          <motion.span
            animate={{ y: [0, 4, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ChevronDownIcon size={14} />
          </motion.span>
        </motion.div>

        {/* 제품 창 — 어둠 속에서 떠올라 자리잡는 라이트 앱 창. 창 위 리드 카피(선택)는 같은
            레이어에 세로로 쌓아 창 바로 위에 두되, 자체 페이드+라이즈로 라이트 리빌 때 등장한다. */}
        <div className="pointer-events-none absolute inset-x-4 bottom-[-4svh] z-10 flex flex-col items-center md:inset-x-8">
          {productLead && (
            <motion.div
              style={{ opacity: leadOpacity, y: leadY }}
              className="mb-[var(--s-7)] w-full max-w-[1080px] px-2"
            >
              {productLead}
            </motion.div>
          )}
          <motion.div
            style={{
              y: windowY,
              rotateX: windowRotateX,
              scale: windowScale,
              transformPerspective: 1200,
            }}
            className="h-[min(68svh,680px)] w-full max-w-[1080px] origin-top will-change-transform"
          >
            {productWindow}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
