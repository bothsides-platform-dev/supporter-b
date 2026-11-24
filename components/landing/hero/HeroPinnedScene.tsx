'use client';
import { QuoteStartLink } from '@/components/landing/QuoteStartLink';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { ConsultButton } from '@/components/landing/ConsultButton';
import { ChevronDownIcon } from '@/components/icons';
import { LANDING_TYPE } from '@/components/landing/landing-type';
import { EASE_OUT } from '@/lib/landing/ease';
import { HeroAsciiField } from './HeroAsciiField';
import { HeroKineticHeadline } from './HeroKineticHeadline';
import { HeroProductWindow } from './HeroProductWindow';
import { useMagneticHover } from './useMagneticHover';
import styles from './HeroPinnedScene.module.css';

// 히어로 핀 트랙 길이. 240vh = 첫 화면 → 제품 창 부상 → 정착까지 약 1.4 뷰포트 분량의
// 스크롤 스토리. ScrollPinnedSection과 같은 sticky 방식(스크롤 하이재킹 없음)이지만, 헤더 아래까지
// 깔리는 풀블리드 씬(top-0·섹션 컨테이너 없음)이 필요해 트랙을 히어로 전용으로 둔다.
// 씬 바탕은 페이지와 같은 surface 다 — 스크롤 중 라이트·다크 전환은 없다(2026-11-23 사용자 결정).
const TRACK_VH = 240;
const PRODUCT_WINDOW_SETTLE_PROGRESS = 0.68;

// 스크롤 진행(0→1) 구간별 연출 타임라인. 수치는 눈 튜닝 대상.
//  0.00–0.06  스크롤 큐 페이드아웃(Phase B)
//  0.10–0.40  텍스트 이탈 패럴랙스(요소별 속도 차등)
//  0.06–0.68  제품 창 부상(y·rotateX·scale)
//  0.00–0.68  구매사 로고·제품 창 공통 수직 이동
//  0.06–0.68  구매사 제품 창 기울기·스케일 정착(rotateX·scale — y는 공통 이동이 소유)
//  0.66–0.86  PG 제품 창 위 리드 카피 등장

// 히어로 콘텐츠 슬롯 — 구매사 기본값을 두고 PG 히어로가 같은 씬(ASCII 배경·제품 창 부상)을
// 자기 카피/목업으로 재사용한다. 값 미지정 시 기존 구매사 히어로와 동일하다.
export type HeroContent = {
  headline?: ReactNode;
  subCopy?: ReactNode;
  cta?: ReactNode;
  productWindow?: ReactNode;
  /** 제품 창 바로 위 리드 카피(선택). 창이 정착할 때 함께 페이드+라이즈로 자리잡는다.
   *  PG 히어로만 주입 — 구매사 히어로는 미지정(렌더 안 함). */
  productLead?: ReactNode;
  /** 구매사 히어로 하단의 제휴 PG사 로고 띠. 미지정 시 기존 Scroll 큐. */
  partners?: ReactNode;
};

const BUYER_SUBCOPY = (
  <>
    우리 업종과 거래 조건에 맞는 PG사에 상담을 요청하고, 받은 견적을 확인해요.
    <br />
    수수료부터 정산주기, 보증보험, 가입비까지 살펴본 뒤 직접 결정할 수 있어요.
  </>
);

const BUYER_CTA = (
  <span className={styles.actions}>
    <QuoteStartLink className={styles.primaryAction}>
      PG 무료 견적 받기
    </QuoteStartLink>
    <ConsultButton variant="secondary" className="h-12 min-w-0 flex-1 px-4 font-sans text-sm leading-[inherit] font-semibold tracking-normal normal-case sm:min-w-[188px] sm:flex-none sm:px-6">
      이용 문의
    </ConsultButton>
  </span>
);

