'use client';

import { Fragment, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { SupportBWordmark } from '@/components/primitives/Logo';
import { EASE_OUT } from '@/lib/landing/ease';
import { WordMaskRoll } from './WordMaskRoll';

const TYPING_VALUES = [
  'PG 수수료를 낮출 기회를',
  '한눈에 보는 계약 조건을',
  '내가 결정하는 PG 계약을',
];

// 헤드라인용 서포트B 워드마크. 파티클까지 같은 단어로 묶어
// "서포트B를/로"가 줄바꿈 없이 한 덩어리로 읽히게 한다.
export function BrandWordB({ particle }: { particle: string }) {
  return <SupportBWordmark particle={particle} colorVar="--md-sys-color-inverse-on-surface" />;
}

const LINE1_WORDS: ReactNode[] = [<BrandWordB key="support-b" particle="가" />];

const headlineCls =
  'text-[clamp(30px,5.5vw,72px)] max-md:text-[clamp(22px,7.2vw,34px)] leading-[1.06] tracking-[-0.028em] font-medium break-keep';

// 단어별 마스크 리빌 — overflow-hidden 마스크 안에서 글자가 아래에서 솟아오른다(키네틱 타이포).
// 마스크에 살짝 세로 여유(pb/-mb)를 줘 정착 후 글리프가 잘리지 않게 한다.
function MaskedWord({ word, delay }: { word: ReactNode; delay: number }) {
  return (
    <span className="inline-block overflow-hidden align-top pb-[0.08em] -mb-[0.08em]">
      <motion.span
        initial={{ y: '112%' }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, delay, ease: EASE_OUT }}
        className="inline-block will-change-transform"
      >
        {word}
      </motion.span>
    </span>
  );
}

// 강조 문구는 독립된 줄에서 리빌한다. 짧은 문구의 남는 공간이 문장 사이가 아닌
// 행 끝에 놓이도록 고정 동사는 위쪽 브랜드 문장에 포함한다.
function MaskedLine({ children, delay }: { children: ReactNode; delay: number }) {
  return (
    <span className="block overflow-hidden pb-[0.08em] -mb-[0.08em]">
      <motion.span
        initial={{ y: '112%' }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, delay, ease: EASE_OUT }}
        className="block will-change-transform"
      >
        {children}
      </motion.span>
    </span>
  );
}

// 다크 오프닝 씬 위의 헤드라인 — 색은 inverse-* 토큰(라이트 테마에서 near-black 위 라이트 텍스트,
// 다크 테마에서는 반전)으로 해석돼 파이널 CTA 인버티드 섹션과 같은 규칙을 따른다.
// 카피는 구매사 기본값을 프롭으로 두어(값 미지정 시 기존과 동일) PG 히어로가 자기 문구로 재사용한다.
export function HeroKineticHeadline({
  line1Words = LINE1_WORDS,
  phrases = TYPING_VALUES,
  suffix = '만듭니다.',
}: {
  line1Words?: ReactNode[];
  phrases?: string[];
  suffix?: string;
} = {}) {
  return (
    <h1
      className={`${headlineCls} flex flex-col gap-[0.12em] text-[var(--md-sys-color-inverse-on-surface)]`}
    >
      <span className="block">
        {line1Words.map((word, i) => (
          <Fragment key={i}>
            <MaskedWord word={word} delay={0.08 + i * 0.07} />
            {i < line1Words.length - 1 ? ' ' : null}
          </Fragment>
        ))}{' '}
        <MaskedWord word={suffix} delay={0.08 + line1Words.length * 0.07} />
      </span>{' '}
      <MaskedLine delay={0.32}>
        <WordMaskRoll phrases={phrases} className="text-[var(--md-sys-color-inverse-primary)]" />
      </MaskedLine>
    </h1>
  );
}
