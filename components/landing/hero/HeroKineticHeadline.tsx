'use client';

import { Fragment, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { BrandMark } from '@/components/primitives/Logo';
import { EASE_OUT } from '@/lib/landing/ease';
import { ScrambleText } from './ScrambleText';

const TYPING_VALUES = [
  '협상의 주도권을',
  '연간 수천만 원의 절감을',
  '정보 비대칭 없는 계약을',
  'PG사 간 공정한 경쟁을',
  '5분짜리 경쟁 입찰을',
];

// "B" 글자 자리에 브랜드 마크를 넣은 로고 락업. 실제 "B" 텍스트는 sr-only로 남겨
// 스크린리더·텍스트 검색(toHaveTextContent 등)에서는 그대로 "B"로 읽히고,
// 화면에는 마크 아이콘이 대신 보인다. 아이콘은 폰트 크기에 비례하는 em 단위라
// 헤드라인의 반응형 clamp() 크기를 그대로 따라간다.
export function BrandWordB({ particle }: { particle: string }) {
  return (
    <span className="inline-flex items-baseline">
      <span className="sr-only">B</span>
      <BrandMark
        size="0.82em"
        className="inline-block translate-y-[0.15em]"
        colorVar="--md-sys-color-inverse-on-surface"
        strokeWidth={100}
      />
      {particle}
    </span>
  );
}

const LINE1_WORDS: ReactNode[] = ['서포트', <BrandWordB key="b" particle="를" />, '통해'];

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

// 줄 단위 마스크 리빌 — 순환 문구와 "만듭니다."를 각자 독립된 마스크로 감싼다. 데스크톱은
// md:flex-row로 한 줄에 나란히 놓이고(둘 다 같은 delay라 동시에 리빌되어 기존과 동일하게
// 보인다), 모바일은 flex-col로 각자 자기 줄이 되어 문구 길이 차이가 다른 줄의 줄바꿈에
// 영향을 주지 않는다.
function MaskedLine({ children, delay }: { children: ReactNode; delay: number }) {
  return (
    <div className="overflow-hidden pb-[0.08em] -mb-[0.08em]">
      <motion.div
        initial={{ y: '112%' }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, delay, ease: EASE_OUT }}
        className="will-change-transform"
      >
        {children}
      </motion.div>
    </div>
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
    <div className="flex flex-col gap-0">
      <h1 className={`${headlineCls} text-[var(--md-sys-color-inverse-on-surface)]`}>
        {line1Words.map((word, i) => (
          <Fragment key={i}>
            <MaskedWord word={word} delay={0.08 + i * 0.07} />
            {i < line1Words.length - 1 ? ' ' : null}
          </Fragment>
        ))}
      </h1>
      <div
        className={`${headlineCls} flex flex-col md:flex-row md:flex-wrap md:items-baseline md:gap-x-2`}
      >
        <MaskedLine delay={0.32}>
          <ScrambleText
            phrases={phrases}
            className="whitespace-nowrap text-[var(--md-sys-color-inverse-primary)]"
          />
        </MaskedLine>
        <MaskedLine delay={0.32}>
          <span className="text-[var(--md-sys-color-inverse-on-surface)]">{suffix}</span>
        </MaskedLine>
      </div>
    </div>
  );
}
