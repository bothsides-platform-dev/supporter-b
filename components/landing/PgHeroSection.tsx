'use client';

import { useEffect } from 'react';
import { motion } from 'motion/react';
import { useCrossFadeRotation } from './useCrossFadeRotation';
import { ConsultButton } from './ConsultButton';
import { LANDING_TYPE } from '@/components/landing/landing-type';

// 번갈아 노출되는 두 메인 카피(값 제안 라인). 브랜드("Supporter B")는 고정.
const HERO_LEADS = [
  '성장하는 신규 가맹점을\n가장 빠르게 만나는 파트너 채널',
  '확실하게 도입 의사가 있는 가맹점을\n가장 빠르게 만나는 파트너 채널',
];

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const heroType =
  'text-[clamp(28px,4.6vw,60px)] leading-[1.1] tracking-[-0.026em] font-medium break-keep';

export function PgHeroSection() {
  const active = useCrossFadeRotation(HERO_LEADS.length, 4200);

  // buyer 랜딩과 동일하게 스무스 스크롤(.landing-scroll)을 켠다.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('landing-scroll');
    return () => root.classList.remove('landing-scroll');
  }, []);

  return (
    <section className="relative overflow-hidden px-8 py-[var(--s-11)] min-h-[calc(100svh-var(--shell-topbar))] flex items-center border-b border-[var(--md-sys-color-outline-variant)]">
      <div className="mx-auto w-full max-w-[1080px] flex flex-col gap-[var(--s-8)]">
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.44, delay: 0.06, ease: EASE_OUT }}
          className={`${heroType} flex flex-col gap-[var(--s-2)] text-[var(--md-sys-color-on-surface)]`}
        >
          {/* 두 리드 카피를 같은 셀에 쌓아 크로스페이드 */}
          <span className="relative grid">
            {HERO_LEADS.map((lead, i) => (
              <motion.span
                key={lead}
                aria-hidden={i !== active}
                initial={{ opacity: i === 0 ? 1 : 0 }}
                animate={{ opacity: i === active ? 1 : 0 }}
                transition={{ duration: 0.6, ease: EASE_OUT }}
                className="[grid-area:1/1] whitespace-pre-line"
              >
                {lead}
              </motion.span>
            ))}
          </span>
          <span className="text-[var(--md-sys-color-primary)]">Supporter B</span>
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.28, ease: EASE_OUT }}
          className="flex flex-col gap-[var(--s-6)]"
        >
          <p className={`${LANDING_TYPE.lead} text-[var(--md-sys-color-on-surface-variant)]`}>
            고객사가 거래 조건을 직접 정리해 견적을 요청하면, 조건이 맞는 파트너 PG사에게 그대로 전달됩니다.
            <br />
            리드 발굴과 자격 검증에 쓰던 시간을 아끼고, 수주 가능성이 높은 기회부터 제안하세요.
          </p>
          <div>
            <ConsultButton>파트너 상담 신청 →</ConsultButton>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