export function HeroPinnedScene({
  headline = <HeroKineticHeadline rollingPosition="before" />,
  subCopy = BUYER_SUBCOPY,
  cta = BUYER_CTA,
  productWindow = <HeroProductWindow />,
  productLead,
  partners,
}: HeroContent = {}) {
  const trackRef = useRef<HTMLElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const measuredOverflowRef = useRef(0);
  const measuredViewportHeightRef = useRef(0);
  const [overflow, setOverflow] = useState(0);
  const hasPartners = Boolean(partners);
  // Short screens first scroll through the copy's natural height. Pin only once
  // the logos and window peek fit, then start the animation timeline.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!hasPartners || !scene) return;
    const measure = () => {
      const nextOverflow = Math.max(0, scene.offsetHeight - window.innerHeight);
      const previousOverflow = measuredOverflowRef.current;
      const previousViewportHeight = measuredViewportHeightRef.current;
      const nextViewportHeight = window.innerHeight;
      if (nextOverflow === previousOverflow && nextViewportHeight === previousViewportHeight) return;

      const track = trackRef.current;
      if (track && previousViewportHeight > 0) {
        const trackTop = track.getBoundingClientRect().top + window.scrollY;
        const currentStart = trackTop + previousOverflow;
        const currentDuration = (TRACK_VH / 100 - 1) * previousViewportHeight;
        const progress = (window.scrollY - currentStart) / currentDuration;
        // Preserve the current story position if responsive copy changes the
        // natural height while the pinned timeline is already in progress.
        if (progress >= 0 && progress <= 1) {
          const nextDuration = (TRACK_VH / 100 - 1) * nextViewportHeight;
          window.scrollTo({
            top: trackTop + nextOverflow + progress * nextDuration,
            behavior: 'instant',
          });
        }
      }

      measuredOverflowRef.current = nextOverflow;
      measuredViewportHeightRef.current = nextViewportHeight;
      setOverflow(nextOverflow);
    };
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(scene);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [hasPartners]);
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: [`start ${-overflow}px`, 'end end'],
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

  const windowY = useTransform(scrollYProgress, [0.06, PRODUCT_WINDOW_SETTLE_PROGRESS, 1], ['82%', '0%', '0%']);
  const windowRotateX = useTransform(scrollYProgress, [0.06, PRODUCT_WINDOW_SETTLE_PROGRESS, 1], [16, 0, 0]);
  const windowScale = useTransform(scrollYProgress, [0.06, PRODUCT_WINDOW_SETTLE_PROGRESS, 1], [0.94, 1, 1]);
  // CSS owns responsive geometry, so resizing keeps the same scroll progress
  // without a stale pixel measurement. At 0.68 the window meets the header gap.
  const buyerGroupY = useTransform(scrollYProgress, (value) =>
    `calc((var(--hero-header-bottom) + var(--hero-partners-gap) + var(--hero-peek) - 100dvh) * ${Math.min(Math.max(value / PRODUCT_WINDOW_SETTLE_PROGRESS, 0), 1)})`,
  );

  // 제품 창 위 리드 카피 — 창이 정착(0.68)한 직후 페이드+라이즈로 등장해 창과 함께 자리잡는다
  // (헤드라인이 남아 있는 동안에는 opacity 0 이라 겹치지 않는다).
  const leadOpacity = useTransform(scrollYProgress, [0.66, 0.86, 1], [0, 1, 1]);
  const leadY = useTransform(scrollYProgress, [0.66, 0.86, 1], [24, 0, 0]);

  const cueOpacity = useTransform(scrollYProgress, [0, 0.06, 1], [1, 0, 0]);

  const [magnetRef, magnetX, magnetY] = useMagneticHover<HTMLSpanElement>(6);

  return (
    // main의 pt-[--landing-header-height]를 상쇄해 씬이 헤더 아래까지 풀블리드로 깔린다.
    <section
      ref={trackRef}
      aria-label="서비스 소개"
      className="relative -mt-[var(--landing-header-height)]"
      style={{ height: `calc(${TRACK_VH}vh + ${overflow}px)` }}
    >
      {/* sticky 씬 — 조상에 transform이 있으면 sticky가 죽으므로 트랙·씬에는 transform을 두지
          않고, 모든 모션은 씬 내부 자식에만 건다. 높이는 dvh: svh 고정이면 모바일 주소창이
          접힐 때 (lvh−svh)만큼 씬 아래로 라이트 배경 띠가 노출된다. */}
      <div ref={sceneRef} style={{ top: -overflow }} className={`sticky top-0 h-dvh overflow-hidden bg-[var(--md-sys-color-surface)] ${partners ? styles.withPartners : ''}`}>
        {/* 배경 레이어 — 씬과 같은 surface 위의 ASCII 문자 필드. 커서 궤적을 따라 문자가 깨어나고,
            은은한 블룸은 §9(블러 금지)의 사용자 승인 예외(랜딩 히어로 한정). 아래쪽은 마스크로
            서서히 지워, 씬이 위로 빠질 때 커서 궤적·앰비언트 워시가 다음 섹션 앞에서 직선으로
            끊기지 않게 한다. */}
        <div aria-hidden className="absolute inset-0 z-0 [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]">
          <HeroAsciiField />
        </div>

        {/* 텍스트 블록 — 스크롤 transform(외부)과 진입 모션(내부)을 분리해 충돌을 피한다 */}
        <div className={`relative z-20 mx-auto flex w-full max-w-[1080px] flex-col gap-[var(--s-7)] px-8 pt-[calc(var(--landing-header-height)+9svh)] ${partners ? styles.content : ''}`}>
          <motion.div style={{ y: headlineY, opacity: headlineOpacity }}>
            {headline}
          </motion.div>

          <motion.div style={{ y: subY, opacity: subOpacity }}>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.34, ease: EASE_OUT }}
              className={`max-w-[920px] text-pretty ${LANDING_TYPE.lead} text-[var(--md-sys-color-on-surface-variant)]`}
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
              <motion.span
                ref={magnetRef}
                style={{ x: magnetX, y: magnetY }}
                className="inline-block w-full sm:w-auto"
              >
                {cta}
              </motion.span>
            </motion.div>
          </motion.div>
        </div>

        {partners ? (
          <>
            <div aria-hidden className={styles.peekSpace} />
            <div
              className={styles.buyerViewport}
              style={{ clipPath: `inset(calc(var(--hero-header-bottom) + ${overflow}px) 0 0)` }}
            >
              <motion.div style={{ y: buyerGroupY }} className={styles.buyerGroup}>
                <div className={styles.partners}>{partners}</div>
                <div className={styles.buyerProduct}>
                  <motion.div
                    style={{ rotateX: windowRotateX, scale: windowScale, transformPerspective: 1200 }}
                    className={`${styles.productWindow} w-full max-w-[1080px] origin-top will-change-transform`}
                  >
                    {productWindow}
                  </motion.div>
                </div>
              </motion.div>
            </div>
          </>
        ) : <motion.div
          aria-hidden
          style={{ opacity: cueOpacity }}
          className="pointer-events-none absolute inset-x-0 bottom-[9svh] z-30 flex flex-col items-center gap-1 text-[var(--md-sys-color-on-surface-variant)]"
        >
          <span className="font-mono text-xs tracking-[0.18em] uppercase">Scroll</span>
          <motion.span
            animate={{ y: [0, 4, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ChevronDownIcon size={14} />
          </motion.span>
        </motion.div>}

        {/* 제품 창 — 화면 아래에서 떠올라 자리잡는 앱 창. 창 위 리드 카피(선택)는 같은
            레이어에 세로로 쌓아 창 바로 위에 두되, 창이 정착할 때 자체 페이드+라이즈로 등장한다. */}
        {!partners && <div className="pointer-events-none absolute inset-x-4 bottom-[-4svh] z-10 flex flex-col items-center md:inset-x-8">
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
              opacity: 1,
              y: windowY,
              rotateX: windowRotateX,
              scale: windowScale,
              transformPerspective: 1200,
            }}
            className="h-[min(68svh,680px)] w-full max-w-[1080px] origin-top will-change-transform"
          >
            {productWindow}
          </motion.div>
        </div>}
      </div>
    </section>
  );
}
